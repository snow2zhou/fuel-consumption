/**
 * 本地存储封装
 * 基于 localStorage，提供数据持久化能力
 * 在 Capacitor 环境下可平滑切换到 Preferences 插件
 */

const KEYS = {
  REFUEL: 'fc_refuel_records',
  TRIP: 'fc_trip_records',
  INVOICE: 'fc_invoice_records',
  OIL_HISTORY: 'fc_oil_history',
  OIL_SOURCES: 'fc_oil_sources',
  SETTINGS: 'fc_settings'
}

function read(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaultValue
    return JSON.parse(raw)
  } catch (e) {
    console.error('读取存储失败:', key, e)
    return defaultValue
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.error('写入存储失败:', key, e)
    return false
  }
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * 从记录的 time 字段提取 UTC 年月，用于按月份归类。
 * 采用 UTC 而非本地时区，确保同一条记录在任意设备 / 时区下
 * 都被归入同一个月份，消除跨时区判定误差。
 * @param {string|number|Date} time 记录时间
 * @returns {{year:number, month:number}} month 取值 1-12
 */
function getUTCMonth(time) {
  const d = new Date(time)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/**
 * 通用记录仓库
 */
function createRepository(key) {
  return {
    getAll() {
      const list = read(key, [])
      // 按时间倒序（最新的在前）
      return list.sort((a, b) => new Date(b.time) - new Date(a.time))
    },
    getById(id) {
      return read(key, []).find(r => r.id === id)
    },
    add(record) {
      const list = read(key, [])
      const item = { id: genId(), ...record }
      list.push(item)
      write(key, list)
      return item
    },
    update(id, patch) {
      const list = read(key, [])
      const idx = list.findIndex(r => r.id === id)
      if (idx === -1) return null
      list[idx] = { ...list[idx], ...patch, id }
      write(key, list)
      return list[idx]
    },
    remove(id) {
      const list = read(key, [])
      const next = list.filter(r => r.id !== id)
      write(key, next)
      return true
    },
    clear() {
      write(key, [])
    },
    /**
     * 删除指定年月的记录（按记录的 time 字段所在 UTC 月份判断）
     * 使用 UTC 判定，跨时区下同一记录始终归入同一月份。
     * @param {Number} year 年（如 2026）
     * @param {Number} month 月（1-12）
     * @returns {Number} 删除的记录数
     */
    removeByMonth(year, month) {
      const list = read(key, [])
      const before = list.length
      const next = list.filter(r => {
        const { year: y, month: m } = getUTCMonth(r.time)
        return !(y === year && m === month)
      })
      write(key, next)
      return before - next.length
    },
    /**
     * 统计指定年月的记录数（按 UTC 月份判定）
     */
    countByMonth(year, month) {
      const list = read(key, [])
      return list.filter(r => {
        const { year: y, month: m } = getUTCMonth(r.time)
        return y === year && m === month
      }).length
    },
    /**
     * 获取所有记录中存在的年月列表（用于月份选择器，按 UTC 月份归类）
     * 返回 [{ year, month, count }, ...] 倒序
     */
    getMonths() {
      const list = read(key, [])
      const map = new Map()
      for (const r of list) {
        const { year, month } = getUTCMonth(r.time)
        const mk = `${year}-${month}`
        if (!map.has(mk)) {
          map.set(mk, { year, month, count: 0 })
        }
        map.get(mk).count++
      }
      return Array.from(map.values()).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year
        return b.month - a.month
      })
    }
  }
}

export const refuelRepo = createRepository(KEYS.REFUEL)
export const tripRepo = createRepository(KEYS.TRIP)
export const invoiceRepo = createRepository(KEYS.INVOICE)
export const oilHistoryRepo = createRepository(KEYS.OIL_HISTORY)

/**
 * 设置项
 */
