/**
 * 本地存储封装
 * 基于 localStorage，提供数据持久化能力
 * 在 Capacitor 环境下可平滑切换到 Preferences 插件
 */

const KEYS = {
  REFUEL: 'fc_refuel_records',
  TRIP: 'fc_trip_records',
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
     * 删除指定年月的记录（按记录的 time 字段所在月份判断）
     * @param {Number} year 年（如 2026）
     * @param {Number} month 月（1-12）
     * @returns {Number} 删除的记录数
     */
    removeByMonth(year, month) {
      const list = read(key, [])
      const before = list.length
      const next = list.filter(r => {
        const d = new Date(r.time)
        return !(d.getFullYear() === year && (d.getMonth() + 1) === month)
      })
      write(key, next)
      return before - next.length
    },
    /**
     * 统计指定年月的记录数
     */
    countByMonth(year, month) {
      const list = read(key, [])
      return list.filter(r => {
        const d = new Date(r.time)
        return d.getFullYear() === year && (d.getMonth() + 1) === month
      }).length
    },
    /**
     * 获取所有记录中存在的年月列表（用于月份选择器）
     * 返回 [{ year, month, count }, ...] 倒序
     */
    getMonths() {
      const list = read(key, [])
      const map = new Map()
      for (const r of list) {
        const d = new Date(r.time)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        if (!map.has(key)) {
          map.set(key, { year: d.getFullYear(), month: d.getMonth() + 1, count: 0 })
        }
        map.get(key).count++
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

/**
 * 设置项
 */
export const settingsRepo = {
  get() {
    return read(KEYS.SETTINGS, {
      preferredFuelType: '92#',
      unit: 'L/100km',
      tankCapacity: 50 // 油箱容量（L），默认50
    })
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
    version: 1,
    exportedAt: new Date().toISOString(),
    refuelRecords: read(KEYS.REFUEL, []),
    tripRecords: read(KEYS.TRIP, []),
    settings: read(KEYS.SETTINGS, {})
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
  const { refuelRecords, tripRecords, settings } = data

  // 校验数据格式
  if (refuelRecords && !Array.isArray(refuelRecords)) {
    return { success: false, error: '加油记录数据格式不正确' }
  }
  if (tripRecords && !Array.isArray(tripRecords)) {
    return { success: false, error: '行程快照数据格式不正确' }
  }

  let refuelCount = 0
  let tripCount = 0
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

  // 设置（仅在提供时合并）
  if (settings && typeof settings === 'object') {
    const cur = read(KEYS.SETTINGS, {})
    write(KEYS.SETTINGS, { ...cur, ...settings })
    settingsMerged = true
  }

  return {
    success: true,
    refuelCount,
    tripCount,
    settingsMerged
  }
}

export const STORAGE_KEYS = KEYS
