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

/**
 * 生成"日期：发票链接"单行文本（用于复制到报销单等外部场景）
 * 日期优先取该条加油记录的开票日期，缺失时回退到加油日期，
 * 链接缺失时以"(无链接)"占位，保证每行结构一致。
 * @param {Object} refuel 加油记录（含 invoiceDate / invoiceLink / time）
 * @returns {string} 如 "2026-09-01：https://example.com/inv/123"
 */
export function formatInvoiceLine(refuel) {
  if (!refuel) return ''
  const dateText = refuel.invoiceDate || formatDate(refuel.time, 'YYYY-MM-DD') || '未注明日期'
  const link = (refuel.invoiceLink || '').trim() || '(无链接)'
  return `${dateText}：${link}`
}