export const settingsRepo = {
  get() {
    const stored = read(KEYS.SETTINGS, null)
    return {
      preferredFuelType: '92#',
      unit: 'L/100km',
      tankCapacity: 50, // 油箱容量（L），默认50
      defaultPage: 'trip', // 默认首页，默认行程（使用最频繁）
      oilProvince: '', // 油价查询常用地区（省份简称），空表示未设置
      oilApiKey: '', // 旧版字段：极数本源的 Key（兼容保留）
      oilSourceId: 'apizero', // 当前使用的油价数据源 id
      oilSourceCreds: {}, // 各数据源凭据 { [sourceId]: { apiKey, id, key } }
      manualPrices: {}, // 手动录入的油价 { '北京|92#': { price, date } }
      autoFillPrice: true, // 新增加油记录时是否自动带出当日参考油价
      oilRemind: true, // 调价日当天/前一天是否在应用内提醒
      ...(stored || {})
    }
  },
  save(patch) {
    const cur = this.get()
    const next = { ...cur, ...patch }
    write(KEYS.SETTINGS, next)
    return next
  }
}

/**
 * 读取全部原始数据（用于导出）
 */
export function exportAllData() {
  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    refuelRecords: read(KEYS.REFUEL, []),
    tripRecords: read(KEYS.TRIP, []),
    invoiceRecords: read(KEYS.INVOICE, []),
    oilPriceHistory: read(KEYS.OIL_HISTORY, []),
    settings: read(KEYS.SETTINGS, {})
  }
}

/**
 * 兼容迁移：把早期版本存在**发票实体**上的 `exported`（是否已导出）
 * 下沉到其关联的**加油记录**上。
 *
 * 语义变更原因：导出/报销进度针对的是"某一次加油的那张票"，
 * 而非开票主体（抬头）本身。旧数据迁移后不丢状态：
 * - 发票 exported === true → 其所有关联加油记录（未显式设置过的）标记为已导出；
 * - 随后清理发票上的遗留 exported 字段。
 *
 * 该函数幂等：可重复调用，无遗留字段时不做任何写入。
 * @returns {Number} 实际迁移的加油记录条数
 */
function migrateInvoiceExportedToRefuels() {
  const invoices = read(KEYS.INVOICE, [])
  const exportedIds = new Set(invoices.filter(i => i.exported).map(i => i.id))

  // 1) 发票状态 → 关联加油记录
  let moved = 0
  if (exportedIds.size) {
    const refuels = read(KEYS.REFUEL, [])
    let changed = false
    const next = refuels.map(r => {
      if (r.invoiceId && exportedIds.has(r.invoiceId) && r.exported === undefined) {
        changed = true
        moved++
        return { ...r, exported: true }
      }
      return r
    })
    if (changed) write(KEYS.REFUEL, next)
  }

  // 2) 清理发票上的遗留字段
  if (invoices.some(i => 'exported' in i)) {
    write(KEYS.INVOICE, invoices.map(({ exported, ...rest }) => rest))
  }

  return moved
}

/**
 * 启动时执行一次性数据迁移（带标记位，仅执行一次）
 */
export function runMigrations() {
  const FLAG = 'fc_migrated_invoice_exported_v1'
  try {
    if (localStorage.getItem(FLAG)) return { migrated: 0 }
    const migrated = migrateInvoiceExportedToRefuels()
    localStorage.setItem(FLAG, '1')
    return { migrated }
  } catch (e) {
    console.error('数据迁移失败:', e)
    return { migrated: 0 }
  }
}

/**
 * 将导入的数据批量写入（覆盖现有数据）
 * @param {Object} data 导入的数据对象
 * @param {Object} options { merge: 是否合并(默认false=覆盖) }
 */
