import { describe, it, expect } from 'vitest'
import { applyTemplate, credsReady, BUILTIN_SOURCES, buildCustomSource, allSources } from './oilSources'

describe('applyTemplate', () => {
  it('替换 {province} 与 {provinceEnc}', () => {
    expect(applyTemplate('https://x.com/p?name={province}', '北京')).toBe('https://x.com/p?name=北京')
    expect(applyTemplate('https://x.com/p?name={provinceEnc}', '北京')).toBe('https://x.com/p?name=%E5%8C%97%E4%BA%AC')
  })

  it('空模板返回空字符串', () => {
    expect(applyTemplate('', '北京')).toBe('')
    expect(applyTemplate(null, '北京')).toBe('')
  })
})

describe('credsReady', () => {
  const tianapi = BUILTIN_SOURCES.find(s => s.id === 'tianapi')
  const apizero = BUILTIN_SOURCES.find(s => s.id === 'apizero')

  it('必填凭据缺失时返回 false', () => {
    expect(credsReady(tianapi, {})).toBe(false)
    expect(credsReady(tianapi, { apiKey: '  ' })).toBe(false)
    expect(credsReady(tianapi, { apiKey: 'abc' })).toBe(true)
  })

  it('免 Key 或选填凭据视为就绪', () => {
    expect(credsReady(apizero, {})).toBe(true)
    expect(credsReady({ credsFields: [] }, {})).toBe(true)
  })
})

describe('内置来源解析', () => {
  const get = id => BUILTIN_SOURCES.find(s => s.id === id)

  it('天行数据：result.n92/n95/n98/n0', () => {
    const data = get('tianapi').parse({
      code: 200,
      msg: 'success',
      result: { province: '北京', n92: 8.61, n95: 9.17, n98: 10.67, n0: 8.36 }
    }, '北京')
    expect(data.prices.gasoline_92).toBe(8.61)
    expect(data.prices.gasoline_95).toBe(9.17)
    expect(data.prices.gasoline_98).toBe(10.67)
    expect(data.prices.diesel_0).toBe(8.36)
    expect(data.nextAdjustment).toBeNull()
  })

  it('接口盒子：data.data1 价区', () => {
    const data = get('apihz').parse({
      code: 200,
      data: { data1: { jq: '一价区', '92': 7.28, '95': 7.78, ap98: 8.88, '0h': 6.88 } }
    }, '四川')
    expect(data.prices).toEqual({
      gasoline_92: 7.28,
      gasoline_95: 7.78,
      gasoline_98: 8.88,
      diesel_0: 6.88
    })
  })

  it('结构变化时回退到通用嗅探', () => {
    const data = get('tianapi').parse({
      code: 200,
      result: { list: [{ name: '92号汽油', price: '8.60' }, { name: '0号柴油', price: '8.30' }] }
    }, '北京')
    expect(data.prices.gasoline_92).toBe(8.6)
    expect(data.prices.diesel_0).toBe(8.3)
  })

  it('无法解析时返回空 prices（由上层触发降级）', () => {
    const data = get('tianapi').parse({ code: 200, msg: 'ok', result: {} }, '北京')
    expect(Object.keys(data.prices).length).toBe(0)
  })
})

describe('新增内置来源解析', () => {
  const get = id => BUILTIN_SOURCES.find(s => s.id === id)

  it('小小 API：全国列表按省匹配', () => {
    const data = get('xxapi').parse({
      code: 200,
      data: [
        { regionName: '青海省', date: '2026-10-16', n92: 8.57, n95: 9.19, n98: 10.01, n0: 8.22 },
        { regionName: '北京市', date: '2026-10-16', n92: 8.61, n95: 9.17, n98: 10.67, n0: 8.36 }
      ]
    }, '北京')
    expect(data.prices).toEqual({
      gasoline_92: 8.61, gasoline_95: 9.17, gasoline_98: 10.67, diesel_0: 8.36
    })
    expect(data.updateDate).toBe('2026-10-16')
  })

  it('澄曜 API Hub：data.list[].region 匹配', () => {
    const data = get('ruseo').parse({
      code: 0,
      data: {
        list: [{
          region: '北京市', date: '2026-10-16',
          gasoline_92: 8.61, gasoline_95: 9.17, gasoline_98: 10.67, diesel_0: 8.36
        }]
      }
    }, '北京')
    expect(data.prices.gasoline_92).toBe(8.61)
    expect(data.prices.diesel_0).toBe(8.36)
    expect(data.updateDate).toBe('2026-10-16')
  })

  it('万维易源：p92/p95/p98/p0', () => {
    const data = get('showapi').parse({
      showapi_res_code: 0,
      showapi_res_body: {
        ret_code: 0,
        list: [{ prov: '北京', p92: '8.61', p95: '9.17', p98: '10.67', p0: '8.36', ct: '2026-10-16 10:00:00' }]
      }
    }, '北京')
    expect(data.prices).toEqual({
      gasoline_92: 8.61, gasoline_95: 9.17, gasoline_98: 10.67, diesel_0: 8.36
    })
    expect(data.updateDate).toBe('2026-10-16')
  })

  it('万维易源：业务错误码由 errorOf 暴露（走 authFailed）', () => {
    const err = get('showapi').errorOf({ showapi_res_code: -1004, showapi_res_error: 'appKey err' })
    expect(err.code).toBe(-1004)
    expect(err.message).toContain('appKey')
    expect(get('showapi').errorOf({ showapi_res_code: 0 })).toBeNull()
  })

  it('省份不匹配时返回空价格（触发降级）', () => {
    const data = get('xxapi').parse({ data: [{ regionName: '青海省', n92: 8.57 }] }, '北京')
    expect(Object.keys(data.prices).length).toBe(0)
  })
})

describe('自定义来源', () => {
  const def = {
    id: 'custom_1',
    name: '我的接口',
    kind: 'api',
    urlTemplate: 'https://example.com/oil?prov={provinceEnc}',
    headerName: 'X-Api-Key',
    headerValue: 'k1'
  }
  const src = buildCustomSource(def)

  it('地址模板与请求头', () => {
    expect(src.buildUrl('广东')).toBe('https://example.com/oil?prov=%E5%B9%BF%E4%B8%9C')
    expect(src.headers()).toEqual({ 'X-Api-Key': 'k1' })
  })

  it('自定义 JSON 走通用嗅探', () => {
    const data = src.parse({ data: { p92: 8.1, p95: 8.6 } }, '广东')
    expect(data.prices.gasoline_92).toBe(8.1)
    expect(data.prices.gasoline_95).toBe(8.6)
  })

  it('网页类型标记为 page', () => {
    const page = buildCustomSource({ id: 'c2', name: '油价网', kind: 'page', urlTemplate: 'https://x.com/{province}' })
    expect(page.kind).toBe('page')
    expect(page.pageUrl('北京')).toBe('https://x.com/北京')
  })

  it('allSources 合并内置与自定义', () => {
    const list = allSources([def])
    expect(list.length).toBe(BUILTIN_SOURCES.length + 1)
    expect(list[list.length - 1].custom).toBe(true)
  })
})
