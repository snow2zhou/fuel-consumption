import { describe, it, expect } from 'vitest'
import {
  parseNextAdjustment,
  normalizeOilPrice,
  fuelKeyOf,
  fuelKindOf,
  perTonToPerLiter,
  judgeDirection,
  confidenceOf,
  formatCountdown,
  buildAdvice,
  adjustmentDayLabel,
  buildPriceSeries,
  matchFuelKey,
  sniffPrices,
  priceOnDate,
  weightedAveragePrice,
  normalizeProvinceName,
  toDateStr,
  shiftWorkdays,
  pickEffectiveDate,
  nextWindowFrom,
  ensureNextAdjustment,
  computeForecastFromKlines,
  isPriceRecordStale,
  ADJUST_THRESHOLD_PER_TON,
  LITERS_PER_TON
} from './oilPrice'

// 真实接口返回（2026-10-28 抓取）作为 fixture
const FIXTURE = {
  code: 0,
  msg: 'cached',
  data: {
    province: '北京',
    update_date: '2026-10-28',
    prices: [
      { name: '92号汽油', type: 'gasoline_92', price: 8.61, unit: '元/升' },
      { name: '95号汽油', type: 'gasoline_95', price: 9.17, unit: '元/升' },
      { name: '98号汽油', type: 'gasoline_98', price: 10.67, unit: '元/升' },
      { name: '0号柴油', type: 'diesel_0', price: 8.36, unit: '元/升' }
    ],
    next_adjustment: '下次油价10月29日24时调整',
    forecast: '变化率7.18%，预计上调油价410元/吨',
    change_rate: 7.18,
    change_rate_as_of: '2026-10-28',
    working_day: 9,
    crude_avg_usd: 106.05,
    estimated_change_per_ton: 410
  }
}

describe('parseNextAdjustment', () => {
  it('解析「10月29日24时」，24 时归一到次日 00:00', () => {
    const now = new Date(2026, 9, 28, 16, 0, 0)
    const r = parseNextAdjustment('下次油价10月29日24时调整', now)
    expect(r).not.toBeNull()
    expect(r.year).toBe(2026)
    expect(r.month).toBe(10)
    expect(r.day).toBe(29)
    expect(r.label).toBe('10月29日 24:00')
    const d = new Date(r.at)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(30)
    expect(d.getHours()).toBe(0)
  })

  it('跨年：12 月看到「1月5日」应归入明年', () => {
    const now = new Date(2026, 11, 28, 10, 0, 0)
    const r = parseNextAdjustment('下次油价1月5日24时调整', now)
    expect(r.year).toBe(2027)
    expect(r.month).toBe(1)
  })

  it('同年未来日期不加年', () => {
    const now = new Date(2026, 9, 28, 10, 0, 0)
    expect(parseNextAdjustment('11月12日24时调整', now).year).toBe(2026)
  })

  it('兼容不同文案与显式小时', () => {
    const now = new Date(2026, 9, 28)
    expect(parseNextAdjustment('调价时间：10月29日 22时', now).hour).toBe(22)
    expect(parseNextAdjustment('10月29日调整', now).hour).toBe(24)
  })

  it('空值/无法解析返回 null', () => {
    expect(parseNextAdjustment('')).toBeNull()
    expect(parseNextAdjustment(null)).toBeNull()
    expect(parseNextAdjustment('下次油价待定')).toBeNull()
  })
})

describe('normalizeOilPrice', () => {
  const data = normalizeOilPrice(FIXTURE, '北京')

  it('油品价格映射正确', () => {
    expect(data.prices.gasoline_92).toBe(8.61)
    expect(data.prices.gasoline_95).toBe(9.17)
    expect(data.prices.diesel_0).toBe(8.36)
  })

  it('调价时间与测算字段正确', () => {
    expect(data.nextAdjustment.label).toBe('10月29日 24:00')
    expect(data.forecast.perTon).toBe(410)
    expect(data.forecast.changeRate).toBe(7.18)
    expect(data.forecast.workingDay).toBe(9)
    expect(data.forecast.crudeAvg).toBe(106.05)
  })

  it('缺字段时不抛错（返回 null）', () => {
    const empty = normalizeOilPrice({}, '广东')
    expect(empty.province).toBe('广东')
    expect(empty.nextAdjustment).toBeNull()
    expect(empty.forecast.perTon).toBeNull()
    expect(empty.prices).toEqual({})
  })
})

