/**
 * calc.js 单元测试
 * 覆盖 5 个导出函数：calcRefuelComparison / calcRefuelListWithComparison /
 * calcStatistics / predictRefuelRange / checkLowFuelWarning
 *
 * 设计要点：
 * - 全程用 UTC ISO 字符串（'...Z'）作为 time，避免本地时区干扰断言。
 * - 浮点结果用 toBeCloseTo 容差断言，不做字符串比较。
 */
import { describe, it, expect } from 'vitest'
import {
  calcRefuelComparison,
  calcRefuelListWithComparison,
  calcStatistics,
  predictRefuelRange,
  checkLowFuelWarning
} from './calc.js'

// ---- 测试数据构造器（带默认值，便于覆盖分支）----
function refuel(over = {}) {
  return {
    id: over.id || 'rid',
    time: over.time || '2026-01-01T00:00:00Z',
    isFull: true,
    fuelType: '92',
    volume: 40,
    price: 7,
    cost: 280,
    totalMileage: 1000,
    estimatedRange: 0,
    remark: '',
    ...over
  }
}

function trip(over = {}) {
  return {
    id: over.id || 'tid',
    time: over.time || '2026-01-04T00:00:00Z',
    totalMileage: 2000,
    estimatedRange: 0,
    remark: '',
    ...over
  }
}

// =====================================================================
describe('calcRefuelComparison', () => {
  it('prev 为 null → 不可计算，原因「首次加油」', () => {
    const r = calcRefuelComparison(refuel(), null)
    expect(r.calculable).toBe(false)
    expect(r.reason).toBe('首次加油，无对比数据')
    expect(r.intervalMileage).toBeNull()
    expect(r.fuelPer100km).toBeNull()
    expect(r.costPerKm).toBeNull()
    expect(r.totalCost).toBeNull()
  })

  it('任一条未加满 → 不可计算，原因「未加满油箱」', () => {
    // 当前未加满
    expect(calcRefuelComparison(refuel({ isFull: false }), refuel()).calculable).toBe(false)
    // 上一条未加满
    expect(calcRefuelComparison(refuel(), refuel({ isFull: false })).reason)
      .toBe('未加满油箱，无法准确计算油耗')
  })

  it('本次总里程未超过上次（interval<=0）→ 不可计算', () => {
    const prev = refuel({ totalMileage: 1000 })
    // 相等
    const eq = calcRefuelComparison(refuel({ totalMileage: 1000 }), prev)
    expect(eq.calculable).toBe(false)
    expect(eq.intervalMileage).toBe(0)
    expect(eq.reason).toContain('未超过上次')
    // 倒退
    const neg = calcRefuelComparison(refuel({ totalMileage: 900 }), prev)
    expect(neg.calculable).toBe(false)
    expect(neg.intervalMileage).toBe(-100)
  })

  it('正常满油对比 → 计算百公里油耗/每公里费用/总费用', () => {
    const cur = refuel({ totalMileage: 1500, volume: 40 })
    const prev = refuel({ totalMileage: 1000, price: 7 })
    const r = calcRefuelComparison(cur, prev)
    expect(r.calculable).toBe(true)
    expect(r.reason).toBe('')
    expect(r.intervalMileage).toBe(500)
    expect(r.fuelPer100km).toBeCloseTo(8, 6)        // 40/500*100
    expect(r.costPerKm).toBeCloseTo(0.56, 6)        // 40*7/500
    expect(r.totalCost).toBeCloseTo(280, 6)         // 40*7
  })
})

