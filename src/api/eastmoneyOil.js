/**
 * 发改委历史油价（东方财富数据中心）
 *
 * 数据：`datacenter-web.eastmoney.com` 的公开报表接口（AKShare 同款参数）
 * - RPTA_WEB_YJ_BD：历次调价时间线（调价日 + 汽/柴油基准价 元/吨 + 涨跌幅）
 * - RPTA_WEB_YJ_JH：指定调价日的全国 31 省油价（92/95/89 汽油 + 0# 柴油，含涨跌）
 *
 * 该域名**没有 CORS 头**，但支持 **JSONP**（`callback=` 参数），用 script 标签加载即可绕过。
 * 注意：数据集不含 98#；明细只按"调价日"查询（任意日期取 ≤ 它的最近一次调价）。
 */
import { normalizeProvinceName } from '../utils/oilPrice'

const BASE = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const TOKEN = '894050c76af8597a853f5b408b759f5d'

let seq = 0

/** JSONP 加载器 */
export function jsonp(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const name = `__em_cb_${Date.now()}_${seq++}`
    const script = document.createElement('script')
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      cleanup()
      reject(new Error('请求超时'))
    }, timeout)
    const cleanup = () => {
      clearTimeout(timer)
      // 不删除回调本身：超时后脚本可能仍会返回，置成空函数避免 ReferenceError
      try { window[name] = () => {} } catch (e) { /* ignore */ }
      script.remove()
    }
    window[name] = data => {
      if (done) return
      done = true
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      if (done) return
      done = true
      cleanup()
      reject(new Error('网络请求失败'))
    }
    script.src = `${url}&callback=${name}`
    document.head.appendChild(script)
  })
}

/** JSONP 失败自动重试一次 */
export function jsonpRetry(url, timeout) {
  return jsonp(url, timeout).catch(e => jsonp(url, timeout))
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** 历次调价时间线（按日期升序）：[{ date, gasolinePerTon, dieselPerTon, gasolineChange, dieselChange }] */
export function mapEmAdjustmentRows(rows) {
  return (rows || [])
    .map(r => ({
      date: String(r.DIM_DATE || '').slice(0, 10),
      gasolinePerTon: num(r.VALUE),
      dieselPerTon: num(r.CY_JG),
      gasolineChange: num(r.QY_FD),
      dieselChange: num(r.CY_FD)
    }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.gasolinePerTon !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** 某调价日的全国分省明细 → [{ province, gasoline92, gasoline95, diesel0 }] */
export function mapEmDetailRows(rows) {
  return (rows || [])
    .map(r => ({
      province: String(r.CITYNAME || '').trim(),
      gasoline92: num(r.V92),
      gasoline95: num(r.V95),
      diesel0: num(r.V0)
    }))
    .filter(r => r.province)
}

/** 在调价时间线里找 ≤ date 的最近一次调价日 */
export function findAdjustmentDate(adjustments, date) {
  let hit = null
  for (const a of adjustments) {
    if (a.date <= date) hit = a.date
    else break
  }
  return hit
}

const ADJ_CACHE_KEY = 'fc_em_adjustments'
const ADJ_CACHE_TTL = 24 * 60 * 60 * 1000
const DETAIL_CACHE_PREFIX = 'fc_em_detail_'
const DETAIL_CACHE_TTL = 30 * 24 * 60 * 60 * 1000

function readCache(key, ttl) {
  try {
    const raw = localStorage.getItem(key)
    const obj = raw ? JSON.parse(raw) : null
    if (obj && obj.fetchedAt && Date.now() - obj.fetchedAt < ttl && Array.isArray(obj.rows)) {
      return obj.rows
    }
  } catch (e) {
    // 缓存不可用则直接取
  }
  return null
}

function writeCache(key, rows) {
  try {
    localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), rows }))
  } catch (e) {
    // 写入失败不影响主流程
  }
}

/** 历次调价时间线（24h 缓存） */
export async function fetchEmAdjustments() {
  const cached = readCache(ADJ_CACHE_KEY, ADJ_CACHE_TTL)
  if (cached) return cached
  const json = await jsonpRetry(
    `${BASE}?reportName=RPTA_WEB_YJ_BD&columns=ALL&sortColumns=dim_date&sortTypes=-1` +
      `&token=${TOKEN}&pageNumber=1&pageSize=500&source=WEB`
  )
  const rows = mapEmAdjustmentRows((json && json.result && json.result.data) || [])
  if (rows.length) writeCache(ADJ_CACHE_KEY, rows)
  return rows
}

/** 某调价日的全国分省明细（30 天缓存：历史数据是事实，不会变） */
export async function fetchEmProvinceDetail(dateStr) {
  const d = String(dateStr).slice(0, 10)
  const cached = readCache(DETAIL_CACHE_PREFIX + d, DETAIL_CACHE_TTL)
  if (cached) return cached
  const json = await jsonpRetry(
    `${BASE}?reportName=RPTA_WEB_YJ_JH&columns=ALL&filter=${encodeURIComponent(`(dim_date='${d}')`)}` +
      `&sortColumns=cityname&sortTypes=1&token=${TOKEN}&pageNumber=1&pageSize=120&source=WEB`
  )
  const rows = mapEmDetailRows((json && json.result && json.result.data) || [])
  if (rows.length) writeCache(DETAIL_CACHE_PREFIX + d, rows)
  return rows
}

/**
 * 取某省在指定日期生效的油价（自动定位最近一次调价日）
 * @returns {Promise<{ok:boolean, adjustDate?:string, rows?:Array<{fuelType:string,price:number,since:string}>, reason?:string, message?:string}>}
 */
export async function getHistoricalFromEm(province, date) {
  const target = normalizeProvinceName(province)
  if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return { ok: false, reason: 'bad-input', message: '省份或日期缺失' }
  }
  const adjustments = await fetchEmAdjustments()
  if (!adjustments.length) {
    return { ok: false, reason: 'no-adjustments', message: '调价时间线获取失败' }
  }
  const adjustDate = findAdjustmentDate(adjustments, date)
  if (!adjustDate) {
    return { ok: false, reason: 'too-early', message: '该日期早于最早调价记录' }
  }
  const rows = await fetchEmProvinceDetail(adjustDate)
  const row = rows.find(r => normalizeProvinceName(r.province) === target)
  if (!row) {
    return { ok: false, reason: 'no-province', message: '该省数据缺失' }
  }
  const out = []
  if (row.gasoline92 !== null) out.push({ fuelType: '92#', price: row.gasoline92, since: adjustDate, source: 'eastmoney' })
  if (row.gasoline95 !== null) out.push({ fuelType: '95#', price: row.gasoline95, since: adjustDate, source: 'eastmoney' })
  if (row.diesel0 !== null) out.push({ fuelType: '柴油', price: row.diesel0, since: adjustDate, source: 'eastmoney' })
  if (!out.length) return { ok: false, reason: 'no-data', message: '该日期无油价数据' }
  return { ok: true, adjustDate, rows: out }
}
