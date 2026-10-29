/**
 * 本地油价历史（不联网，靠自己每次查询时"看到"的价格累积）
 *
 * 背景：第三方接口只返回当前价，没有历史序列。
 * 因此每次成功拉取油价时，若与上一次记录的价格不同，就存一个**变更点**
 * （不是每天一条），时间久了自然形成一条阶梯状的价格曲线。
 *
 * 局限（页面上要如实说明）：只有打开 App 时才能观察到价格，
 * 若两次打开之间跨过多次调价，中间那几次不会被记录。
 */
import { oilHistoryRepo } from './storage'
import { todayLocalDate } from './models'
import { priceOnDate, pickEffectiveDate, isPriceRecordStale } from '../utils/oilPrice'

/** 需要记录的油品（与设置里的油号标签保持一致） */
export const HISTORY_FUEL_LABELS = [
  { key: 'gasoline_92', label: '92#' },
  { key: 'gasoline_95', label: '95#' },
  { key: 'gasoline_98', label: '98#' },
  { key: 'diesel_0', label: '柴油' }
]

/** 单个序列（省 + 油号）最多保留的变更点 */
// 单油号上限：一年约 24 次调价，240 条 ≈ 10 年，够"按年自动获取"用
const MAX_PER_SERIES = 240

function seriesOf(all, province, fuelType) {
  return all
    .filter(r => r && r.province === province && r.fuelType === fuelType)
    .sort((a, b) => {
      // 以「生效日」为主序：生效日相同再看观察时间
      const da = String(a.date || '').slice(0, 10)
      const db = String(b.date || '').slice(0, 10)
      if (da !== db) return da < db ? 1 : -1 // 倒序，[0] 为最新
      return new Date(b.time) - new Date(a.time)
    })
}

/**
 * 记录一次价格快照（仅在价格发生变化时写入变更点）
 * @param {Object} data fetchOilPrice 返回的归一化数据
 * @returns {Number} 新增的变更点条数
 */
export function recordPriceSnapshot(data) {
  if (!data || !data.prices || !data.province) return 0
  const nowIso = new Date().toISOString()
  const today = todayLocalDate()
  const nextAdjustmentAt = (data.nextAdjustment && data.nextAdjustment.at) || null
  let added = 0

  for (const ft of HISTORY_FUEL_LABELS) {
    const raw = data.prices[ft.key]
    const price = Number(raw)
    if (raw === null || raw === undefined || !Number.isFinite(price)) continue

    const all = oilHistoryRepo.getAll()
    const series = seriesOf(all, data.province, ft.label)
    const last = series[0]
    // 价格没变 → 不堆点（避免每次打开都写一条）
    if (last && Number(last.price) === price) continue

    // 记录的是「生效起始日」，而不是"我哪天打开过 App"
    const effectiveFrom = pickEffectiveDate({
      priceDate: data.priceDate,
      nextWindowAt: nextAdjustmentAt,
      lastNextWindowAt: last ? last.nextAdjustmentAt : null,
      updateDate: data.updateDate,
      today
    })

    // 同一生效日已有记录但价格不同（数据源周期内修正）→ 原地更新，不追加同日重复点
    if (last && String(last.date || '').slice(0, 10) === effectiveFrom && Number(last.price) !== price) {
      oilHistoryRepo.update(last.id, { price, observedAt: today })
      added++
      continue
    }

    oilHistoryRepo.add({
      time: nowIso,
      date: effectiveFrom,
      observedAt: today,
      nextAdjustmentAt,
      province: data.province,
      fuelType: ft.label,
      price,
      prevPrice: last ? Number(last.price) : null
    })
    added++

    // 超出上限时删除最旧的几条
    if (series.length + 1 > MAX_PER_SERIES) {
      series.slice(MAX_PER_SERIES - 1).forEach(r => oilHistoryRepo.remove(r.id))
    }
  }

  return added
}

/**
 * 记录一次手动录入的油价（只针对一个油号）
 * @returns {Number} 新增条数（与上一条同价则不记）
 */
export function recordManualPrice(province, fuelType, price) {
  const n = Number(price)
  if (!province || !fuelType || !Number.isFinite(n) || n <= 0) return 0

  const series = seriesOf(oilHistoryRepo.getAll(), province, fuelType)
  const last = series[0]
  if (last && Number(last.price) === n) return 0

  oilHistoryRepo.add({
    time: new Date().toISOString(),
    date: todayLocalDate(),
    province,
    fuelType,
    price: n,
    prevPrice: last ? Number(last.price) : null,
    manual: true
  })

  if (series.length + 1 > MAX_PER_SERIES) {
    series.slice(MAX_PER_SERIES - 1).forEach(r => oilHistoryRepo.remove(r.id))
  }
  return 1
}

