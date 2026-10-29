import { describe, it, expect, afterEach } from 'vitest'
import {
  isWorkday, shiftWorkdays, addDays, toDateStr, hasHolidayData,
  getHolidayYears, getHolidayYearsInfo, setYearOverride, clearYearOverride
} from './holidays'

describe('节假日数据', () => {
  it('已内置 2026', () => {
    expect(getHolidayYears()).toContain(2026)
    expect(hasHolidayData('2026-10-01')).toBe(true)
    expect(hasHolidayData('2030-10-01')).toBe(false)
  })
})

describe('isWorkday', () => {
  it('法定节假日不是工作日', () => {
    expect(isWorkday('2026-10-01')).toBe(false) // 国庆
    expect(isWorkday('2026-10-07')).toBe(false) // 国庆最后一天
    expect(isWorkday('2026-02-17')).toBe(false) // 春节
    expect(isWorkday('2026-05-01')).toBe(false) // 劳动节
  })

  it('调休上班日即使是周末也算工作日', () => {
    expect(isWorkday('2026-10-10')).toBe(true) // 周六调休上班
    expect(isWorkday('2026-09-20')).toBe(true) // 周日调休上班
    expect(isWorkday('2026-02-14')).toBe(true)
  })

  it('普通工作日与普通周末', () => {
    expect(isWorkday('2026-10-12')).toBe(true) // 周一
    expect(isWorkday('2026-10-11')).toBe(false) // 周日
    expect(isWorkday('2026-10-17')).toBe(false) // 周六
  })

  it('非法输入返回 false', () => {
    expect(isWorkday('')).toBe(false)
    expect(isWorkday('2026-1-1')).toBe(false)
    expect(isWorkday(null)).toBe(false)
  })
})

describe('shiftWorkdays（含节假日）', () => {
  it('跨国庆：9-30 往后 1 个工作日回到 10-08', () => {
    expect(shiftWorkdays('2026-09-30', 1)).toBe('2026-10-08')
  })

  it('跨国庆：10-08 往前 1 个工作日回到 9-30', () => {
    expect(shiftWorkdays('2026-10-08', -1)).toBe('2026-09-30')
  })

  it('调价周期：10-16 往后 10 个工作日 = 10-30', () => {
    expect(shiftWorkdays('2026-10-16', 10)).toBe('2026-10-30')
  })

  it('调价周期：10-30 往前 10 个工作日 = 10-16', () => {
    expect(shiftWorkdays('2026-10-30', -10)).toBe('2026-10-16')
  })

  it('春节前后会跳过整段假期', () => {
    // 2026 春节假期 2/15–2/23，2/14 与 2/28 为调休上班
    expect(shiftWorkdays('2026-02-13', 1)).toBe('2026-02-14')
    expect(shiftWorkdays('2026-02-14', 1)).toBe('2026-02-24')
  })

  it('无节假日数据的年份退化为只跳周末', () => {
    // 2027 暂无官方安排：按周末计算
    expect(shiftWorkdays('2027-10-01', 1)).toBe('2027-10-04')
  })

  it('非法输入返回 null', () => {
    expect(shiftWorkdays('bad', 3)).toBeNull()
    expect(shiftWorkdays('', 3)).toBeNull()
  })
})

