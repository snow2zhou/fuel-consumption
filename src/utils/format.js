/**
 * 格式化工具函数
 */

/**
 * 格式化日期时间
 * @param {string|Date} date
 * @param {string} fmt YYYY-MM-DD HH:mm
 */
export function formatDate(date, fmt = 'YYYY-MM-DD HH:mm') {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  const map = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds())
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, m => map[m])
}

/**
 * 格式化数字，保留指定位小数
 */
export function formatNum(num, digits = 2) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '-'
  return Number(num).toFixed(digits)
}

/**
 * 格式化金额（元）
 */
export function formatMoney(num) {
  if (num === null || num === undefined || num === '' || isNaN(num)) return '-'
  return Number(num).toFixed(2)
}
