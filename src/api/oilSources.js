/**
 * 油价数据源适配层
 *
 * 设计目标：
 * - 内置多个免费源，任一源限流/停服时可手动切换；
 * - 用户在设置里可添加自定义来源（JSON 接口或网页）；
 * - 无法解析（或本身是网页）时返回 fallbackUrl，由界面降级展示网页内容。
 *
 * 注意：浏览器只能直连允许跨域的接口。内置源均已确认返回
 * `Access-Control-Allow-Origin`（mxnzp 未返回该头，故未内置）。
 */
import { normalizeOilPrice, sniffPrices, normalizeProvinceName } from '../utils/oilPrice'
import { todayLocalDate } from './models'

export const KIND = { API: 'api', PAGE: 'page', MANUAL: 'manual' }

function isQuotaMessage(msg) {
  return /次数|额度|上限|用完|频繁|限流|limit|quota/i.test(String(msg || ''))
}

function isAuthMessage(msg) {
  return /密钥|api\s*key|appkey|app_?id|app_?secret|账号|授权|鉴权/i.test(String(msg || ''))
}

function makeData(province, prices, extra = {}) {
  const clean = {}
  for (const [k, v] of Object.entries(prices || {})) {
    const n = Number(v)
    if (Number.isFinite(n) && n >= 3 && n <= 30) clean[k] = n
  }
  return {
    province,
    updateDate: todayLocalDate(),
    prices: clean,
    nextAdjustment: null,
    forecast: {},
    fetchedAt: Date.now(),
    ...extra
  }
}

/** 把 `{province}` / `{provinceEnc}` 占位符替换成实际省份 */
export function applyTemplate(template, province) {
  const raw = String(template || '')
  const enc = encodeURIComponent(province || '')
  return raw
    .replace(/\{provinceEnc\}/g, enc)
    .replace(/\{province\}/g, province || '')
}