describe('fuelKeyOf / fuelKindOf', () => {
  it('油号映射到接口字段与换算类型', () => {
    expect(fuelKeyOf('92#')).toBe('gasoline_92')
    expect(fuelKeyOf('95#')).toBe('gasoline_95')
    expect(fuelKeyOf('98#')).toBe('gasoline_98')
    expect(fuelKeyOf('柴油')).toBe('diesel_0')
    expect(fuelKeyOf('未知')).toBe('gasoline_92')
    expect(fuelKindOf('柴油')).toBe('diesel')
    expect(fuelKindOf('95#')).toBe('gasoline')
  })
})

describe('perTonToPerLiter', () => {
  it('汽油/柴油按不同吨升系数换算', () => {
    expect(perTonToPerLiter(410, 'gasoline')).toBeCloseTo(410 / LITERS_PER_TON.gasoline, 6)
    expect(perTonToPerLiter(410, 'diesel')).toBeCloseTo(410 / LITERS_PER_TON.diesel, 6)
    expect(perTonToPerLiter(410, 'gasoline')).toBeCloseTo(0.2954, 4)
  })

  it('无效输入返回 null', () => {
    expect(perTonToPerLiter(null)).toBeNull()
    expect(perTonToPerLiter('')).toBeNull()
    expect(perTonToPerLiter(undefined)).toBeNull()
  })
})

describe('judgeDirection', () => {
  it('50 元/吨为门槛边界', () => {
    expect(ADJUST_THRESHOLD_PER_TON).toBe(50)
    expect(judgeDirection(410)).toBe('up')
    expect(judgeDirection(50)).toBe('up')
    expect(judgeDirection(49)).toBe('flat')
    expect(judgeDirection(0)).toBe('flat')
    expect(judgeDirection(-49)).toBe('flat')
    expect(judgeDirection(-50)).toBe('down')
    expect(judgeDirection(-300)).toBe('down')
  })

  it('缺失值视为未知', () => {
    expect(judgeDirection(null)).toBe('unknown')
    expect(judgeDirection('')).toBe('unknown')
  })
})

describe('confidenceOf', () => {
  it('越接近调价日把握度越高', () => {
    expect(confidenceOf(9, 200)).toBe('high')
    expect(confidenceOf(8, 200)).toBe('high')
    expect(confidenceOf(6, 200)).toBe('medium')
    expect(confidenceOf(2, 200)).toBe('low')
  })

  it('距生效 48 小时内一律高', () => {
    expect(confidenceOf(2, 24)).toBe('high')
    expect(confidenceOf(null, 1)).toBe('high')
  })

  it('无工作日信息时为低', () => {
    expect(confidenceOf(null, null)).toBe('low')
  })
})

describe('formatCountdown', () => {
  it('按天/小时/分钟分级展示', () => {
    expect(formatCountdown(30 * 3600 * 1000)).toBe('约 1 天 6 小时')
    expect(formatCountdown(12 * 3600 * 1000)).toBe('约 12 小时')
    expect(formatCountdown(10 * 60 * 1000)).toBe('约 10 分钟')
    expect(formatCountdown(-1)).toBe('已到调价时间')
    expect(formatCountdown(null)).toBe('—')
  })
})