// =====================================================================
describe('calcRefuelListWithComparison', () => {
  it('空列表 → 返回空数组', () => {
    expect(calcRefuelListWithComparison([])).toEqual([])
    expect(calcRefuelListWithComparison(null)).toEqual([])
  })

  it('单条记录 → 对比不可计算（无上一条）', () => {
    const out = calcRefuelListWithComparison([refuel({ id: 'a' })])
    expect(out).toHaveLength(1)
    expect(out[0].comparison.calculable).toBe(false)
    expect(out[0].comparison.reason).toBe('首次加油，无对比数据')
  })

  it('乱序输入 → 按时间正序两两比较，再倒序返回', () => {
    const a = refuel({ id: 'a', time: '2026-01-01T00:00:00Z', totalMileage: 1000, volume: 40 })
    const b = refuel({ id: 'b', time: '2026-01-15T00:00:00Z', totalMileage: 1500, volume: 40 })
    const c = refuel({ id: 'c', time: '2026-01-30T00:00:00Z', totalMileage: 2000, volume: 40, isFull: false })
    const out = calcRefuelListWithComparison([c, b, a]) // 故意乱序

    // 返回倒序：c, b, a
    expect(out.map(r => r.id)).toEqual(['c', 'b', 'a'])
    // a 无上一条 → 不可计算
    expect(out[2].comparison.calculable).toBe(false)
    // b 对比 a → 可计算，油耗 8
    expect(out[1].comparison.calculable).toBe(true)
    expect(out[1].comparison.fuelPer100km).toBeCloseTo(8, 6)
    // c 未加满 → 不可计算
    expect(out[0].comparison.calculable).toBe(false)
  })
})

// =====================================================================
describe('calcStatistics', () => {
  it('空列表 → 全为零', () => {
    const s = calcStatistics([])
    expect(s).toEqual({
      refuelCount: 0,
      totalVolume: 0,
      totalCost: 0,
      totalIntervalMileage: 0,
      avgFuelPer100km: 0,
      avgCostPerKm: 0,
      avgPrice: 0
    })
  })

  it('无可用对比 → 平均值归零，但总量/均价仍按全部记录计算', () => {
    const list = [refuel({ volume: 40, cost: 280, price: 7, comparison: { calculable: false } })]
    const s = calcStatistics(list)
    expect(s.refuelCount).toBe(1)
    expect(s.totalVolume).toBe(40)
    expect(s.totalCost).toBe(280)
    expect(s.avgPrice).toBe(7)
    expect(s.avgFuelPer100km).toBe(0)
    expect(s.avgCostPerKm).toBe(0)
  })

  it('混合（含可计算与不可计算）→ 平均值仅取可计算项', () => {
    const list = [
      refuel({ volume: 40, cost: 280, price: 7, comparison: { calculable: true, intervalMileage: 500, fuelPer100km: 8, costPerKm: 0.56 } }),
      refuel({ volume: 30, cost: 210, price: 7, comparison: { calculable: true, intervalMileage: 400, fuelPer100km: 7.5, costPerKm: 0.525 } }),
      refuel({ volume: 25, cost: 175, price: 8, comparison: { calculable: false } })
    ]
    const s = calcStatistics(list)
    expect(s.refuelCount).toBe(3)
    expect(s.totalVolume).toBe(95)
    expect(s.totalCost).toBe(665)
    expect(s.totalIntervalMileage).toBe(900)
    expect(s.avgFuelPer100km).toBeCloseTo(7.75, 6)   // (8+7.5)/2
    expect(s.avgCostPerKm).toBeCloseTo(0.5425, 6)    // (0.56+0.525)/2
    expect(s.avgPrice).toBeCloseTo(7.3333, 3)        // (7+7+8)/3
  })
})

