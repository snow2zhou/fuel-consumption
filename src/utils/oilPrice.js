/**
 * 油价相关纯函数（不涉及网络与存储，便于单元测试）
 *
 * 依据《石油价格管理办法》（发改委）：
 * - 汽、柴油价格每 **10 个工作日** 调整一次，调价发布日 24 时生效；
 * - 比较的是调价周期内一揽子国际原油的 **10 个工作日平均价**，而非单日价格；
 * - 折算调价幅度 **低于 50 元/吨不调整**（差额纳入下次累加或冲抵）；
 * - 原油低于 40 美元/桶、高于 130 美元/桶时另有地板/天花板规则。
 */

import { toDateStr, shiftWorkdays, addDays, listWorkdays, isWorkday } from './holidays'

/** 调价门槛（元/吨），低于此值搁浅 */
export const ADJUST_THRESHOLD_PER_TON = 50

/** 吨 → 升 的行业常用近似换算（汽油约 1388 L/吨，柴油约 1176 L/吨） */
export const LITERS_PER_TON = {
  gasoline: 1388,
  diesel: 1176
}

/** 原油 吨 ↔ 桶 换算（行业常用近似：1 吨原油 ≈ 7.33 桶） */
export const BARRELS_PER_TON = 7.33

/** 把握度文案 */
export const CONFIDENCE_LABELS = { high: '高', medium: '中', low: '低' }

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * 解析"下次油价10月29日24时调整"这类文本
 * @param {string} text 接口返回的 next_adjustment
 * @param {Date} now 参照时间（便于测试）
 * @returns {null|{at:number,year:number,month:number,day:number,hour:number,label:string}}
 *   `at` 为生效时刻的毫秒时间戳（24 时按次日 00:00 归一）
 */
export function parseNextAdjustment(text, now = new Date()) {
  if (!text) return null
  const m = String(text).match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:(\d{1,2})\s*[时点])?/)
  if (!m) return null

  const month = Number(m[1])
  const day = Number(m[2])
  let hour = m[3] === undefined ? 24 : Number(m[3])
  if (!(month >= 1 && month <= 12)) return null
  if (!(day >= 1 && day <= 31)) return null
  if (!(hour >= 0 && hour <= 24)) hour = 24

  const build = y => new Date(y, month - 1, day, hour, 0, 0, 0)
  let year = now.getFullYear()
  let at = build(year)
  // 跨年兜底：算出的时间比"现在"早 45 天以上，说明该日期属于明年
  if (at.getTime() < now.getTime() - 45 * 24 * 3600 * 1000) {
    year += 1
    at = build(year)
  }

  return {
    at: at.getTime(),
    year,
    month,
    day,
    hour,
    label: `${month}月${day}日 ${hour === 24 ? '24:00' : String(hour).padStart(2, '0') + ':00'}`
  }
}

/**
 * 归一化第三方接口返回（字段集中在此，源变更只需改这里）
 * @param {Object} raw 接口原始 JSON
 * @param {string} fallbackProvince 兜底省份名
 */
export function normalizeOilPrice(raw, fallbackProvince = '') {
  const d = (raw && raw.data) || {}
  const prices = {}
  for (const p of d.prices || []) {
    if (p && p.type) prices[p.type] = num(p.price)
  }
  return {
    province: d.province || fallbackProvince,
    updateDate: d.update_date || '',
    prices,
    nextAdjustment: parseNextAdjustment(d.next_adjustment),
    forecast: {
      text: d.forecast || '',
      changeRate: num(d.change_rate),
      perTon: num(d.estimated_change_per_ton),
      workingDay: num(d.working_day),
      crudeAvg: num(d.crude_avg_usd),
      asOf: d.change_rate_as_of || ''
    },
    fetchedAt: Date.now()
  }
}

/** 设置里的油号 → 接口价格字段名 */
export function fuelKeyOf(fuelType) {
  switch (fuelType) {
    case '95#': return 'gasoline_95'
    case '98#': return 'gasoline_98'
    case '柴油': return 'diesel_0'
    default: return 'gasoline_92'
  }
}

/** 油号 → 吨升换算类型 */
export function fuelKindOf(fuelType) {
  return fuelType === '柴油' ? 'diesel' : 'gasoline'
}