describe('adjustmentDayLabel', () => {
  const adj = { year: 2026, month: 10, day: 29, at: 0, label: '10月29日 24:00' }

  it('当天 / 前一天 / 昨天', () => {
    expect(adjustmentDayLabel(adj, new Date(2026, 9, 29, 9))).toBe('今日 24 时调价')
    expect(adjustmentDayLabel(adj, new Date(2026, 9, 28, 23))).toBe('明日 24 时调价')
    expect(adjustmentDayLabel(adj, new Date(2026, 9, 30, 9))).toBe('昨日已调价')
  })

  it('更远的日期不提示', () => {
    expect(adjustmentDayLabel(adj, new Date(2026, 9, 25))).toBe('')
    expect(adjustmentDayLabel(adj, new Date(2026, 10, 2))).toBe('')
  })

  it('空值安全', () => {
    expect(adjustmentDayLabel(null)).toBe('')
    expect(adjustmentDayLabel({})).toBe('')
  })
})

describe('buildPriceSeries', () => {
  const raw = [
    { time: '2026-09-10T02:00:00Z', date: '2026-09-10', price: 8.4 },
    { time: '2026-09-24T02:00:00Z', date: '2026-09-24', price: 8.58 },
    { time: '2026-09-24T08:00:00Z', date: '2026-09-24', price: 8.58 }, // 同价重复
    { time: '2026-10-16T02:00:00Z', date: '2026-10-16', price: 8.58 }, // 搁浅，价格未变
    { time: '2026-10-28T02:00:00Z', date: '2026-10-28', price: 8.61 },
    { time: '2026-10-28T03:00:00Z', date: '2026-10-28', price: null } // 无效
  ]

  it('按时间排序并合并连续同价，只保留变更点', () => {
    const s = buildPriceSeries(raw)
    expect(s.length).toBe(3)
    expect(s.map(p => p.price)).toEqual([8.4, 8.58, 8.61])
    expect(s[0].prev).toBeNull()
    expect(s[1].prev).toBe(8.4)
    expect(s[2].prev).toBe(8.58)
  })

  it('乱序输入也能正确排序', () => {
    const s = buildPriceSeries([raw[4], raw[0], raw[1]])
    expect(s.map(p => p.date)).toEqual(['2026-09-10', '2026-09-24', '2026-10-28'])
  })

  it('空输入/非数组返回空数组', () => {
    expect(buildPriceSeries([])).toEqual([])
    expect(buildPriceSeries(null)).toEqual([])
    expect(buildPriceSeries(undefined)).toEqual([])
  })
})

describe('buildAdvice', () => {
  const base = { perTon: 410, perLiter: perTonToPerLiter(410, 'gasoline'), workingDay: 9, tankCapacity: 60 }

  it('上调 + 把握度高 → 建议调价前加满', () => {
    const r = buildAdvice({ ...base, direction: 'up', confidence: 'high', hoursLeft: 12 })
    expect(r.level).toBe('now')
    expect(r.title).toContain('调价前')
    expect(r.detail).toContain('0.30')
    expect(r.detail).toContain('18 元') // 0.2954 * 60 ≈ 17.7 → 18
  })

  it('上调 + 把握度低 → 提示结论未定（周期早期易反转）', () => {
    const r = buildAdvice({ ...base, direction: 'up', confidence: 'low', workingDay: 3, hoursLeft: 24 * 7 })
    expect(r.level).toBe('watch')
    expect(r.detail).toContain('第 3 个工作日')
  })

  it('下调 → 可以等', () => {
    const r = buildAdvice({
      direction: 'down', perTon: -210, perLiter: perTonToPerLiter(-210, 'gasoline'),
      confidence: 'high', workingDay: 9, hoursLeft: 12, tankCapacity: 60
    })
    expect(r.level).toBe('wait')
    expect(r.detail).toContain('省')
  })

  it('搁浅 → 涨跌都一样', () => {
    const r = buildAdvice({
      direction: 'flat', perTon: 30, perLiter: perTonToPerLiter(30, 'gasoline'),
      confidence: 'high', workingDay: 10, hoursLeft: 2, tankCapacity: 60
    })
    expect(r.level).toBe('either')
    expect(r.detail).toContain('50 元/吨')
  })

  it('续航撑不到调价日 → 优先建议先加', () => {
    const r = buildAdvice({
      ...base, direction: 'up', confidence: 'high', hoursLeft: 100,
      rangeKm: 50, avgDailyKm: 50
    })
    expect(r.level).toBe('now')
    expect(r.title).toContain('先加')
  })

  it('续航充足时不改变原建议', () => {
    const r = buildAdvice({
      ...base, direction: 'down', perLiter: perTonToPerLiter(-210, 'gasoline'),
      confidence: 'high', hoursLeft: 100, rangeKm: 600, avgDailyKm: 50
    })
    expect(r.level).toBe('wait')
  })

  it('缺少测算数据 → unknown', () => {
    expect(buildAdvice({ direction: 'unknown' }).level).toBe('unknown')
    expect(buildAdvice({ direction: 'up', perLiter: null }).level).toBe('unknown')
  })

  it('无油箱容量时不输出金额文案', () => {
    const r = buildAdvice({
      direction: 'up', perTon: 410, perLiter: perTonToPerLiter(410, 'gasoline'),
      confidence: 'high', workingDay: 9, hoursLeft: 12, tankCapacity: null
    })
    expect(r.detail).not.toContain('加满')
  })
})

