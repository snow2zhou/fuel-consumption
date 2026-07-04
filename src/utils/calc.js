/**
 * 油耗计算工具
 *
 * 计算逻辑说明：
 * 本次加油量实际上是"上次加油到本次加油期间消耗掉的油"。
 * 因此，百公里油耗 = 本次加油量 ÷ 两次加油间行驶里程 × 100
 * 只有当本次与上次都"加满油箱"时，该计算才准确。
 */

/**
 * 计算两条加油记录之间的对比数据
 * @param {Object} current 当前加油记录
 * @param {Object|null} prev 上一条加油记录
 * @returns {Object|null} 对比结果
 *   - intervalMileage: 两次加油间行驶里程（km）
 *   - fuelPer100km: 百公里油耗（L/100km）
 *   - costPerKm: 每公里费用（元/km）
 *   - totalCost: 期间总费用（元）= 本次加油量 × 上次油价
 *   - calculable: 是否可计算（两次都加满且里程合理）
 *   - reason: 不可计算原因
 */
export function calcRefuelComparison(current, prev) {
  if (!prev) {
    return {
      calculable: false,
      reason: '首次加油，无对比数据',
      intervalMileage: null,
      fuelPer100km: null,
      costPerKm: null,
      totalCost: null
    }
  }

  // 两次都必须加满，否则油耗计算不准确
  if (!current.isFull || !prev.isFull) {
    return {
      calculable: false,
      reason: '未加满油箱，无法准确计算油耗',
      intervalMileage: null,
      fuelPer100km: null,
      costPerKm: null,
      totalCost: null
    }
  }

  const intervalMileage = Number(current.totalMileage) - Number(prev.totalMileage)
  if (intervalMileage <= 0) {
    return {
      calculable: false,
      reason: '本次总里程未超过上次，请检查里程数据',
      intervalMileage,
      fuelPer100km: null,
      costPerKm: null,
      totalCost: null
    }
  }

  const volume = Number(current.volume)
  const prevPrice = Number(prev.price)

  // 百公里油耗（L/100km）= 本次加油量 ÷ 间驶里程 × 100
  const fuelPer100km = volume / intervalMileage * 100
  // 每公里费用（元/km）= 本次加油量 × 上次油价 ÷ 间驶里程
  const costPerKm = volume * prevPrice / intervalMileage
  // 期间总费用 = 本次加油量 × 上次油价
  const totalCost = volume * prevPrice

  return {
    calculable: true,
    reason: '',
    intervalMileage,
    fuelPer100km,
    costPerKm,
    totalCost
  }
}

/**
 * 为加油记录列表逐条计算对比结果
 * 列表按时间倒序，需先正序排序后再两两比较
 */
export function calcRefuelListWithComparison(list) {
  if (!list || list.length === 0) return []
  // 复制并按时间正序排序（从早到晚）
  const sorted = [...list].sort((a, b) => new Date(a.time) - new Date(b.time))
  const result = []
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const prev = i > 0 ? sorted[i - 1] : null
    const comparison = calcRefuelComparison(cur, prev)
    result.push({ ...cur, comparison })
  }
  // 再倒序返回（最新在前）
  return result.sort((a, b) => new Date(b.time) - new Date(a.time))
}

/**
 * 汇总统计数据
 * @param {Array} listWithComp 已带 comparison 的加油记录列表
 */
export function calcStatistics(listWithComp) {
  const validList = listWithComp.filter(r => r.comparison && r.comparison.calculable)
  const allRefuels = listWithComp

  const totalVolume = allRefuels.reduce((s, r) => s + Number(r.volume || 0), 0)
  const totalCost = allRefuels.reduce((s, r) => s + Number(r.cost || 0), 0)
  const totalIntervalMileage = validList.reduce((s, r) => s + r.comparison.intervalMileage, 0)

  const avgFuelPer100km = validList.length > 0
    ? validList.reduce((s, r) => s + r.comparison.fuelPer100km, 0) / validList.length
    : 0
  const avgCostPerKm = validList.length > 0
    ? validList.reduce((s, r) => s + r.comparison.costPerKm, 0) / validList.length
    : 0
  const avgPrice = allRefuels.length > 0
    ? allRefuels.reduce((s, r) => s + Number(r.price || 0), 0) / allRefuels.length
    : 0

  return {
    refuelCount: allRefuels.length,
    totalVolume,
    totalCost,
    totalIntervalMileage,
    avgFuelPer100km,
    avgCostPerKm,
    avgPrice
  }
}

