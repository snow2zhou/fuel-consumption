/**
 * 自算调价测算（用国际原油行情 + 发改委规则）
 *
 * 为什么存在：带"调价测算"的免费 API 只有极数本源一家（匿名 5 次/天）。
 * 有了这个引擎，**任何来源**查到价格后都能补上"预计涨跌 / 变化率 / 倒计时"，
 * 且全部本地计算、离线可缓存。
 *
 * 数据源（均实测 `Access-Control-Allow-Origin: *`）：
 * - 东方财富 K 线：布伦特当月连续(112.B00Y)、NYMEX 原油(102.CL00Y)
 * - 汇率：open.er-api.com（失败时用 7.1 兜底）
 */
import { computeForecastFromKlines } from '../utils/oilPrice'

const KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const FX_URL = 'https://open.er-api.com/v6/latest/USD'
const CACHE_KEY = 'fc_crude_forecast'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 小时

const SECID_BRENT = '112.B00Y'
const SECID_WTI = '102.CL00Y'
const FALLBACK_FX = 7.1

async function fetchJson(url, timeout = 10000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** 东方财富日 K：`data.klines = ['2026-10-29,110.35', ...]` → `[{date, close}]` */
async function fetchKlines(secid) {
  const json = await fetchJson(
    `${KLINE_URL}?secid=${secid}&klt=101&fqt=0&lmt=45&end=20500101&fields1=f1,f2,f3&fields2=f51,f53`
  )
  const kl = (json && json.data && json.data.klines) || []
  return kl
    .map(s => {
      const [date, close] = String(s).split(',')
      return { date, close: Number(close) }
    })
    .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k.date) && Number.isFinite(k.close) && k.close > 0)
}

/** 美元兑人民币汇率（失败用 7.1 兜底） */
async function fetchFx() {
  try {
    const j = await fetchJson(FX_URL, 8000)
    const fx = Number(j && j.rates && j.rates.CNY)
    if (Number.isFinite(fx) && fx > 5 && fx < 10) return fx
  } catch (e) {
    // 网络失败用兜底汇率
  }
  return FALLBACK_FX
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const obj = raw ? JSON.parse(raw) : null
    if (obj && obj.forecast && obj.cycleStart && Date.now() - obj.cachedAt < CACHE_TTL) return obj
  } catch (e) {
    // 缓存不可用则直接取
  }
  return null
}

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, cachedAt: Date.now() }))
  } catch (e) {
    // 写入失败不影响主流程
  }
}

const inflightCrude = new Map()

/**
 * 自算调价测算（6 小时缓存，同一计价周期内复用；并发请求合并）
 * @param {{cycleStart:string, today?:string}} opts cycleStart = 当前价格的生效日
 * @returns {Promise<null|Object>}
 */
export async function getCrudeForecast(opts = {}) {
  const { cycleStart, today } = opts
  if (!cycleStart) return null

  const cached = readCache()
  if (cached && cached.cycleStart === cycleStart) {
    return { ...cached.forecast, fromCache: true }
  }

  const key = `${cycleStart}|${today || ''}`
  if (inflightCrude.has(key)) return inflightCrude.get(key)

  const job = (async () => {
    const [brent, wti, fx] = await Promise.all([
      fetchKlines(SECID_BRENT),
      fetchKlines(SECID_WTI),
      fetchFx()
    ])

    const forecast = computeForecastFromKlines({ brent, wti, cycleStart, fx, today })
    if (!forecast) return null

    writeCache({ cycleStart, forecast })
    return forecast
  })().finally(() => inflightCrude.delete(key))

  inflightCrude.set(key, job)
  return job
}