/** 内置数据源（不可删除） */
export const BUILTIN_SOURCES = [
  {
    id: 'apizero',
    name: '极数本源',
    kind: KIND.API,
    custom: false,
    desc: '免注册；匿名每日 5 次，返回调价测算',
    docUrl: 'https://apizero.cn',
    credsFields: [{ key: 'apiKey', label: 'API Key（选填）', placeholder: '填写后额度更高' }],
    buildUrl: province => `https://v1.apizero.cn/api/oil-price?province=${encodeURIComponent(province)}`,
    headers: creds => (creds.apiKey ? { 'X-API-Key': creds.apiKey } : {}),
    pageUrl: () => 'https://apizero.cn',
    parse: (json, province) => normalizeOilPrice(json, province)
  },
  {
    id: 'xxapi',
    name: '小小 API',
    kind: KIND.API,
    custom: false,
    national: true,
    desc: '免注册；一次返回全国 31 省',
    docUrl: 'https://v2.xxapi.cn/api/oilPrice',
    credsFields: [],
    buildUrl: () => 'https://v2.xxapi.cn/api/oilPrice',
    pageUrl: () => 'https://v2.xxapi.cn/api/oilPrice',
    parse: (json, province) => {
      const list = (json && json.data) || []
      const target = normalizeProvinceName(province)
      const item = Array.isArray(list)
        ? list.find(x => normalizeProvinceName(x.regionName) === target)
        : null
      if (!item) return makeData(province, {})
      return makeData(province, {
        gasoline_92: item.n92,
        gasoline_95: item.n95,
        gasoline_98: item.n98,
        diesel_0: item.n0
      }, { updateDate: item.date || todayLocalDate(), priceDate: item.date || '' })
    }
  },
  {
    id: 'ruseo',
    name: '澄曜 API Hub',
    kind: KIND.API,
    custom: false,
    national: true,
    desc: '免注册；一次返回全国 31 省',
    docUrl: 'https://api.ruseo.cn/api/oilprice',
    credsFields: [],
    buildUrl: () => 'https://api.ruseo.cn/api/oilprice',
    pageUrl: () => 'https://api.ruseo.cn/api/oilprice',
    parse: (json, province) => {
      const list = (json && json.data && json.data.list) || []
      const target = normalizeProvinceName(province)
      const item = Array.isArray(list)
        ? list.find(x => normalizeProvinceName(x.region) === target)
        : null
      if (!item) return makeData(province, {})
      return makeData(province, {
        gasoline_92: item.gasoline_92,
        gasoline_95: item.gasoline_95,
        gasoline_98: item.gasoline_98,
        diesel_0: item.diesel_0
      }, { updateDate: item.date || todayLocalDate(), priceDate: item.date || '' })
    }
  },
  {
    id: 'showapi',
    name: '万维易源',
    kind: KIND.API,
    custom: false,
    desc: '需免费注册 AppKey；每日 7 点更新',
    docUrl: 'https://www.showapi.com/api/view/138',
    credsFields: [{ key: 'appKey', label: 'AppKey', required: true }],
    buildUrl: (province, creds) =>
      `https://route.showapi.com/138-46?appKey=${encodeURIComponent(creds.appKey || '')}` +
      `&prov=${encodeURIComponent(province)}`,
    pageUrl: () => 'https://www.showapi.com/api/view/138',
    errorOf: json => (
      json && json.showapi_res_code !== undefined && json.showapi_res_code !== 0
        ? { code: json.showapi_res_code, message: json.showapi_res_error || 'ShowAPI 返回错误' }
        : null
    ),
    parse: (json, province) => {
      const body = (json && json.showapi_res_body) || {}
      const item = (body.list && body.list[0]) || {}
      return makeData(province, {
        gasoline_92: item.p92,
        gasoline_95: item.p95,
        gasoline_98: item.p98,
        diesel_0: item.p0
      }, { updateDate: item.ct ? String(item.ct).slice(0, 10) : todayLocalDate() })
    }
  },
  {
    id: 'tianapi',
    name: '天行数据',
    kind: KIND.API,
    custom: false,
    desc: '需免费注册 Key；只提供价格，无调价测算',
    docUrl: 'https://www.tianapi.com/apiview/104',
    credsFields: [{ key: 'apiKey', label: 'API Key', required: true }],
    buildUrl: (province, creds) =>
      `https://apis.tianapi.com/oilprice/index?key=${encodeURIComponent(creds.apiKey || '')}&prov=${encodeURIComponent(province)}`,
    pageUrl: () => 'https://www.tianapi.com/apiview/104',
    parse: (json, province) => {
      const r = (json && json.result) || {}
      const data = makeData(province, {
        gasoline_92: r.n92,
        gasoline_95: r.n95,
        gasoline_98: r.n98,
        diesel_0: r.n0
      })
      if (!Object.keys(data.prices).length) data.prices = sniffPrices(json)
      return data
    }
  },
  {
    id: 'apihz',
    name: '接口盒子',
    kind: KIND.API,
    custom: false,
    desc: '需注册用户 ID 与 Key；按省返回多个价区，取第一价区',
    docUrl: 'https://cn.apihz.cn/',
    credsFields: [
      { key: 'id', label: '用户 ID', required: true },
      { key: 'key', label: '通讯 Key', required: true }
    ],
    buildUrl: (province, creds) =>
      `https://cn.apihz.cn/api/jinrong/youjia.php?id=${encodeURIComponent(creds.id || '')}` +
      `&key=${encodeURIComponent(creds.key || '')}&sheng=${encodeURIComponent(province)}`,
    pageUrl: () => 'https://cn.apihz.cn/',
    parse: (json, province) => {
      const zones = (json && json.data) || {}
      const first = zones.data1 || Object.values(zones)[0] || {}
      const data = makeData(province, {
        gasoline_92: first['92'],
        gasoline_95: first['95'],
        gasoline_98: first.ap98 ?? first['98'],
        diesel_0: first['0h'] ?? first['0']
      })
      if (!Object.keys(data.prices).length) data.prices = sniffPrices(json)
      return data
    }
  },
  {
    id: 'manual',
    name: '手动录入',
    kind: KIND.MANUAL,
    custom: false,
    desc: '不联网，自己填写当前油价（离线或全部额度用尽时兜底）',
    docUrl: '',
    credsFields: []
  }
]

/** 把用户自定义来源定义转成统一结构 */
export function buildCustomSource(def = {}) {
  const kind = def.kind === KIND.PAGE ? KIND.PAGE : KIND.API
  return {
    id: def.id,
    name: def.name || '自定义来源',
    kind,
    custom: true,
    desc: kind === KIND.PAGE ? '网页来源，无法解析时直接展示网页' : '自定义 JSON 接口',
    docUrl: def.urlTemplate || '',
    urlTemplate: def.urlTemplate || '',
    buildUrl: province => applyTemplate(def.urlTemplate, province),
    headers: () =>
      def.headerName && def.headerValue ? { [def.headerName]: def.headerValue } : {},
    pageUrl: province => applyTemplate(def.urlTemplate, province),
    parse: (json, province) => {
      const norm = normalizeOilPrice(json, province)
      if (Object.keys(norm.prices || {}).length) return norm
      return makeData(province, sniffPrices(json))
    }
  }
}

