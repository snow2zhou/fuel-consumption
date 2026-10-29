/**
 * 时区无关的日期边界工具
 *
 * 统一以 UTC 午夜（00:00:00 UTC）作为日期区间的分界，确保
 * “最近一月 / 最近三月”等区间筛选在任意设备 / 时区下结果一致，
 * 避免本地时区（含夏令时）导致的 ±N 小时偏移。
 */

/**
 * 取某个时刻所在 UTC 日的午夜（00:00:00 UTC）
 * @param {Date|number|string} [base] 基准时刻，默认当前时间
 * @returns {Date}
 */
export function utcMidnight(base = new Date()) {
  const d = base instanceof Date ? base : new Date(base)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * 计算“N 个月前 UTC 日午夜”到“今日 UTC 日结束（明日 UTC 午夜，开区间）”的区间。
 * 用于“最近一月 / 最近三月”筛选，返回 [start, end) 两个 UTC 午夜 Date。
 *
 * 说明：start 用 UTC 日历月份回退（setUTCMonth），与旧实现 setMonth 的“月份回退”
 * 语义一致；仅把时区基准从“设备本地时区”换成“UTC”，消除跨时区误差。
 * end 取“明日 UTC 午夜”即今日 UTC 日结束，使区间两端均为 UTC 午夜、且包含今日全部记录。
 *
 * @param {number} months 月数（1 或 3）
 * @param {Date|number|string} [base] 基准时刻，默认当前时间
 * @returns {{ start: Date, end: Date }}
 */
export function utcMonthsAgoRange(months, base = new Date()) {
  const start = utcMidnight(base)
  start.setUTCMonth(start.getUTCMonth() - months)
  const end = utcMidnight(base)
  end.setUTCDate(end.getUTCDate() + 1) // 明日 UTC 午夜 = 今日 UTC 日结束
  return { start, end }
}