/**
 * 元/吨 → 元/升
 * @returns {number|null} 保留原始精度，展示时再取两位
 */
export function perTonToPerLiter(perTon, kind = 'gasoline') {
  const n = num(perTon)
  if (n === null) return null
  return n / (LITERS_PER_TON[kind] || LITERS_PER_TON.gasoline)
}

/**
 * 方向判定：≥ +50 元/吨 上调；≤ -50 下调；区间内搁浅
 */
export function judgeDirection(perTon) {
  const n = num(perTon)
  if (n === null) return 'unknown'
  if (n >= ADJUST_THRESHOLD_PER_TON) return 'up'
  if (n <= -ADJUST_THRESHOLD_PER_TON) return 'down'
  return 'flat'
}

/**
 * 把握度：越接近调价日越可靠。
 * 计价周期前段（第 1–4 个工作日）的测算很容易被后段原油行情反转
 * （2026-10-15 那轮：前段测算 -280 元/吨，最终仅 -30 元/吨 → 搁浅）。
 */
export function confidenceOf(workingDay, hoursLeft) {
  if (Number.isFinite(hoursLeft) && hoursLeft >= 0 && hoursLeft <= 48) return 'high'
  const d = num(workingDay)
  if (d === null) return 'low'
  if (d >= 8) return 'high'
  if (d >= 5) return 'medium'
  return 'low'
}

/** 剩余时长 → "约 X 天 Y 小时 / 约 X 小时 / 约 X 分钟" */
export function formatCountdown(ms) {
  if (!Number.isFinite(ms)) return '—'
  if (ms <= 0) return '已到调价时间'
  const totalMin = Math.floor(ms / 60000)
  const hours = Math.floor(totalMin / 60)
  const days = Math.floor(hours / 24)
  const restH = hours % 24
  if (days >= 1) return `约 ${days} 天 ${restH} 小时`
  if (hours >= 1) return `约 ${hours} 小时`
  return `约 ${Math.max(1, totalMin)} 分钟`
}

/**
 * 根据调价窗口日判断"今天是调价前一天 / 当天 / 昨天"
 * 注意：`adj.day` 是**窗口日**（如 10 月 29 日），而 `adj.at` 是生效时刻（10 月 30 日 00:00），
 * 因此这里用日历日对比，而不能用剩余小时数推断。
 * @returns {''|'今日 24 时调价'|'明日 24 时调价'|'昨日已调价'}
 */
export function adjustmentDayLabel(adj, now = new Date()) {
  if (!adj || !adj.year || !adj.month || !adj.day) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const win = new Date(adj.year, adj.month - 1, adj.day)
  const diffDays = Math.round((win.getTime() - today.getTime()) / 86400000)
  if (diffDays === 0) return '今日 24 时调价'
  if (diffDays === 1) return '明日 24 时调价'
  if (diffDays === -1) return '昨日已调价'
  return ''
}

/**
 * 把本地历史记录整理成价格变更序列（时间正序）
 * - 过滤无效价格；
 * - 合并连续相同的价格（只保留变更点）；
 * - 为每个点带上 `prev`，便于计算涨跌。
 * @param {Array} records oilHistory 记录（任意顺序）
 * @returns {Array<{time,date,price,prev}>}
 */
export function buildPriceSeries(records = []) {
  const list = Array.isArray(records) ? records : []
  const sorted = list
    .filter(r => r && r.price !== null && r.price !== undefined && r.price !== '' &&
      Number.isFinite(Number(r.price)))
    .sort((a, b) => {
      const da = String(a.date || '').slice(0, 10)
      const db = String(b.date || '').slice(0, 10)
      if (da !== db) return da < db ? -1 : 1
      return new Date(a.time) - new Date(b.time)
    })

  const out = []
  for (const r of sorted) {
    const price = Number(r.price)
    if (out.length > 0 && out[out.length - 1].price === price) continue
    out.push({
      time: r.time,
      date: r.date || '',
      price,
      prev: out.length > 0 ? out[out.length - 1].price : null
    })
  }
  return out
}

/** 日期与工作日计算依赖法定节假日表（见 utils/holidays.js），此处转发导出以保持调用方不变 */
export { toDateStr, shiftWorkdays }

