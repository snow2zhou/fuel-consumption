/**
 * 油价数据获取（多数据源 + 本地缓存）
 *
 * - 数据源由 `src/api/oilSources.js` 提供（内置 4 个 + 用户自定义）；
 * - 当前使用哪个源由 `settings.oilSourceId` 决定，可在设置或油价页切换；
 * - 每个来源/省份单独缓存 6 小时，失败可回退过期缓存；
 * - 手动录入源不联网，读取 `settings.manualPrices`。
 */
import { settingsRepo, readOilSources } from './storage'
import { recordPriceSnapshot, recordManualPrice, getPriceHistory } from './oilHistory'
import { allSources, getSource, fetchFromSource, KIND } from './oilSources'
import { fuelKeyOf, fuelKindOf, ensureNextAdjustment, nextWindowFrom } from '../utils/oilPrice'
import { getCrudeForecast } from './crudeForecast'
import { todayLocalDate } from './models'

const CACHE_PREFIX = 'fc_oil_price_'
export const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 小时

/** 全国 31 个省级行政区（不含港澳台，价格机制不同） */
export const PROVINCES = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'
]

const inflight = new Map()

function cacheKey(sourceId, province) {
  return `${CACHE_PREFIX}${sourceId}_${province}`
}

function readCache(sourceId, province) {
  try {
    const raw = localStorage.getItem(cacheKey(sourceId, province))
    if (!raw) return null
    const obj = JSON.parse(raw)
    return obj && obj.data ? obj : null
  } catch (e) {
    return null
  }
}

function writeCache(sourceId, province, data) {
  try {
    localStorage.setItem(cacheKey(sourceId, province), JSON.stringify({ cachedAt: Date.now(), data }))
  } catch (e) {
    // 写入失败不影响主流程
  }
}

/** 全部数据源（内置 + 自定义） */
export function getOilSources() {
  return allSources(readOilSources())
}

/** 当前激活的数据源 id */
export function getActiveSourceId() {
  return settingsRepo.get().oilSourceId || 'apizero'
}

/** 某个数据源的凭据（兼容旧字段 oilApiKey） */
export function getSourceCreds(sourceId) {
  const s = settingsRepo.get()
  const creds = { ...((s.oilSourceCreds || {})[sourceId] || {}) }
  if (sourceId === 'apizero' && !creds.apiKey && s.oilApiKey) creds.apiKey = s.oilApiKey
  return creds
}

/**
 * 读取某省缓存（同步，用于地区列表展示已查过的价格）
 */
export function getCachedOilPrice(province, sourceId = getActiveSourceId()) {
  const c = readCache(sourceId, province)
  if (!c) return null
  return {
    ...c.data,
    fetchedAt: c.cachedAt,
    stale: Date.now() - c.cachedAt > CACHE_TTL
  }
}

/** 读取手动录入的油价 */
export function getManualPrice(province, fuelType) {
  const s = settingsRepo.get()
  const item = (s.manualPrices || {})[`${province}|${fuelType}`]
  if (!item || !(Number(item.price) > 0)) return null
  return { price: Number(item.price), date: item.date || '' }
}

/**
 * 保存手动录入的油价，并写入价格历史
 * @returns {{price:number, date:string}}
 */
export function saveManualPrice(province, fuelType, price) {
  const n = Number(price)
  const date = todayLocalDate()
  const s = settingsRepo.get()
  const manualPrices = {
    ...(s.manualPrices || {}),
    [`${province}|${fuelType}`]: { price: n, date }
  }
  settingsRepo.save({ manualPrices })
  try {
    recordManualPrice(province, fuelType, n)
  } catch (e) {
    // 历史写入失败不影响主流程
  }
  return { price: n, date }
}

/** 当前价格（按生效日最新一条）的生效日，作为自算测算的周期起点 */
function latestPriceDate(province, fuelType) {
  try {
    const h = getPriceHistory(province, fuelType)
    return h.length ? String(h[h.length - 1].date || '').slice(0, 10) : ''
  } catch (e) {
    return ''
  }
}