// =====================================================================
describe('predictRefuelRange', () => {
  const r1 = refuel({ id: 'r1', time: '2026-01-01T00:00:00Z', totalMileage: 1000, volume: 40, price: 7 })
  const r2 = refuel({ id: 'r2', time: '2026-01-02T00:00:00Z', totalMileage: 1500, volume: 40, price: 7 })
  const r3 = refuel({ id: 'r3', time: '2026-01-03T00:00:00Z', totalMileage: 2000, volume: 40, price: 7 })

  it('无历史加油记录 → null', () => {
    expect(predictRefuelRange(refuel(), [])).toBeNull()
  })

  it('仅有当前记录（无更早记录）→ null', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-05T00:00:00Z' })
    expect(predictRefuelRange(cur, [cur])).toBeNull()
  })

  it('更早记录均不可计算油耗 → null', () => {
    // r1/r2 都未加满 → 对比不可计算 → fuelCount 0
    const a = refuel({ id: 'a', time: '2026-01-01T00:00:00Z', isFull: false, totalMileage: 1000 })
    const b = refuel({ id: 'b', time: '2026-01-02T00:00:00Z', totalMileage: 1500 })
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', totalMileage: 2000 })
    expect(predictRefuelRange(cur, [a, b, cur], { tankCapacity: 50 })).toBeNull()
  })

  it('历史可计算但未加满 → 不可计算，原因「未加满」，但带回均值', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', isFull: false, totalMileage: 2000 })
    const r = predictRefuelRange(cur, [r1, r2, cur], { tankCapacity: 50 })
    expect(r.calculable).toBe(false)
    expect(r.reason).toContain('未加满')
    expect(r.avgFuel).toBeCloseTo(8, 6)
    expect(r.predictedRange).toBeNull()
    expect(r.predictedDays).toBeNull()
  })

  it('历史可计算但无油箱容量 → 不可计算，原因「未设置油箱容量」', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', totalMileage: 2000 })
    const r = predictRefuelRange(cur, [r1, r2, cur], {}) // 无 tankCapacity
    expect(r.calculable).toBe(false)
    expect(r.reason).toContain('油箱容量')
    expect(r.avgFuel).toBeCloseTo(8, 6)
  })

  it('完整可计算路径 → 预测里程/天数/总里程与偏差分析', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', totalMileage: 2000, estimatedRange: 600 })
    const r = predictRefuelRange(cur, [r1, r2, cur], { tankCapacity: 50 })
    expect(r.calculable).toBe(true)
    expect(r.avgFuel).toBeCloseTo(8, 6)
    expect(r.avgDailyMileage).toBeCloseTo(500, 6)        // 500km / 1天
    expect(r.tankCapacity).toBe(50)
    expect(r.predictedRange).toBeCloseTo(625, 6)         // 50/8*100
    expect(r.predictedDays).toBeCloseTo(1.25, 6)         // 625/500
    expect(r.predictedTotalMileage).toBeCloseTo(2625, 6) // 2000+625
    // 偏差：预测 625 vs 用户 600 → diff 25, percent ~4.17% → 一致
    expect(r.userInputRange).toBe(600)
    expect(r.deviation.diff).toBeCloseTo(25, 6)
    expect(r.deviation.percent).toBeCloseTo(4.1667, 3)
    expect(r.deviation.assessment).toBe('一致')
  })

  it('日行驶跨度不足 0.5 天 → avgDailyMileage 归零，predictedDays 归零', () => {
    const a = refuel({ id: 'a', time: '2026-01-01T00:00:00Z', totalMileage: 1000 })
    const b = refuel({ id: 'b', time: '2026-01-01T06:00:00Z', totalMileage: 1500 }) // 仅隔 0.25 天
    const cur = refuel({ id: 'cur', time: '2026-01-02T00:00:00Z', totalMileage: 2000 })
    const r = predictRefuelRange(cur, [a, b, cur], { tankCapacity: 50 })
    expect(r.avgDailyMileage).toBe(0)
    expect(r.predictedRange).toBeCloseTo(625, 6)
    expect(r.predictedDays).toBe(0)
  })

  it('偏差评估阈值：pred>user 超 10% → 偏低', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', totalMileage: 2000, estimatedRange: 400 })
    const r = predictRefuelRange(cur, [r1, r2, cur], { tankCapacity: 50 })
    // 预测 625 vs 用户 400 → diff 225, percent 56.25% → 偏低
    expect(r.deviation.assessment).toBe('偏低')
    expect(r.deviation.percent).toBeCloseTo(56.25, 3)
  })

  it('偏差评估阈值：pred<user 超 10% → 偏高', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', totalMileage: 2000, estimatedRange: 800 })
    const r = predictRefuelRange(cur, [r1, r2, cur], { tankCapacity: 50 })
    // 预测 625 vs 用户 800 → diff -175, percent -21.875% → 偏高
    expect(r.deviation.assessment).toBe('偏高')
    expect(r.deviation.percent).toBeCloseTo(-21.875, 3)
  })

  it('未填写预计可行驶里程（estimatedRange=0）→ deviation 为 null', () => {
    const cur = refuel({ id: 'cur', time: '2026-01-03T00:00:00Z', totalMileage: 2000, estimatedRange: 0 })
    const r = predictRefuelRange(cur, [r1, r2, cur], { tankCapacity: 50 })
    expect(r.userInputRange).toBe(0)
    expect(r.deviation).toBeNull()
  })
})