/**
 * 智能预测：基于历史油耗数据，预测本次加油后的可行驶里程与天数
 *
 * 改进逻辑（修正油量理解）：
 * - "加满"时：油箱当前油量 = 油箱总容量，预测里程 = 油箱容量 ÷ 平均百公里油耗 × 100
 * - "未加满"时：无法准确知道油箱当前油量，不预测，仅返回提示
 * - 同时对比用户手动输入的"预计可行驶里程"，给出偏差分析
 *
 * @param {Object} current 当前加油记录
 * @param {Array} allRefuels 所有加油记录
 * @param {Object} options { tankCapacity: 油箱容量(L) }
 * @returns {Object|null} 预测结果，无历史数据时返回 null
 */
export function predictRefuelRange(current, allRefuels, options = {}) {
  if (!allRefuels || allRefuels.length === 0) return null

  const tankCapacity = Number(options.tankCapacity) || 0

  // 按时间正序
  const sorted = [...allRefuels].sort((a, b) => new Date(a.time) - new Date(b.time))
  // 取出当前记录之前的所有记录
  const curTime = new Date(current.time).getTime()
  const earlier = sorted.filter(r => new Date(r.time).getTime() < curTime && r.id !== current.id)
  if (earlier.length === 0) return null

  // 计算历史平均百公里油耗、平均日行驶里程
  let fuelSum = 0
  let fuelCount = 0
  let intervalMileageSum = 0
  for (let i = 1; i < earlier.length; i++) {
    const cur = earlier[i]
    const prev = earlier[i - 1]
    const cmp = calcRefuelComparison(cur, prev)
    if (cmp.calculable) {
      fuelSum += cmp.fuelPer100km
      fuelCount++
      intervalMileageSum += cmp.intervalMileage
    }
  }

  if (fuelCount === 0) return null
  const avgFuel = fuelSum / fuelCount // L/100km

  // 计算日平均里程
  const firstTime = new Date(earlier[0].time).getTime()
  const lastTime = new Date(earlier[earlier.length - 1].time).getTime()
  const days = (lastTime - firstTime) / (1000 * 60 * 60 * 24)
  const avgDailyMileage = days >= 0.5 ? intervalMileageSum / days : 0

  // 只有"加满"才准确预测（油箱当前油量 = 油箱总容量）
  if (!current.isFull) {
    return {
      calculable: false,
      reason: '本次未加满，无法准确预测（油箱当前油量未知）',
      avgFuel,
      avgDailyMileage,
      tankCapacity,
      predictedRange: null,
      predictedDays: null
    }
  }

  if (!(tankCapacity > 0)) {
    return {
      calculable: false,
      reason: '未设置油箱容量，请在设置页配置',
      avgFuel,
      avgDailyMileage,
      tankCapacity,
      predictedRange: null,
      predictedDays: null
    }
  }

  // 预测可行驶里程 = 油箱容量 ÷ 平均百公里油耗 × 100
  const predictedRange = avgFuel > 0 ? tankCapacity / avgFuel * 100 : 0
  // 预测可行驶天数
  const predictedDays = avgDailyMileage > 0 ? predictedRange / avgDailyMileage : 0
  // 预测总行驶里程 = 当前总里程 + 预测可行驶里程
  const predictedTotalMileage = Number(current.totalMileage || 0) + predictedRange

  // 对比用户手动输入的"预计可行驶里程"
  const userInputRange = Number(current.estimatedRange) || 0
  let deviation = null
  if (userInputRange > 0) {
    const diff = predictedRange - userInputRange
    const percent = userInputRange > 0 ? (diff / userInputRange * 100) : 0
    deviation = {
      diff, // 预测值 - 用户输入值（正=预测更远，负=预测更近）
      percent, // 偏差百分比
      assessment: Math.abs(percent) < 10 ? '一致' : (percent > 0 ? '偏低' : '偏高')
    }
  }

  return {
    calculable: true,
    avgFuel, // 历史平均百公里油耗
    avgDailyMileage, // 历史平均日行驶里程
    tankCapacity,
    predictedRange, // 预测可行驶里程（km）
    predictedDays, // 预测可行驶天数
    predictedTotalMileage, // 预测总行驶里程（km）= 当前总里程 + 预测可行驶里程
    userInputRange, // 用户输入的预计可行驶里程
    deviation // 偏差分析
  }
}