/** 全部可用来源 = 内置 + 自定义 */
export function allSources(customDefs = []) {
  return [...BUILTIN_SOURCES, ...(customDefs || []).map(buildCustomSource)]
}

export function getSource(id, customDefs = []) {
  const list = allSources(customDefs)
  return list.find(s => s.id === id) || BUILTIN_SOURCES[0]
}

/** 该来源的必填凭据是否齐全 */
export function credsReady(source, creds = {}) {
  if (!source || !source.credsFields || !source.credsFields.length) return true
  return source.credsFields
    .filter(f => f.required)
    .every(f => String(creds[f.key] || '').trim())
}

/** 来源状态文案 */
export function sourceStatusText(source, creds = {}) {
  if (!source) return ''
  if (source.kind === KIND.MANUAL) return '无需联网'
  if (source.kind === KIND.PAGE) return '网页来源'
  if (!credsReady(source, creds)) return '待填写凭据'
  return '已就绪'
}

/**
 * 从指定来源拉取并解析油价
 * @returns {Promise<{
 *   ok:boolean, data?:Object, error?:string, code?:any,
 *   quota?:boolean, authFailed?:boolean, needCreds?:boolean,
 *   parseFailed?:boolean, pageOnly?:boolean, manual?:boolean,
 *   fallbackUrl?:string, raw?:any
 * }>}
 */
export async function fetchFromSource(source, province, creds = {}) {
  if (!source) return { ok: false, error: '未找到数据源' }
  if (source.kind === KIND.MANUAL) return { ok: false, manual: true }
  if (source.kind === KIND.PAGE) {
    return { ok: false, pageOnly: true, fallbackUrl: source.pageUrl ? source.pageUrl(province) : '' }
  }
  if (!credsReady(source, creds)) {
    return { ok: false, needCreds: true, error: '该数据源需要先填写凭据（设置 → 油价数据源）' }
  }

  const url = source.buildUrl(province, creds)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)

  try {
    const res = await fetch(url, {
      headers: source.headers ? source.headers(creds) : {},
      signal: ctrl.signal
    })
    let json = null
    try {
      json = await res.json()
    } catch (e) {
      json = null
    }

    const fallbackUrl = source.pageUrl ? source.pageUrl(province) : url

    if (!res.ok) {
      const msg = (json && (json.msg || json.message)) || `接口返回 HTTP ${res.status}`
      return {
        ok: false,
        code: (json && json.code) || res.status,
        error: msg,
        quota: res.status === 429 || isQuotaMessage(msg),
        authFailed: isAuthMessage(msg),
        fallbackUrl
      }
    }
    if (!json) {
      return { ok: false, parseFailed: true, error: '返回内容不是 JSON', fallbackUrl }
    }

    // 业务错误码：极数本源 0，天行/接口盒子 200
    const code = json.code
    if (code !== undefined && ![0, 200].includes(Number(code))) {
      const msg = json.msg || json.message || `接口返回 code=${code}`
      return {
        ok: false,
        code,
        error: msg,
        quota: isQuotaMessage(msg),
        authFailed: isAuthMessage(msg),
        fallbackUrl
      }
    }

    // 部分来源用自有字段表示业务错误（如 ShowAPI 的 showapi_res_code）
    if (source.errorOf) {
      const err = source.errorOf(json)
      if (err) {
        const msg = err.message || '接口返回错误'
        return {
          ok: false,
          code: err.code,
          error: msg,
          quota: isQuotaMessage(msg),
          authFailed: isAuthMessage(msg),
          fallbackUrl: source.pageUrl ? source.pageUrl(province) : url
        }
      }
    }

    const data = source.parse(json, province)
    if (!data || !Object.keys(data.prices || {}).length) {
      return {
        ok: false,
        parseFailed: true,
        error: (json && json.msg) || '未能从返回内容中解析出油价',
        fallbackUrl,
        raw: json
      }
    }
    return { ok: true, data }
  } catch (e) {
    return {
      ok: false,
      error: e && e.name === 'AbortError' ? '请求超时' : '网络请求失败',
      fallbackUrl: source.pageUrl ? source.pageUrl(province) : url
    }
  } finally {
    clearTimeout(timer)
  }
}
