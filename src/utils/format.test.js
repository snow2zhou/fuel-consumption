import { describe, it, expect } from 'vitest'
import { formatDate, formatNum, formatMoney, formatInvoiceLine } from './format'

describe('formatDate', () => {
  it('按模板格式化', () => {
    // 用 UTC 正午，避免设备时区导致跨日
    expect(formatDate('2026-09-05T12:00:00Z', 'YYYY-MM-DD')).toBe('2026-09-05')
  })
  it('空值返回空串', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate('not-a-date')).toBe('')
  })
})

describe('formatNum / formatMoney', () => {
  it('按位数保留小数', () => {
    expect(formatNum(1.005, 2)).toBe('1.00')
    expect(formatNum(3.14159, 3)).toBe('3.142')
  })
  it('非法值返回占位符', () => {
    expect(formatNum(null)).toBe('-')
    expect(formatNum('')).toBe('-')
    expect(formatNum('abc')).toBe('-')
    expect(formatMoney(undefined)).toBe('-')
  })
  it('金额固定两位', () => {
    expect(formatMoney(12.5)).toBe('12.50')
  })
})

describe('formatInvoiceLine（日期：发票链接）', () => {
  it('开票日期与链接齐全', () => {
    expect(formatInvoiceLine({
      invoiceDate: '2026-09-01',
      invoiceLink: 'https://example.com/inv/1'
    })).toBe('2026-09-01：https://example.com/inv/1')
  })

  it('缺开票日期时回退到加油日期', () => {
    expect(formatInvoiceLine({
      time: '2026-09-05T12:00:00Z',
      invoiceLink: 'https://example.com/inv/2'
    })).toBe('2026-09-05：https://example.com/inv/2')
  })

  it('缺链接时以占位符保证结构一致', () => {
    expect(formatInvoiceLine({ invoiceDate: '2026-09-01', invoiceLink: '' }))
      .toBe('2026-09-01：(无链接)')
  })

  it('链接首尾空白会被裁剪', () => {
    expect(formatInvoiceLine({ invoiceDate: '2026-09-01', invoiceLink: '  https://a.b  ' }))
      .toBe('2026-09-01：https://a.b')
  })

  it('日期与链接都缺失时给出占位', () => {
    expect(formatInvoiceLine({})).toBe('未注明日期：(无链接)')
  })

  it('null / undefined 安全', () => {
    expect(formatInvoiceLine(null)).toBe('')
    expect(formatInvoiceLine(undefined)).toBe('')
  })
})