describe('addDays / toDateStr', () => {  it('自然日加减', () => {
    expect(addDays('2026-10-30', -1)).toBe('2026-10-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('bad', 1)).toBeNull()
  })

  it('时间戳转本地日期', () => {
    expect(toDateStr(new Date(2026, 9, 29, 23, 0, 0).getTime())).toBe('2026-10-29')
    expect(toDateStr('')).toBe('')
  })
})

describe('按年覆盖（设置页"获取指定年份"）', () => {
  afterEach(() => {
    clearYearOverride(2027)
    clearYearOverride(2026)
  })

  it('写入某年后按新数据判断工作日', () => {
    expect(isWorkday('2027-10-01')).toBe(true) // 无数据时按周五算
    setYearOverride(2027, [
      { date: '2027-10-01', isOffDay: true },
      { date: '2027-10-09', isOffDay: false } // 周六调休上班
    ])
    expect(isWorkday('2027-10-01')).toBe(false)
    expect(isWorkday('2027-10-09')).toBe(true)
    expect(hasHolidayData('2027-10-01')).toBe(true)
    expect(getHolidayYears()).toContain(2027)
  })

  it('清除后回到"无数据"（只跳周末）', () => {
    setYearOverride(2027, [{ date: '2027-10-01', isOffDay: true }])
    clearYearOverride(2027)
    expect(hasHolidayData('2027-01-01')).toBe(false)
    expect(isWorkday('2027-10-01')).toBe(true)
  })

  it('覆盖内置年份，清除后回到内置数据', () => {
    expect(isWorkday('2026-10-08')).toBe(true)
    setYearOverride(2026, [{ date: '2026-10-08', isOffDay: true }])
    expect(isWorkday('2026-10-08')).toBe(false)
    clearYearOverride(2026)
    expect(isWorkday('2026-10-08')).toBe(true)
  })

  it('非法数据被忽略', () => {
    expect(setYearOverride(2028, [])).toBe(false)
    expect(setYearOverride(2028, [{ date: 'bad', isOffDay: true }])).toBe(false)
    expect(hasHolidayData('2028-01-01')).toBe(false)
  })

  it('getHolidayYearsInfo 反映数据来源与条数', () => {
    setYearOverride(2027, [{ date: '2027-01-01', isOffDay: true }], { fetchedAt: '2026-12-05' })
    const info = getHolidayYearsInfo().find(i => i.year === 2027)
    expect(info.source).toBe('remote')
    expect(info.count).toBe(1)
    expect(info.fetchedAt).toBe('2026-12-05')
  })
})

describe('年份隔离：写入 2027 不影响 2026', () => {
  afterEach(() => {
    clearYearOverride(2027)
    clearYearOverride(2026)
  })

  it('2026 的判断与窗口推算保持完全一致', () => {
    const before = {
      nationalDay: isWorkday('2026-10-01'),
      oct8: isWorkday('2026-10-08'),
      makeup: isWorkday('2026-10-10'),
      nextWindow: shiftWorkdays('2026-10-16', 10)
    }

    setYearOverride(2027, [
      { date: '2027-10-01', isOffDay: true },
      { date: '2027-10-09', isOffDay: false }
    ])

    expect(isWorkday('2026-10-01')).toBe(before.nationalDay)
    expect(isWorkday('2026-10-08')).toBe(before.oct8)
    expect(isWorkday('2026-10-10')).toBe(before.makeup)
    expect(shiftWorkdays('2026-10-16', 10)).toBe(before.nextWindow)

    // 2027 用的是新数据
    expect(isWorkday('2027-10-01')).toBe(false)
    expect(isWorkday('2027-10-09')).toBe(true)
  })

  it('外部数据里混入其它年份的日期会被丢弃', () => {
    setYearOverride(2027, [
      { date: '2026-10-08', isOffDay: true }, // 混入的 2026 日期
      { date: '2027-01-01', isOffDay: true }
    ])
    expect(isWorkday('2026-10-08')).toBe(true) // 2026 不受影响
    expect(getHolidayYearsInfo().find(i => i.year === 2027).count).toBe(1)
  })

  it('跨年窗口推算会正确用上 2027 的元旦假期', () => {
    expect(shiftWorkdays('2026-12-25', 10)).toBe('2027-01-08') // 无 2027 数据：跳过周末

    setYearOverride(2027, [
      { date: '2027-01-01', isOffDay: true },
      { date: '2027-01-02', isOffDay: true },
      { date: '2027-01-03', isOffDay: true }
    ])
    expect(shiftWorkdays('2026-12-25', 10)).toBe('2027-01-11')
  })

  it('清除 2027 后 2026 仍然正常，2027 退回周末规则', () => {
    setYearOverride(2027, [{ date: '2027-10-01', isOffDay: true }])
    clearYearOverride(2027)
    expect(isWorkday('2026-10-01')).toBe(false) // 2026 内置国庆
    expect(isWorkday('2027-10-01')).toBe(true) // 2027 已无数据，按周五算
  })
})
