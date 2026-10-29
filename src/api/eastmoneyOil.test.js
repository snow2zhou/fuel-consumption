import { describe, it, expect } from 'vitest'
import {
  mapEmAdjustmentRows, mapEmDetailRows, findAdjustmentDate
} from './eastmoneyOil'

describe('mapEmAdjustmentRows', () => {
  it('解析调价时间线并按日期升序', () => {
    const rows = mapEmAdjustmentRows([
      { DIM_DATE: '2026-09-25 00:00:00', VALUE: 9960, CY_JG: 8890, QY_FD: 395, CY_FD: 385 },
      { DIM_DATE: '2026-08-29 00:00:00', VALUE: 9565, CY_JG: 8505, QY_FD: 30, CY_FD: 30 },
      { DIM_DATE: 'bad', VALUE: 1 }
    ])
    expect(rows.map(r => r.date)).toEqual(['2026-08-29', '2026-09-25'])
    expect(rows[1]).toEqual({
      date: '2026-09-25', gasolinePerTon: 9960, dieselPerTon: 8890,
      gasolineChange: 395, dieselChange: 385
    })
  })

  it('空/异常输入返回空数组', () => {
    expect(mapEmAdjustmentRows(null)).toEqual([])
    expect(mapEmAdjustmentRows(undefined)).toEqual([])
  })
})

describe('mapEmDetailRows', () => {
  it('解析分省明细（V92/V95/V0）', () => {
    const rows = mapEmDetailRows([
      { CITYNAME: '北京', V92: 8.61, V95: 9.17, V0: 8.36, ZDE92: 0.32 },
      { CITYNAME: ' 上海 ', V92: '8.12' }
    ])
    expect(rows[0]).toEqual({ province: '北京', gasoline92: 8.61, gasoline95: 9.17, diesel0: 8.36 })
    expect(rows[1].province).toBe('上海')
    expect(rows[1].gasoline92).toBe(8.12)
  })

  it('过滤无省份名的行', () => {
    expect(mapEmDetailRows([{ V92: 8 }, { CITYNAME: '', V92: 8 }])).toEqual([])
  })
})

describe('findAdjustmentDate', () => {
  const list = [
    { date: '2026-08-29' },
    { date: '2026-09-25' },
    { date: '2026-10-19' }
  ]

  it('取 ≤ 目标日期的最近一次调价', () => {
    expect(findAdjustmentDate(list, '2026-10-28')).toBe('2026-10-19')
    expect(findAdjustmentDate(list, '2026-10-19')).toBe('2026-10-19')
    expect(findAdjustmentDate(list, '2026-10-18')).toBe('2026-09-25')
  })

  it('早于首条返回 null（不猜）', () => {
    expect(findAdjustmentDate(list, '2026-01-01')).toBeNull()
    expect(findAdjustmentDate([], '2026-10-01')).toBeNull()
  })
})