/**
 * 行程快照低油量预警
 *
 * 改进逻辑（优先使用智能预测总行驶里程）：
 * 1. 取比行程时间小的最近一条加油记录
 * 2. 优先使用该加油记录的"智能预测总行驶里程"（基于历史油耗计算），
 *    若无智能预测，则用"加油时输入的预计总行驶里程"（=加油总里程+加油时预计可行驶）
 * 3. 计算：预测总行驶里程 - 当前行程总里程 = 剩余可行驶
 * 4. 剩余 < 50km → 预警
 * 5. 同时返回加油记录的预测信息，供 UI 显示
 *
 * @param {Object} trip 行程快照记录
 * @param {Array} allRefuels 所有加油记录
 * @param {Object} options { tankCapacity: 油箱容量(L) }
 * @returns {Object} { warnings, latestRefuel, refuelPrediction, refuelEstTotal, remaining }
 */
export function checkLowFuelWarning(trip, allRefuels, options = {}) {
  const warnings = []

  if (!allRefuels || allRefuels.length === 0) {
    return { warnings, latestRefuel: null, refuelPrediction: null, refuelEstTotal: 0, remaining: null }
  }

  const tripTime = new Date(trip.time).getTime()
  // 取比行程时间小的最近一条加油记录
  const earlier = allRefuels
    .filter(r => new Date(r.time).getTime() < tripTime)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
  const latestRefuel = earlier[0] || null

  if (!latestRefuel) {
    return { warnings, latestRefuel: null, refuelPrediction: null, refuelEstTotal: 0, remaining: null }
  }

  // 智能预测（基于历史油耗）
  const refuelPrediction = predictRefuelRange(latestRefuel, allRefuels, options)

  // 优先使用智能预测总行驶里程，否则用加油时输入的预计总行驶里程
  let refuelEstTotal = 0
  let usePrediction = false
  if (refuelPrediction && refuelPrediction.calculable && refuelPrediction.predictedTotalMileage > 0) {
    refuelEstTotal = refuelPrediction.predictedTotalMileage
    usePrediction = true
  } else {
    refuelEstTotal = Number(latestRefuel.totalMileage || 0) + Number(latestRefuel.estimatedRange || 0)
  }

  const tripTotal = Number(trip.totalMileage || 0)
  const remaining = refuelEstTotal - tripTotal

  // 判断1：剩余可行驶里程 < 50（基于加油记录预测）
  if (remaining < 50) {
    const source = usePrediction ? '智能预测' : '加油时输入'
    warnings.push(`距上次加油${source}总里程仅剩 ${remaining.toFixed(0)} km，请尽快加油`)
  }

  // 判断2：行程本身输入的"估计可行驶里程" < 50
  const tripEstRange = Number(trip.estimatedRange || 0)
  if (tripEstRange > 0 && tripEstRange < 50) {
    warnings.push(`行程记录显示剩余可行驶里程仅 ${tripEstRange.toFixed(0)} km`)
  }

  return {
    warnings,
    latestRefuel,
    refuelPrediction,
    refuelEstTotal,
    remaining,
    usePrediction
  }
}