/**
 * 由"本轮生效日"推算下一轮调价窗口
 *
 * 规则：本轮生效日是计价周期的第 1 个计价日（若生效日恰逢节假日，则从下一个工作日起算），
 * 计满 10 个计价工作日后的当天 24 时调价、次日生效。
 * 例：生效日 2026-10-16（周五）→ 计价日 10-16..10-29 → 窗口 10-29 24 时 → 10-30 生效；
 *     生效日 2026-09-25（中秋假期，非工作日）→ 计价日 9-28..10-15 → 窗口 10-15 24 时 → 10-16 生效。
 *
 * @param {string} effectiveDate 本轮价格的生效日 YYYY-MM-DD
 * @returns {null|{at:number,year:number,month:number,day:number,hour:number,label:string,derived:boolean}}
 */
export function nextWindowFrom(effectiveDate) {
  if (!isDateStr(effectiveDate)) return null
  // 生效日本身是工作日则计为第 1 个计价日（往后数 9 个），节假日则从次一工作日起算（往后数 10 个）
  const windowDay = shiftWorkdays(effectiveDate, isWorkday(effectiveDate) ? 9 : 10)
  if (!windowDay) return null
  const effective = addDays(windowDay, 1)
  if (!effective) return null
  const [wy, wm, wd] = windowDay.split('-').map(Number)
  return {
    at: new Date(`${effective}T00:00:00`).getTime(),
    year: wy,
    month: wm,
    day: wd,
    hour: 24,
    label: `${wm}月${wd}日 24:00`,
    derived: true
  }
}

/**
 * 来源没给下次调价窗口时，用价格生效日推算一个（`derived=true`，界面需标注"推算"）
 * @param {Object} data 归一化后的油价数据
 */
export function ensureNextAdjustment(data) {
  if (!data) return data
  if (data.nextAdjustment && data.nextAdjustment.at) return data
  if (!data.priceDate) return data
  const next = nextWindowFrom(data.priceDate)
  return next ? { ...data, nextAdjustment: next } : data
}

/**
 * 本机价格记录对某日期是否已"过期"（不可直接当作该日期的价）
 *
 * 规则：生效日 S 的记录只在 [S, S+10个工作日) 内可信——下一个调价窗口后
 * 价格可能已变（哪怕实际搁浅，也需要权威数据确认）。
 *
 * @param {string} since 记录的生效日 YYYY-MM-DD
 * @param {string} date 目标日期 YYYY-MM-DD
 * @returns {boolean} true = 已跨过至少一个调价窗口，应重新获取
 */
export function isPriceRecordStale(since, date) {
  const s = String(since || '').slice(0, 10)
  const d = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const next = shiftWorkdays(s, 10)
  if (!next) return false
  return d >= next
}

/**
 * 用国际原油（布伦特/WTI）日收盘价，按发改委口径**自算**下一轮调价测算
 *
 * 方法（近似）：
 * - 本轮均价 = 计价周期起始日至今各工作日的布伦特/WTI 均值（休市日用最近一个交易日收盘）
 * - 上轮均价 = 周期起始日前 10 个工作日的均值
 * - 变化率 = (本轮 − 上轮) / 上轮 × 100
 * - 预计 元/吨 ≈ (本轮 − 上轮) 美元/桶 × 7.33 桶/吨 × 美元汇率
 * - 幅度不足 50 元/吨 → 搁浅
 *
 * 注意：发改委用的是"一揽子原油"（布伦特/迪拜/WTI 加权），这里用布伦特+WTI 均值近似，
 * 结果与官方口径会有小幅偏差，仅作参考。
 *
 * @param {Object} opts
 * @param {Array<{date:string,close:number}>} opts.brent 布伦特日收盘
 * @param {Array<{date:string,close:number}>} opts.wti WTI 日收盘
 * @param {string} opts.cycleStart 本轮计价周期起始日（= 当前价格的生效日）
 * @param {number} [opts.fx] 美元兑人民币汇率
 * @param {string} [opts.today] 今天 YYYY-MM-DD
 * @returns {null|{perTon:number,changeRate:number,crudeAvgUsd:number,workingDay:number,text:string,cycleStart:string}}
 */