describe('normalizeProvinceName', () => {
  it('去掉行政后缀', () => {
    expect(normalizeProvinceName('北京市')).toBe('北京')
    expect(normalizeProvinceName('青海省')).toBe('青海')
    expect(normalizeProvinceName('广西壮族自治区')).toBe('广西')
    expect(normalizeProvinceName('宁夏回族自治区')).toBe('宁夏')
    expect(normalizeProvinceName('新疆维吾尔自治区')).toBe('新疆')
    expect(normalizeProvinceName('内蒙古自治区')).toBe('内蒙古')
    expect(normalizeProvinceName('西藏自治区')).toBe('西藏')
    expect(normalizeProvinceName('香港特别行政区')).toBe('香港')
  })

  it('简称/空值安全', () => {
    expect(normalizeProvinceName('北京')).toBe('北京')
    expect(normalizeProvinceName('')).toBe('')
    expect(normalizeProvinceName(null)).toBe('')
  })
})

describe('matchFuelKey', () => {
  it('常见命名都能识别', () => {
    expect(matchFuelKey('92号汽油')).toBe('gasoline_92')
    expect(matchFuelKey('gasoline_95')).toBe('gasoline_95')
    expect(matchFuelKey('n98')).toBe('gasoline_98')
    expect(matchFuelKey('ap98')).toBe('gasoline_98')
    expect(matchFuelKey('0号柴油')).toBe('diesel_0')
    expect(matchFuelKey('0h')).toBe('diesel_0')
    expect(matchFuelKey('t0')).toBe('diesel_0')
    expect(matchFuelKey('0')).toBe('diesel_0')
  })

  it('无关字段返回 null', () => {
    expect(matchFuelKey('province')).toBeNull()
    expect(matchFuelKey('price')).toBeNull()
    expect(matchFuelKey('')).toBeNull()
    expect(matchFuelKey(null)).toBeNull()
  })
})

describe('sniffPrices', () => {
  it('数组形态 {name, price}', () => {
    const p = sniffPrices([
      { name: '92号汽油', price: 8.61 },
      { name: '95号汽油', price: 9.17 },
      { name: '0号柴油', price: 8.36 }
    ])
    expect(p).toEqual({ gasoline_92: 8.61, gasoline_95: 9.17, diesel_0: 8.36 })
  })

  it('扁平形态（天行/接口盒子）', () => {
    expect(sniffPrices({ result: { n92: 8.61, n95: 9.17, n0: 8.36 } })).toEqual({
      gasoline_92: 8.61, gasoline_95: 9.17, diesel_0: 8.36
    })
    expect(sniffPrices({ data: { data1: { '92': 7.28, '0': 6.88 } } })).toEqual({
      gasoline_92: 7.28, diesel_0: 6.88
    })
  })

  it('字符串数字可解析', () => {
    expect(sniffPrices({ t92: '8.10' })).toEqual({ gasoline_92: 8.1 })
  })

  it('过滤超范围数值与无关字段', () => {
    expect(sniffPrices({ '92': 92, msg: 'ok', limit: 5 })).toEqual({})
    expect(sniffPrices({ '95': 0.9 })).toEqual({})
  })

  it('空/异常输入安全', () => {
    expect(sniffPrices(null)).toEqual({})
    expect(sniffPrices('x')).toEqual({})
    expect(sniffPrices({})).toEqual({})
  })
})

