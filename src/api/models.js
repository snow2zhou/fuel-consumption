/**
 * 数据模型定义与校验
 */

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

export const FUEL_TYPES = ['92#', '95#', '98#', '柴油']