export function computeForecastFromKlines(opts = {}) {
  const { brent = [], wti = [], fx = 7.1 } = opts
  const cycleStart = isDateStr(opts.cycleStart) ? opts.cycleStart : ''
  if (!cycleStart) return null
  const todayStr = isDateStr(opts.today) ? opts.today : toDateStr(new Date())

  const bMap = new Map()
  for (const k of brent) bMap.set(String(k.date).slice(0, 10), Number(k.close))
  const wMap = new Map()
  for (const k of wti) wMap.set(String(k.date).slice(0, 10), Number(k.close))

  // 某自然日的篮子均价：休市日（如美国假日）用最近一个交易日的收盘
  const basketOn = (dateStr) => {
    let d = dateStr
    for (let i = 0; i < 10; i++) {
      const b = bMap.get(d)
      const w = wMap.get(d)
      if (b !== undefined && w !== undefined && Number.isFinite(b) && Number.isFinite(w) && b > 0 && w > 0) {
        return (b + w) / 2
      }
      d = addDays(d, -1)
      if (!d) return null
    }
    return null
  }

  // 本轮：cycleStart..today 的工作日（最多 10 个）
  const curDays = listWorkdays(cycleStart, todayStr).slice(-10)
  if (curDays.length < 2) return null

  // 上轮：cycleStart 前一天为终点、往前 10 个工作日
  const prevEnd = addDays(cycleStart, -1)
  if (!prevEnd) return null
  const prevDays = listWorkdays(shiftWorkdays(prevEnd, -9), prevEnd)
  if (prevDays.length < 10) return null

  const avgOf = (days) => {
    let sum = 0
    let n = 0
    for (const d of days) {
      const c = basketOn(d)
      if (c === null) return null
      sum += c
      n++
    }
    return n > 0 ? sum / n : null
  }

  const curAvg = avgOf(curDays)
  const prevAvg = avgOf(prevDays)
  if (curAvg === null || prevAvg === null || prevAvg <= 0) return null

  const changeRate = Math.round(((curAvg - prevAvg) / prevAvg) * 10000) / 100
  const deltaUsd = curAvg - prevAvg
  const perTon = Math.round(deltaUsd * BARRELS_PER_TON * fx)

  return {
    perTon,
    changeRate,
    crudeAvg: Math.round(curAvg * 100) / 100,
    workingDay: Math.min(curDays.length, 10),
    cycleStart,
    text: `自算：布伦特/WTI 两周期均价变化 ${changeRate > 0 ? '+' : ''}${changeRate}%（上轮均价 $${prevAvg.toFixed(2)}/桶）`
  }
}

function isDateStr(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

/**
 * 决定一条价格记录应该归属的**生效起始日**
 *
 * 为什么不用"今天"：API 返回的是**当前已生效**的价格，可能几天前就生效了。
 * 若记成"观察到的那天"，补录更早的加油就查不到这条参考价。
 * 为什么不用"下次调价窗口"：那是这份价格的**有效期终点**，
 * 记成窗口日会让窗口之前的加油全都查不到（反而更糟）。
 *
 * 取值优先级：
 * 1. 来源直接给了价格日期（如小小 API / 澄曜的 `date`，实测就是本轮生效日）；
 * 2. 上一条记录的"下次窗口"已经过去 → 新价格正是从那个窗口生效；
 * 3. 由本次窗口向前推 10 个工作日（≈ 上一轮窗口）——即用户提出的"10 个工作日"思路；
 * 4. 数据更新日；
 * 5. 今天。
 *
 * @param {Object} opts
 * @param {string} [opts.priceDate] 来源给的价格日期
 * @param {number|string} [opts.nextWindowAt] 本次的"下次调价窗口"生效时刻
 * @param {number|string} [opts.lastNextWindowAt] 上一条记录保存的"下次窗口"
 * @param {string} [opts.updateDate] 数据更新日
 * @param {string} [opts.today] 今天（便于测试）
 * @returns {string} YYYY-MM-DD
 */
export function pickEffectiveDate(opts = {}) {
  const todayStr = isDateStr(opts.today) ? opts.today : toDateStr(new Date())

  if (isDateStr(opts.priceDate)) return opts.priceDate

  if (opts.lastNextWindowAt) {
    const d = toDateStr(opts.lastNextWindowAt)
    if (d && d <= todayStr) return d
  }

  if (opts.nextWindowAt) {
    const windowDay = toDateStr(opts.nextWindowAt)
    if (windowDay) {
      const prev = shiftWorkdays(windowDay, -10)
      if (prev) return prev
    }
  }

  if (isDateStr(opts.updateDate)) return opts.updateDate
  return todayStr
}

/** 省份名归一化：接口常返回「北京市 / 广西壮族自治区」，统一成「北京 / 广西」 */
export function normalizeProvinceName(name) {
  return String(name || '')
    .replace(/\s/g, '')
    .replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$/g, '')
}