describe('priceOnDate', () => {
  const points = [
    { date: '2026-09-10', time: '2026-09-10T02:00:00Z', price: 8.28 },
    { date: '2026-09-24', time: '2026-09-24T02:00:00Z', price: 8.43 },
    { date: '2026-10-16', time: '2026-10-16T02:00:00Z', price: 8.61 }
  ]

  it('取当天生效价（含边界日）', () => {
    expect(priceOnDate(points, '2026-09-24').price).toBe(8.43)
    expect(priceOnDate(points, '2026-09-23').price).toBe(8.28)
    expect(priceOnDate(points, '2026-10-28').price).toBe(8.61)
  })

  it('早于第一条记录返回 null（不猜）', () => {
    expect(priceOnDate(points, '2026-09-01')).toBeNull()
  })

  it('空输入与非法日期安全', () => {
    expect(priceOnDate([], '2026-09-24')).toBeNull()
    expect(priceOnDate(null, '2026-09-24')).toBeNull()
    expect(priceOnDate(points, '')).toBeNull()
  })

  it('乱序输入也能正确取到', () => {
    expect(priceOnDate([points[2], points[0], points[1]], '2026-09-30').price).toBe(8.43)
  })

  it('返回对应的记录日期', () => {
    expect(priceOnDate(points, '2026-10-20').date).toBe('2026-10-16')
  })
})

describe('weightedAveragePrice', () => {
  it('按加油量加权', () => {
    expect(weightedAveragePrice([{ price: 8, volume: 10 }, { price: 9, volume: 30 }]))
      .toBeCloseTo(8.75, 6)
  })

  it('忽略无效项', () => {
    expect(weightedAveragePrice([
      { price: 0, volume: 10 }, { price: 9, volume: 0 }, { price: 8, volume: 10 }
    ])).toBe(8)
  })

  it('空/无有效数据返回 null', () => {
    expect(weightedAveragePrice([])).toBeNull()
    expect(weightedAveragePrice(null)).toBeNull()
    expect(weightedAveragePrice([{ price: 0, volume: 0 }])).toBeNull()
  })
})

describe('toDateStr / shiftWorkdays', () => {
  it('时间戳转本地日期', () => {
    const ts = new Date(2026, 9, 30, 0, 0, 0).getTime()
    expect(toDateStr(ts)).toBe('2026-10-30')
    expect(toDateStr('')).toBe('')
    expect(toDateStr(null)).toBe('')
  })

  it('按工作日前后平移（跳过周末）', () => {
    // 2026-10-30 是周五，往前 10 个工作日 = 10-16
    expect(shiftWorkdays('2026-10-30', -10)).toBe('2026-10-16')
    expect(shiftWorkdays('2026-10-16', 10)).toBe('2026-10-30')
    expect(shiftWorkdays('2026-10-30', 1)).toBe('2026-11-02') // 周五 +1 → 下周一
    expect(shiftWorkdays('bad', -10)).toBeNull()
  })
})