export function importAllData(data, options = {}) {
  const { merge = false } = options
  if (!data || typeof data !== 'object') {
    return { success: false, error: '数据格式不正确' }
  }
  const { refuelRecords, tripRecords, invoiceRecords, oilPriceHistory, settings } = data

  // 校验数据格式
  if (refuelRecords && !Array.isArray(refuelRecords)) {
    return { success: false, error: '加油记录数据格式不正确' }
  }
  if (tripRecords && !Array.isArray(tripRecords)) {
    return { success: false, error: '行程快照数据格式不正确' }
  }
  if (invoiceRecords && !Array.isArray(invoiceRecords)) {
    return { success: false, error: '发票数据格式不正确' }
  }
  if (oilPriceHistory && !Array.isArray(oilPriceHistory)) {
    return { success: false, error: '油价历史数据格式不正确' }
  }

  let refuelCount = 0
  let tripCount = 0
  let invoiceCount = 0
  let oilHistoryCount = 0
  let settingsMerged = false

  // 加油记录
  if (refuelRecords) {
    if (merge) {
      const existing = read(KEYS.REFUEL, [])
      const existingIds = new Set(existing.map(r => r.id))
      const toAdd = refuelRecords.filter(r => !existingIds.has(r.id))
      write(KEYS.REFUEL, [...existing, ...toAdd])
      refuelCount = toAdd.length
    } else {
      write(KEYS.REFUEL, refuelRecords)
      refuelCount = refuelRecords.length
    }
  }

  // 行程快照
  if (tripRecords) {
    if (merge) {
      const existing = read(KEYS.TRIP, [])
      const existingIds = new Set(existing.map(r => r.id))
      const toAdd = tripRecords.filter(r => !existingIds.has(r.id))
      write(KEYS.TRIP, [...existing, ...toAdd])
      tripCount = toAdd.length
    } else {
      write(KEYS.TRIP, tripRecords)
      tripCount = tripRecords.length
    }
  }

  // 发票（与加油/行程同构的导入逻辑）
  if (invoiceRecords) {
    if (merge) {
      const existing = read(KEYS.INVOICE, [])
      const existingIds = new Set(existing.map(r => r.id))
      const toAdd = invoiceRecords.filter(r => !existingIds.has(r.id))
      write(KEYS.INVOICE, [...existing, ...toAdd])
      invoiceCount = toAdd.length
    } else {
      write(KEYS.INVOICE, invoiceRecords)
      invoiceCount = invoiceRecords.length
    }
  }

  // 油价历史（本地攒的价格变更点）
  if (oilPriceHistory) {
    if (merge) {
      const existing = read(KEYS.OIL_HISTORY, [])
      const existingIds = new Set(existing.map(r => r.id))
      const toAdd = oilPriceHistory.filter(r => !existingIds.has(r.id))
      write(KEYS.OIL_HISTORY, [...existing, ...toAdd])
      oilHistoryCount = toAdd.length
    } else {
      write(KEYS.OIL_HISTORY, oilPriceHistory)
      oilHistoryCount = oilPriceHistory.length
    }
  }

  // 设置（仅在提供时合并）
  if (settings && typeof settings === 'object') {
    const cur = read(KEYS.SETTINGS, {})
    write(KEYS.SETTINGS, { ...cur, ...settings })
    settingsMerged = true
  }

  // 兼容旧备份（version ≤ 2）：发票上的 exported 下沉到关联加油记录
  migrateInvoiceExportedToRefuels()

  return {
    success: true,
    refuelCount,
    tripCount,
    invoiceCount,
    oilHistoryCount,
    settingsMerged
  }
}

export const STORAGE_KEYS = KEYS

/**
 * 自定义油价数据源（用户添加，存 localStorage 数组）
 * 结构：{ id, name, kind:'api'|'page', urlTemplate, headerName?, headerValue?, createdAt }
 */
export function readOilSources() {
  const list = read(KEYS.OIL_SOURCES, [])
  return Array.isArray(list) ? list : []
}

export function writeOilSources(list) {
  return write(KEYS.OIL_SOURCES, Array.isArray(list) ? list : [])
}
