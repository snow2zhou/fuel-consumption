/**
 * 数据模型定义与校验
 */

/**
 * 本地日历日期字符串（YYYY-MM-DD）
 * 开票日期是"用户视角的日历日期"（用户在发票上看到的那一天），
 * 与系统时间戳归类不同，按本地时区生成更符合日历直觉。
 */
export function todayLocalDate() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 创建加油记录（带默认值）
 */
export function createRefuelRecord(data = {}) {
  return {
    time: new Date().toISOString(),
    volume: 0, // 加油量（L）
    price: 0, // 油价（元/L）
    cost: 0, // 费用（元）= volume * price
    totalMileage: 0, // 总行驶里程（km）
    isFull: true, // 是否加满
    estimatedRange: 0, // 预计可行驶里程（km）
    fuelType: '92#', // 油号
    invoiceId: null, // 关联发票 ID（外键，指向发票实体：抬头/开户行/账号/税号）
    invoiceLink: '', // 发票链接（电子发票 URL）
    invoiceDate: todayLocalDate(), // 开票日期（YYYY-MM-DD），默认当天
    exported: false, // 该条加油记录的发票是否已导出（报销进度，可按此筛选）
    // 加油时的"省最高零售价"参考值（自动带出时快照，便于事后对比实际单价）
    priceRef: null, // 参考价（元/升）
    priceRefDate: '', // 参考价对应日期
    priceRefSource: '', // 参考价来源（如「北京 92# 省最高零售价」）
    remark: ''
  }
}

/**
 * 创建行程快照记录
 */
export function createTripRecord(data = {}) {
  return {
    time: new Date().toISOString(),
    totalMileage: 0, // 总行驶里程（km）
    tripMileage: 0, // 本次行驶里程（km）
    estimatedRange: 0, // 估计可行驶里程（km）
    // estimatedTotalMileage = totalMileage + estimatedRange（计算属性，不入库）
    remark: ''
  }
}

/**
 * 校验加油记录
 */
export function validateRefuel(r) {
  if (!r.time) return '请选择加油时间'
  if (!(r.volume > 0)) return '加油量必须大于0'
  if (!(r.price >= 0)) return '油价不能为负'
  if (!(r.totalMileage >= 0)) return '总行驶里程不能为负'
  return ''
}

/**
 * 校验行程记录
 */
export function validateTrip(r) {
  if (!r.time) return '请选择记录时间'
  if (!(r.totalMileage >= 0)) return '总行驶里程不能为负'
  if (!(r.tripMileage >= 0)) return '本次行驶里程不能为负'
  if (!(r.estimatedRange >= 0)) return '估计可行驶里程不能为负'
  return ''
}

export const FUEL_TYPES = [
  { text: '92#', value: '92#' },
  { text: '95#', value: '95#' },
  { text: '98#', value: '98#' },
  { text: '柴油', value: '柴油' }
]

/**
 * 创建发票记录（带默认值）
 *
 * 建模说明：发票实体 = **开票主体**（抬头 / 开户行 / 银行账号 / 税号 / 联系电话）的管理单元，
 * 一张发票主体可对应多次加油。因此"发票链接 / 开票日期 / 是否已导出"
 * 都**下沉到加油记录**——它们描述的是"这一次加油的那张电子票"，
 * 而不是开票主体本身的属性。
 * 加油记录通过 invoiceId 外键指向发票主体。
 */
export function createInvoiceRecord(data = {}) {
  return {
    title: '',        // 发票名称/抬头
    bank: '',         // 开户行
    account: '',      // 银行账号
    taxNo: '',        // 税务账号 / 税号
    phone: '',        // 联系电话（选填，展示时可点击拨号）
    remark: '',
    createdAt: new Date().toISOString()
  }
}

/**
 * 校验发票记录
 */
export function validateInvoice(r) {
  if (!r.title || !r.title.trim()) return '请填写发票名称/抬头'
  if (!r.taxNo || !r.taxNo.trim()) return '请填写税务账号'
  return ''
}