describe('pickEffectiveDate', () => {
  const nextWindowAt = new Date(2026, 9, 30, 0, 0, 0).getTime() // 10-29 24:00

  it('来源直接给了价格日期时优先用它', () => {
    expect(pickEffectiveDate({
      priceDate: '2026-10-16', nextWindowAt, updateDate: '2026-10-28', today: '2026-10-28'
    })).toBe('2026-10-16')
  })

  it('上一条记录的下次窗口已过去 → 新价从该窗口生效', () => {
    const lastNextWindowAt = new Date(2026, 9, 16, 0, 0, 0).getTime()
    expect(pickEffectiveDate({
      nextWindowAt, lastNextWindowAt, today: '2026-10-28'
    })).toBe('2026-10-16')
  })

  it('上一条窗口还在未来时不采用，改用 10 个工作日回推', () => {
    const futureWindow = new Date(2026, 10, 30, 0, 0, 0).getTime()
    expect(pickEffectiveDate({
      nextWindowAt, lastNextWindowAt: futureWindow, today: '2026-10-28'
    })).toBe('2026-10-16')
  })

  it('没有价格日期时由下次窗口回推 10 个工作日', () => {
    expect(pickEffectiveDate({ nextWindowAt, today: '2026-10-28' })).toBe('2026-10-16')
  })

  it('没有窗口信息时退回数据更新日', () => {
    expect(pickEffectiveDate({ updateDate: '2026-10-16', today: '2026-10-28' })).toBe('2026-10-16')
  })

  it('什么都没有时用今天', () => {
    expect(pickEffectiveDate({ today: '2026-10-28' })).toBe('2026-10-28')
  })

  it('绝不用"下次窗口"当生效日（否则窗口前的加油查不到价）', () => {
    const d = pickEffectiveDate({ nextWindowAt, today: '2026-10-28' })
    expect(d).not.toBe('2026-10-30')
    expect(d < '2026-10-28').toBe(true)
  })
})

describe('nextWindowFrom', () => {
  it('10-16 生效 → 下次窗口 10-29 24:00（10-30 00:00 生效）', () => {
    const w = nextWindowFrom('2026-10-16')
    expect(w.year).toBe(2026)
    expect(w.month).toBe(10)
    expect(w.day).toBe(29)
    expect(w.label).toBe('10月29日 24:00')
    expect(w.derived).toBe(true)
    expect(toDateStr(w.at)).toBe('2026-10-30')
  })

  it('假期生效：9-25（中秋假期）→ 窗口 10-15 24:00（10-16 生效）', () => {
    const w = nextWindowFrom('2026-09-25')
    expect(w.day).toBe(15)
    expect(w.label).toBe('10月15日 24:00')
    expect(toDateStr(w.at)).toBe('2026-10-16')
  })

  it('跨国庆：9-30 生效 → 窗口被假期推到 10-19', () => {
    const w = nextWindowFrom('2026-09-30')
    expect(w.label).toBe('10月19日 24:00')
  })
})

describe('ensureNextAdjustment', () => {
  it('已有窗口时保持原样', () => {
    const data = { nextAdjustment: { at: 123, label: 'x' }, priceDate: '2026-10-16' }
    expect(ensureNextAdjustment(data)).toBe(data)
  })

  it('缺窗口但有价格日期时补一个推算值', () => {
    const data = { nextAdjustment: null, priceDate: '2026-10-16', prices: { gasoline_92: 8.61 } }
    const out = ensureNextAdjustment(data)
    expect(out.nextAdjustment.day).toBe(29)
    expect(out.nextAdjustment.derived).toBe(true)
  })

  it('既无窗口也无价格日期时不动', () => {
    const data = { nextAdjustment: null, prices: {} }
    expect(ensureNextAdjustment(data).nextAdjustment).toBeNull()
  })
})