/**
 * 取某一天所有油号的生效价（历史油价查看用）
 * @param {string} province
 * @param {string} date YYYY-MM-DD
 * @returns {Array<{fuelType:string, price:number, since:string}>} 该日期有记录的油号
 */
export function getPricesOnDate(province, date) {
  const out = []
  if (!province || !date) return out
  for (const ft of HISTORY_FUEL_LABELS) {
    const hit = priceOnDate(getPriceHistory(province, ft.label), date)
    if (hit) {
      out.push({
        fuelType: ft.label,
        price: hit.price,
        since: hit.date,
        // 记录生效日距目标日期超过一个调价周期（10 个工作日）→ 不可信，应重新获取
        stale: isPriceRecordStale(hit.date, date)
      })
    }
  }
  return out
}

/**
 * 取某一天生效的油价（用于加油记录自动带出参考价）
 * @param {string} province
 * @param {string} fuelType 如 '92#'
 * @param {string} date YYYY-MM-DD
 * @returns {null|{price:number,date:string}}
 */
export function getPriceOnDate(province, fuelType, date) {
  if (!province || !fuelType) return null
  return priceOnDate(getPriceHistory(province, fuelType), date)
}

/** 手工新增一个价格点（油价记录页用） */
export function addPricePoint({ province, fuelType, date, price, source = '', manual = true, nextAdjustmentAt = null }) {
  const n = Number(price)
  const d = String(date || '').slice(0, 10) || todayLocalDate()
  if (!province || !fuelType || !Number.isFinite(n) || n <= 0) return null

  const series = seriesOf(oilHistoryRepo.getAll(), province, fuelType)
  const same = series.find(r => String(r.date || '').slice(0, 10) === d)
  if (same) {
    // 同一生效日只保留一条：同价跳过，不同价原地更新
    // （同一周期内数据源修正价格、或自动获取重复执行时，避免出现同日期的两条矛盾记录）
    if (Number(same.price) === n) return null
    const before = series.find(r => String(r.date || '').slice(0, 10) < d)
    return oilHistoryRepo.update(same.id, {
      price: n,
      prevPrice: before ? Number(before.price) : null,
      manual,
      source,
      observedAt: todayLocalDate()
    })
  }

  const before = series.find(r => String(r.date || '').slice(0, 10) <= d)
  const point = oilHistoryRepo.add({
    time: new Date(`${d}T12:00:00`).toISOString(),
    date: d,
    observedAt: todayLocalDate(),
    nextAdjustmentAt: nextAdjustmentAt || null,
    province,
    fuelType,
    price: n,
    prevPrice: before ? Number(before.price) : null,
    manual,
    source
  })

  if (series.length + 1 > MAX_PER_SERIES) {
    series.slice(MAX_PER_SERIES - 1).forEach(r => oilHistoryRepo.remove(r.id))
  }
  return point
}

/** 修改一个价格点（价格记录页用） */
export function updatePricePoint(id, patch = {}) {
  const next = { ...patch }
  if (next.price !== undefined) next.price = Number(next.price)
  if (next.date) {
    next.date = String(next.date).slice(0, 10)
    next.time = new Date(`${next.date}T12:00:00`).toISOString()
  }
  return oilHistoryRepo.update(id, next)
}

/** 删除一个价格点 */
export function deletePricePoint(id) {
  return oilHistoryRepo.remove(id)
}

/**
 * 读取某省某油号的历史变更点（按时间正序）
 */
export function getPriceHistory(province, fuelType) {
  if (!province || !fuelType) return []
  return oilHistoryRepo.getAll()
    .filter(r => r && r.province === province && r.fuelType === fuelType)
    .sort((a, b) => {
      const da = String(a.date || '').slice(0, 10)
      const db = String(b.date || '').slice(0, 10)
      if (da !== db) return da < db ? -1 : 1 // 按生效日正序
      return new Date(a.time) - new Date(b.time)
    })
}

/** 历史记录总条数（设置页展示） */
export function countPriceHistory() {
  return oilHistoryRepo.getAll().length
}

/** 清空所有油价历史 */
export function clearPriceHistory() {
  oilHistoryRepo.clear()
}