/** 把任意字段名/油品名映射到统一的油价 key */
export function matchFuelKey(label) {
  if (label === null || label === undefined) return null
  const t = String(label).toLowerCase().trim()
  if (!t) return null
  // 柴油（0 号）：diesel / 0h / n0 / t0 / 0号 / 单独的 "0"
  if (/diesel|柴油|0h|0号|^0$|^[npt]0$/.test(t)) return 'diesel_0'
  if (/98/.test(t)) return 'gasoline_98'
  if (/95/.test(t)) return 'gasoline_95'
  if (/92/.test(t)) return 'gasoline_92'
  return null
}

/**
 * 从任意 JSON 结构中嗅探油价（用于"自定义来源"与结构变化的内置来源）
 * 支持两种常见形态：
 *  1) 数组项 `{ name: '92号汽油', price: 8.61 }`
 *  2) 扁平字段 `{ n92: 8.61, n95: 9.17, n0: 8.36 }`
 * 只接受 3–30 元/升的数值，避免把日期、百分比等误判为油价。
 * @returns {{gasoline_92?:number, gasoline_95?:number, gasoline_98?:number, diesel_0?:number}}
 */
export function sniffPrices(root) {
  const out = {}
  const put = (key, value) => {
    if (!key || out[key] !== undefined) return
    const n = Number(value)
    if (!Number.isFinite(n) || n < 3 || n > 30) return
    out[key] = n
  }
  const walk = (node, depth) => {
    if (!node || depth > 8) return
    if (Array.isArray(node)) {
      node.forEach(item => walk(item, depth + 1))
      return
    }
    if (typeof node !== 'object') return

    // 形态 1：带名称的价格条目
    const label = node.name ?? node.title ?? node.type ?? node.oilName ?? node.label
    if (label !== null && label !== undefined) {
      put(matchFuelKey(label), node.price ?? node.value ?? node.jiage)
    }
    // 形态 2：键名即油号
    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === 'object') walk(v, depth + 1)
      else put(matchFuelKey(k), v)
    }
  }
  walk(root, 0)
  return out
}

/**
 * 取某一天生效的价格（从本地价格变更点里查）
 *
 * 语义：找 `date <= 目标日期` 的最后一个变更点。
 * - 目标日期早于第一条记录 → 返回 null（**不猜**，避免用后来的价污染历史）；
 * - 变更点是"观察到新价的日期"，因此同一天调价（24 时生效）时，
 *   当天更早的加油会拿到新价，这是已知的粒度局限（没有分时价格数据）。
 *
 * @param {Array<{date:string,time?:string,price:number}>} points 变更点（任意顺序）
 * @param {string} date 目标日期 YYYY-MM-DD
 * @returns {null|{price:number,date:string}}
 */
export function priceOnDate(points, date) {
  const target = String(date || '').slice(0, 10)
  if (!target || !Array.isArray(points) || points.length === 0) return null

  const sorted = [...points]
    .filter(p => p && p.price !== null && p.price !== undefined && Number.isFinite(Number(p.price)))
    .sort((a, b) => {
      // 以「生效日」为主序（date 即生效起始日），同日再看观察时间
      const da = String(a.date || '').slice(0, 10)
      const db = String(b.date || '').slice(0, 10)
      if (da && db && da !== db) return da < db ? -1 : 1
      const ta = a.time ? new Date(a.time).getTime() : 0
      const tb = b.time ? new Date(b.time).getTime() : 0
      return ta - tb
    })

  let hit = null
  for (const p of sorted) {
    const d = String(p.date || (p.time ? String(p.time).slice(0, 10) : '')).slice(0, 10)
    if (!d) continue
    if (d <= target) hit = p
    else break
  }
  return hit ? { price: Number(hit.price), date: String(hit.date || '').slice(0, 10) } : null
}