describe('computeForecastFromKlines（原油自算测算）', () => {
  function dailyCloses(startStr, days, close) {
    const out = []
    let d = startStr
    for (let i = 0; i < days; i++) {
      out.push({ date: d, close })
      d = toDateStr(new Date(new Date(`${d}T12:00:00`).getTime() + 86400000))
    }
    return out
  }

  const build = (brentPrev, wtiPrev, brentCur, wtiCur) => ({
    // 9/1..10/15 为上轮价，10/16 起为本轮价（10-16 正是测试用周期的生效日）
    brent: [
      ...dailyCloses('2026-09-01', 45, brentPrev),
      ...dailyCloses('2026-10-16', 20, brentCur)
    ],
    wti: [
      ...dailyCloses('2026-09-01', 45, wtiPrev),
      ...dailyCloses('2026-10-16', 20, wtiCur)
    ]
  })

  it('上调：本轮均价高于上轮', () => {
    const { brent, wti } = build(100, 90, 110, 100) // 上轮 95 → 本轮 105
    const f = computeForecastFromKlines({
      brent, wti, cycleStart: '2026-10-16', fx: 7.1, today: '2026-10-29'
    })
    expect(f.changeRate).toBe(10.53)
    expect(f.perTon).toBe(520) // (105-95) × 7.33 × 7.1
    expect(f.crudeAvg).toBe(105)
    expect(f.workingDay).toBe(10)
    expect(f.text).toContain('自算')
  })

  it('搁浅：变化不足 50 元/吨', () => {
    const f = computeForecastFromKlines({
      brent: [
        ...dailyCloses('2026-09-01', 30, 100),
        ...dailyCloses('2026-10-01', 30, 100.3)
      ],
      wti: [
        ...dailyCloses('2026-09-01', 30, 100),
        ...dailyCloses('2026-10-01', 30, 100.3)
      ],
      cycleStart: '2026-10-16', fx: 7.1, today: '2026-10-29'
    })
    expect(f.perTon).toBeLessThan(50)
    expect(f.perTon).toBeGreaterThan(-50)
  })

  it('下调：本轮均价低于上轮', () => {
    const { brent, wti } = build(110, 100, 100, 90) // 上轮 105 → 本轮 95
    const f = computeForecastFromKlines({
      brent, wti, cycleStart: '2026-10-16', fx: 7.1, today: '2026-10-29'
    })
    expect(f.perTon).toBe(-520)
  })

  it('周期起始日当天/次日也能算（工作日不足 10 个按已有天数）', () => {
    const { brent, wti } = build(100, 90, 110, 100)
    const f = computeForecastFromKlines({
      brent, wti, cycleStart: '2026-10-28', fx: 7.1, today: '2026-10-29'
    })
    expect(f).not.toBeNull()
    expect(f.workingDay).toBe(2)
  })

  it('输入不完整时返回 null', () => {
    expect(computeForecastFromKlines({ brent: [], wti: [], cycleStart: '2026-10-16' })).toBeNull()
    expect(computeForecastFromKlines({
      brent: dailyCloses('2026-09-01', 5, 100),
      wti: dailyCloses('2026-09-01', 5, 100),
      cycleStart: '2026-10-16'
    })).toBeNull()
  })
})

describe('isPriceRecordStale（记录过期判断）', () => {
  it('生效日起一个调价周期内不过期', () => {
    // 10-16 生效 → 下个窗口 10-30，10-29 仍有效
    expect(isPriceRecordStale('2026-10-16', '2026-10-29')).toBe(false)
    expect(isPriceRecordStale('2026-10-16', '2026-10-16')).toBe(false)
  })

  it('达到/跨过下个窗口即过期', () => {
    expect(isPriceRecordStale('2026-10-16', '2026-10-30')).toBe(true)
    expect(isPriceRecordStale('2026-10-16', '2026-11-20')).toBe(true)
  })

  it('跨国庆同样按工作日算（不是自然日）', () => {
    // 9-30 生效 → 下个窗口 10-20（被国庆推后），10-19 仍有效
    expect(isPriceRecordStale('2026-09-30', '2026-10-19')).toBe(false)
    expect(isPriceRecordStale('2026-09-30', '2026-10-20')).toBe(true)
  })

  it('非法输入返回 false', () => {
    expect(isPriceRecordStale('', '2026-10-01')).toBe(false)
    expect(isPriceRecordStale('2026-10-01', '')).toBe(false)
    expect(isPriceRecordStale('bad', '2026-10-01')).toBe(false)
  })
})
