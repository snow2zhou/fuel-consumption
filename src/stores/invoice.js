/**
 * 发票状态管理
 *
 * 职责边界：
 * - 发票实体 = 开票主体（抬头 / 开户行 / 银行账号 / 税号），只做增删改查；
 * - "发票链接 / 开票日期 / 是否已导出"属于**加油记录**（每次加油的那张电子票），
 *   本 store 提供对这些加油记录字段的批量操作（含跨 store 刷新）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoiceRepo, refuelRepo } from '../api/storage'
import { createInvoiceRecord, validateInvoice } from '../api/models'
import { useRefuelStore } from './refuel'

export const useInvoiceStore = defineStore('invoice', () => {
  // 发票没有 time 字段，通用仓库的"按 time 倒序"对其无效，这里按创建时间倒序
  function sortRecords(list) {
    return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  }

  const records = ref(sortRecords(invoiceRepo.getAll()))

  function reload() {
    records.value = sortRecords(invoiceRepo.getAll())
  }

  function add(data) {
    const record = { ...createInvoiceRecord(), ...data }
    const err = validateInvoice(record)
    if (err) return { success: false, error: err }
    const saved = invoiceRepo.add(record)
    reload()
    return { success: true, data: saved }
  }

  function update(id, patch) {
    const cur = invoiceRepo.getById(id)
    if (!cur) return { success: false, error: '发票不存在' }
    const record = { ...cur, ...patch, id }
    const err = validateInvoice(record)
    if (err) return { success: false, error: err }
    invoiceRepo.update(id, patch)
    reload()
    return { success: true, data: record }
  }

  function remove(id) {
    // 孤儿处理：把关联该发票的加油记录的 invoiceId 置空，避免悬空引用
    const refuels = refuelRepo.getAll()
    let cleared = 0
    for (const r of refuels) {
      if (r.invoiceId === id) {
        refuelRepo.update(r.id, { invoiceId: null })
        cleared++
      }
    }
    invoiceRepo.remove(id)
    reload()
    return { success: true, cleared }
  }

  function getById(id) {
    return invoiceRepo.getById(id)
  }

  /**
   * 某发票关联的加油记录（按时间倒序，复用 refuelRepo 的排序）
   *
   * 历史数据兼容：更早版本的"发票链接 / 开票日期"存在发票实体自身（link / invoiceDate），
   * 现已下移到加油记录。此处做**只读兜底**——当加油记录未填链接/日期时，
   * 回退沿用其关联发票遗留的字段，避免旧数据在界面与复制结果中"凭空消失"；
   * 不写库、不改模型，新数据（加油记录自带字段）优先。
   */
  function getRefuels(invoiceId) {
    const inv = invoiceRepo.getById(invoiceId)
    const legacyLink = inv && inv.link ? String(inv.link).trim() : ''
    const legacyDate = (inv && inv.invoiceDate) || ''
    // 读取 refuel store 的响应式 records（而非直接读 localStorage），
    // 这样切换导出状态后调用方 computed 能自动重算
    return useRefuelStore().records
      .filter(r => r.invoiceId === invoiceId)
      .map(r => {
        const link = (r.invoiceLink || '').trim() || legacyLink
        const date = r.invoiceDate || legacyDate
        if (link === r.invoiceLink && date === r.invoiceDate) return r
        return { ...r, invoiceLink: link, invoiceDate: date }
      })
  }

  /**
   * 某发票下关联加油记录的导出进度统计（用于发票选择器与筛选标签）
   * @returns {{total:number, exported:number, unexported:number}}
   */
  function countRefuelStatus(invoiceId) {
    const list = getRefuels(invoiceId)
    const exported = list.filter(r => r.exported).length
    return { total: list.length, exported, unexported: list.length - exported }
  }

  /**
   * 批量设置关联加油记录的"已导出"状态（复制/导出后标记报销进度）
   * @param {string|string[]} ids 加油记录 id（单个或数组）
   * @param {boolean} exported 目标状态
   * @returns {number} 实际发生变更的条数
   */
  function setRefuelExported(ids, exported = true) {
    const arr = Array.isArray(ids) ? ids : [ids]
    let changed = 0
    for (const id of arr) {
      const cur = refuelRepo.getById(id)
      if (cur && !!cur.exported !== !!exported) {
        refuelRepo.update(id, { exported })
        changed++
      }
    }
    // 同步刷新加油记录 store，保证加油列表等页面即时反映
    if (changed) useRefuelStore().reload()
    return changed
  }

  /** 切换单条加油记录的导出状态，返回切换后的状态 */
  function toggleRefuelExported(id) {
    const cur = refuelRepo.getById(id)
    if (!cur) return false
    const next = !cur.exported
    refuelRepo.update(id, { exported: next })
    useRefuelStore().reload()
    return next
  }

  return {
    records,
    reload,
    add,
    update,
    remove,
    getById,
    getRefuels,
    countRefuelStatus,
    setRefuelExported,
    toggleRefuelExported
  }
})
