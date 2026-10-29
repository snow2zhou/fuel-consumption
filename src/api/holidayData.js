/**
 * 节假日数据的持久化与按年获取
 *
 * 国务院一般每年 11–12 月公布次年放假安排。内置只带当前年，
 * 之后的年份可在「设置 → 节假日数据」按年抓取（holiday-cn，走 jsDelivr CDN），
 * 存 localStorage 并覆盖内置；删除后回到内置（没有内置则退化为只跳周末）。
 */
import { setYearOverride, clearYearOverride, getHolidayYearsInfo } from '../utils/holidays'

const KEY = 'fc_holiday_years'
const CDN = 'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master'

function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch (e) {
    // 写入失败不影响主流程
  }
}

/** 启动时把已保存的年份灌进工作日缓存（main.js 调用一次） */
export function initHolidayOverrides() {
  const all = readAll()
  for (const [year, item] of Object.entries(all)) {
    if (item && Array.isArray(item.days) && item.days.length > 0) {
      setYearOverride(Number(year), item.days, { fetchedAt: item.fetchedAt || '' })
    }
  }
}

/**
 * 抓取指定年份的放假安排
 * @param {number} year
 * @returns {Promise<{ok:boolean, days?:Array, reason?:string, message?:string}>}
 */
export async function fetchHolidayYear(year) {
  const y = Number(year)
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return { ok: false, reason: 'bad-year', message: '年份不合法' }
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`${CDN}/${y}.json`, { signal: ctrl.signal, cache: 'no-cache' })
    if (!res.ok) {
      return { ok: false, reason: 'http', message: `获取失败（HTTP ${res.status}）` }
    }
    const json = await res.json()
    const days = Array.isArray(json && json.days)
      ? json.days.filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
      : []
    // 官方未公布时该文件存在但 days 为空
    if (days.length === 0) {
      return { ok: false, reason: 'empty', message: `${y} 年官方安排尚未公布` }
    }
    // 完整一年通常 30 条以上；过少说明数据不完整，宁可不用也不写坏
    if (days.length < 10) {
      return { ok: false, reason: 'incomplete', message: `${y} 年数据不完整（仅 ${days.length} 条），已跳过` }
    }
    if (!days.some(d => String(d.date).startsWith(String(y)))) {
      return { ok: false, reason: 'mismatch', message: '返回数据年份不匹配' }
    }
    return { ok: true, days }
  } catch (e) {
    return {
      ok: false,
      reason: 'network',
      message: e && e.name === 'AbortError' ? '请求超时' : '网络请求失败'
    }
  } finally {
    clearTimeout(timer)
  }
}

/** 保存某年数据（覆盖内置），返回条数 */
export function saveHolidayYear(year, days) {
  const y = Number(year)
  const all = readAll()
  const fetchedAt = new Date().toISOString()
  all[y] = { days, fetchedAt }
  writeAll(all)
  setYearOverride(y, days, { fetchedAt })
  return days.length
}

/** 删除某年已获取的数据（回到内置） */
export function removeHolidayYear(year) {
  const y = Number(year)
  const all = readAll()
  if (all[y]) {
    delete all[y]
    writeAll(all)
  }
  clearYearOverride(y)
  return getHolidayYearsInfo()
}

/** 清空所有"外部获取"的年份数据 */
export function clearAllHolidayYears() {
  const all = readAll()
  const years = Object.keys(all)
  years.forEach(y => clearYearOverride(Number(y)))
  writeAll({})
  return years.length
}

/** 哪些年份是外部获取的 */
export function getRemoteHolidayYears() {
  return Object.keys(readAll()).map(Number).filter(y => !isNaN(y))
}