// =====================================================================
describe('checkLowFuelWarning', () => {
  // 三条可计算历史，使最新一次加油能产出「智能预测」
  const r1 = refuel({ id: 'r1', time: '2026-01-01T00:00:00Z', totalMileage: 1000, volume: 40, price: 7 })
  const r2 = refuel({ id: 'r2', time: '2026-01-02T00:00:00Z', totalMileage: 1500, volume: 40, price: 7 })
  const r3 = refuel({ id: 'r3', time: '2026-01-03T00:00:00Z', totalMileage: 2000, volume: 40, price: 7, estimatedRange: 0 })
  const all = [r1, r2, r3]

  it('无任何加油记录 → 空警告，latestRefuel 为 null', () => {
    const r = checkLowFuelWarning(trip(), [], { tankCapacity: 50 })
    expect(r.warnings).toEqual([])
    expect(r.latestRefuel).toBeNull()
    expect(r.refuelEstTotal).toBe(0)
    expect(r.remaining).toBeNull()
  })

  it('行程前无更早加油记录 → latestRefuel 为 null', () => {
    // 唯一加油记录发生在行程之后
    const later = refuel({ id: 'later', time: '2026-01-10T00:00:00Z' })
    const r = checkLowFuelWarning(trip({ time: '2026-01-04T00:00:00Z' }), [later], { tankCapacity: 50 })
    expect(r.latestRefuel).toBeNull()
    expect(r.warnings).toEqual([])
  })

  it('剩余充足且无行程低油量 → 无警告（usePrediction=true）', () => {
    const r = checkLowFuelWarning(trip({ totalMileage: 2000, estimatedRange: 0 }), all, { tankCapacity: 50 })
    expect(r.warnings).toEqual([])
    expect(r.latestRefuel.id).toBe('r3')
    expect(r.usePrediction).toBe(true)
    expect(r.refuelEstTotal).toBeCloseTo(2625, 6) // 2000 + 50/8*100
    expect(r.remaining).toBeCloseTo(625, 6)
  })

  it('剩余里程 < 50（基于智能预测）→ 触发预警，来源标注「智能预测」', () => {
    const r = checkLowFuelWarning(trip({ totalMileage: 2600, estimatedRange: 0 }), all, { tankCapacity: 50 })
    expect(r.remaining).toBeCloseTo(25, 6) // 2625 - 2600
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('智能预测')
    expect(r.warnings[0]).toContain('25 km')
  })

  it('行程自身预计可行驶 < 50 → 触发第二条预警', () => {
    const r = checkLowFuelWarning(trip({ totalMileage: 1000, estimatedRange: 30 }), all, { tankCapacity: 50 })
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('行程记录显示剩余可行驶里程仅 30 km')
  })

  it('加油记录无历史可计算 → 退回「加油时输入」口径，usePrediction=false', () => {
    // 仅一条加油记录，预测为 null
    const only = refuel({ id: 'only', time: '2026-01-02T00:00:00Z', totalMileage: 1500, estimatedRange: 100 })
    const r = checkLowFuelWarning(trip({ time: '2026-01-04T00:00:00Z', totalMileage: 1580 }), [only], { tankCapacity: 50 })
    expect(r.usePrediction).toBe(false)
    expect(r.refuelEstTotal).toBeCloseTo(1600, 6) // 1500 + 100
    expect(r.remaining).toBeCloseTo(20, 6)         // 1600 - 1580
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('加油时输入')
    expect(r.warnings[0]).toContain('20 km')
  })
})
