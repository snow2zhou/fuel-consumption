/**
 * 中国法定节假日 / 调休数据（用于精确计算"10 个工作日"）
 *
 * 两来源：
 * 1. **内置**一份（当前 2026），离线可用、不依赖任何网络；
 * 2. **运行时获取**：国务院每年 11–12 月公布次年安排后，可在「设置 → 节假日数据」
 *    按年份抓取（数据源 holiday-cn，走 jsDelivr CDN），存 localStorage 并覆盖内置。
 *
 * 数据格式：`[{ date: '2026-01-01', isOffDay: true, name: '元旦' }]`
 * 未收录的年份自动退化为"只跳周末"。
 */

/** 内置：放假日（含周末调休形成的连休） */
const OFF_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07'
]

/** 内置：调休上班日（周末但要上班） */
const WORK_2026 = [
  '2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'
]

const BUILTIN = {
  2026: { off: OFF_2026, work: WORK_2026 }
}

/** year → { off:Set, work:Set, source, count, fetchedAt } */
const YEAR_INDEX = new Map()

function indexYear(year, off, work, meta = {}) {
  YEAR_INDEX.set(Number(year), {
    off: new Set(off),
    work: new Set(work),
    source: meta.source || 'builtin',
    count: off.length + work.length,
    fetchedAt: meta.fetchedAt || ''
  })
}

for (const [year, item] of Object.entries(BUILTIN)) {
  indexYear(year, item.off, item.work, { source: 'builtin' })
}

/** 已收录数据的年份（升序） */
export function getHolidayYears() {
  return [...YEAR_INDEX.keys()].sort((a, b) => a - b)
}

/** 各年份的数据概况（设置页展示） */
export function getHolidayYearsInfo() {
  return [...YEAR_INDEX.entries()]
    .map(([year, v]) => ({ year, source: v.source, count: v.count, fetchedAt: v.fetchedAt }))
    .sort((a, b) => a.year - b.year)
}

/**
 * 写入某年的外部数据（覆盖内置）
 * @param {number} year
 * @param {Array<{date:string,isOffDay:boolean}>} days
 */
export function setYearOverride(year, days, meta = {}) {
  if (!year || !Array.isArray(days) || days.length === 0) return false
  const y = Number(year)
  const off = []
  const work = []
  for (const d of days) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) continue
    const date = String(d.date)
    // 只接受目标年份的日期：混杂进来的其它年份不会被索引，也就不会污染那一年
    if (Number(date.slice(0, 4)) !== y) continue
    if (d.isOffDay) off.push(date)
    else work.push(date)
  }
  if (off.length + work.length === 0) return false
  indexYear(y, off, work, { source: 'remote', ...meta })
  return true
}

/** 撤销某年的外部数据（回到内置；内置没有则该年数据消失） */
export function clearYearOverride(year) {
  const y = Number(year)
  const item = BUILTIN[y]
  if (item) indexYear(y, item.off, item.work, { source: 'builtin' })
  else YEAR_INDEX.delete(y)
}

/** 任意时间值 → 本地日期字符串 YYYY-MM-DD */
export function toDateStr(value) {
  if (!value && value !== 0) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 日期加减自然日 */
export function addDays(dateStr, n) {
  const base = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`)
  if (isNaN(base.getTime())) return null
  return toDateStr(new Date(base.getTime() + n * 86400000))
}

/** 该日期所属年份是否已有节假日数据（用于判断推算精度） */
export function hasHolidayData(dateStr) {
  return YEAR_INDEX.has(Number(String(dateStr).slice(0, 4)))
}

/**
 * 列出区间内的所有工作日（含首尾，升序）
 * @param {string} startStr YYYY-MM-DD
 * @param {string} endStr YYYY-MM-DD
 * @param {number} [limit] 防御性上限
 * @returns {string[]}
 */
export function listWorkdays(startStr, endStr, limit = 400) {
  const s = String(startStr || '').slice(0, 10)
  const e = String(endStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) return []
  const out = []
  let d = s
  let guard = 0
  while (d <= e && out.length < limit) {
    if (isWorkday(d)) out.push(d)
    d = addDays(d, 1)
    if (++guard > 2000) break
  }
  return out
}

/**
 * 是否工作日：调休上班 > 法定节假日 > 周末 > 普通工作日
 * @param {string} dateStr YYYY-MM-DD
 */
export function isWorkday(dateStr) {
  const d = String(dateStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const yearSet = YEAR_INDEX.get(Number(d.slice(0, 4)))
  if (yearSet) {
    if (yearSet.work.has(d)) return true
    if (yearSet.off.has(d)) return false
  }
  const dt = new Date(`${d}T12:00:00`)
  if (isNaN(dt.getTime())) return false
  const wd = dt.getDay()
  return wd !== 0 && wd !== 6
}

/**
 * 按**真实工作日**平移日期（跳过周末与法定节假日，计入调休上班日）
 * @param {string} dateStr 起始日期 YYYY-MM-DD
 * @param {number} n 正数向后、负数向前
 * @returns {string|null}
 */
export function shiftWorkdays(dateStr, n) {
  const start = String(dateStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null
  const step = n >= 0 ? 1 : -1
  let left = Math.abs(Math.trunc(n))
  let cur = start
  let guard = 0
  while (left > 0) {
    cur = addDays(cur, step)
    if (!cur) return null
    if (isWorkday(cur)) left--
    if (++guard > 4000) return null // 防死循环
  }
  return cur
}