/** 来源没给调价测算时，用国际原油自算一个（`forecast.derived = true`） */
export async function attachCrudeForecast(data, province) {
  if (!data || (data.forecast && data.forecast.perTon !== null && data.forecast.perTon !== undefined)) {
    return data
  }
  const fuelType = settingsRepo.get().preferredFuelType || '92#'
  const anchor = data.priceDate || latestPriceDate(province, fuelType)
  if (!anchor) return data

  const f = await getCrudeForecast({ cycleStart: anchor, today: todayLocalDate() })
  if (!f) return data

  const next = { ...data, forecast: { ...f, derived: true } }
  if (!next.nextAdjustment && f.cycleStart) {
    next.nextAdjustment = nextWindowFrom(f.cycleStart)
  }
  return next
}

/** 给 Promise 加超时：超时返回 null（不取消底层请求，结果会进缓存） */
function raceTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
  ])
}

/**
 * 获取指定省份油价
 * @param {string} province
 * @param {{force?:boolean, sourceId?:string}} options
 * @returns {Promise<{
 *   ok:boolean, data?:Object, fromCache?:boolean, fromManual?:boolean,
 *   sourceId?:string, sourceName?:string, error?:string, code?:any,
 *   quota?:boolean, authFailed?:boolean, needCreds?:boolean,
 *   parseFailed?:boolean, pageOnly?:boolean, manual?:boolean, fallbackUrl?:string
 * }>}
 */
export async function fetchOilPrice(province, options = {}) {
  const { force = false } = options
  if (!province) return { ok: false, error: '未选择地区' }

  const sid = options.sourceId || getActiveSourceId()
  const source = getSource(sid, readOilSources())

  // 手动录入源：不联网
  if (source.kind === KIND.MANUAL) {
    const fuelType = settingsRepo.get().preferredFuelType || '92#'
    const stored = getManualPrice(province, fuelType)
    if (stored) {
      return {
        ok: true,
        fromManual: true,
        sourceId: sid,
        sourceName: source.name,
        data: {
          province,
          updateDate: stored.date,
          prices: { [fuelKeyOf(fuelType)]: stored.price },
          nextAdjustment: null,
          forecast: {},
          fetchedAt: Date.now(),
          manual: true
        }
      }
    }
    return { ok: false, manual: true, sourceId: sid, sourceName: source.name }
  }

  const cached = readCache(sid, province)
  if (!force && cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return {
      ok: true,
      fromCache: true,
      sourceId: sid,
      sourceName: source.name,
      data: ensureNextAdjustment({ ...cached.data, fetchedAt: cached.cachedAt, stale: false })
    }
  }

  const jobKey = `${sid}|${province}`
  if (!force && inflight.has(jobKey)) return inflight.get(jobKey)

  const job = (async () => {
    const res = await fetchFromSource(source, province, getSourceCreds(sid))
    if (res.ok) {
      // 来源没给下次窗口时，按"生效日 + 10 个工作日"推算一个（界面会标注"推算"）
      let data = ensureNextAdjustment(res.data)
      // 来源没给调价测算时，用国际原油自算一个；**最多等 1.2s**，
      // 超时则先返回油价（自算在后台继续，结果进缓存，界面随后异步补上）
      try {
        data = (await raceTimeout(attachCrudeForecast(data, province), 1200)) || data
      } catch (e) {
        // 自算失败不影响油价展示
      }
      writeCache(sid, province, data)
      try {
        recordPriceSnapshot(data)
      } catch (e) {
        // 历史记录失败不影响主流程
      }
      return { ok: true, data, sourceId: sid, sourceName: source.name }
    }
    return {
      ...res,
      sourceId: sid,
      sourceName: source.name,
      data: cached ? { ...cached.data, fetchedAt: cached.cachedAt, stale: true } : null
    }
  })().finally(() => inflight.delete(jobKey))

  inflight.set(jobKey, job)
  return job
}

/** 清空所有省份/数据源缓存 */
export function clearOilPriceCache() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
    return keys.length
  } catch (e) {
    return 0
  }
}