/**
 * 按加油量加权的平均油价
 * @param {Array<{price:number, volume:number}>} items
 * @returns {null|number}
 */
export function weightedAveragePrice(items) {
  if (!Array.isArray(items)) return null
  let amount = 0
  let volume = 0
  for (const it of items) {
    const p = Number(it && it.price)
    const v = Number(it && it.volume)
    if (!Number.isFinite(p) || !Number.isFinite(v) || p <= 0 || v <= 0) continue
    amount += p * v
    volume += v
  }
  return volume > 0 ? amount / volume : null
}

/**
 * 生成"现在加 / 可以等 / 无所谓"的建议
 * @param {Object} opts
 * @param {'up'|'down'|'flat'|'unknown'} opts.direction
 * @param {number|null} opts.perTon 预计调整（元/吨）
 * @param {number|null} opts.perLiter 预计调整（元/升）
 * @param {'high'|'medium'|'low'} opts.confidence
 * @param {number|null} opts.workingDay 当前第几个工作日
 * @param {number|null} opts.hoursLeft 距生效小时数
 * @param {number|null} opts.rangeKm 剩余续航（km）
 * @param {number|null} opts.avgDailyKm 日均行驶（km）
 * @param {number|null} opts.tankCapacity 油箱容量（L）
 * @returns {{level:'now'|'wait'|'watch'|'either'|'unknown', title:string, detail:string}}
 */
export function buildAdvice(opts = {}) {
  const {
    direction = 'unknown',
    perLiter = null,
    confidence = 'low',
    workingDay = null,
    hoursLeft = null,
    rangeKm = null,
    avgDailyKm = null,
    tankCapacity = null
  } = opts

  const perLiterNum = num(perLiter)
  const capNum = num(tankCapacity)

  // 1) 续航撑不到调价日 → 先加，别为了省几块钱推车
  const rk = num(rangeKm)
  const daily = num(avgDailyKm)
  if (rk !== null && daily !== null && daily > 0 && Number.isFinite(hoursLeft)) {
    const canRunDays = rk / daily
    const daysToAdjust = Math.max(0, hoursLeft / 24)
    if (canRunDays < daysToAdjust) {
      return {
        level: 'now',
        title: '建议先加，别硬等',
        detail: `剩余续航约 ${Math.round(rk)} km（约 ${canRunDays.toFixed(1)} 天），撑不到调价日`
      }
    }
  }

  if (direction === 'flat') {
    return {
      level: 'either',
      title: '本轮预计搁浅',
      detail: '幅度不足 50 元/吨，涨跌都一样，随时加即可'
    }
  }

  if ((direction === 'up' || direction === 'down') && perLiterNum === null) {
    return { level: 'unknown', title: '暂无测算数据', detail: '未获取到本轮调价测算，可稍后重试' }
  }

  const absLiter = Math.abs(perLiterNum || 0)
  const money = capNum !== null ? Math.abs((perLiterNum || 0) * capNum) : null
  const moneyText = (verb) => (money !== null ? `，加满 ${capNum}L 约${verb} ${money.toFixed(0)} 元` : '')

  if (direction === 'up') {
    const detail = `预计上调约 ${absLiter.toFixed(2)} 元/升` + moneyText('多花')
    const settled = confidence !== 'low'
    return {
      level: settled ? 'now' : 'watch',
      title: settled ? '建议调价前加满' : '可能上调，但结论未定',
      detail: settled
        ? detail
        : `当前处于计价周期第 ${workingDay === null ? '?' : workingDay} 个工作日，后段原油行情仍可能反转；${detail}`
    }
  }

  if (direction === 'down') {
    return {
      level: 'wait',
      title: '可以等调价后再加',
      detail: `预计下调约 ${absLiter.toFixed(2)} 元/升` + moneyText('省')
    }
  }

  return { level: 'unknown', title: '暂无测算数据', detail: '未获取到本轮调价测算，可稍后重试' }
}
