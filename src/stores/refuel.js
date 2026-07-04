/**
 * 加油记录状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { refuelRepo } from '../api/storage'
import { createRefuelRecord, validateRefuel } from '../api/models'
import { calcRefuelListWithComparison, calcStatistics } from '../utils/calc'

export const useRefuelStore = defineStore('refuel', () => {
  const records = ref(refuelRepo.getAll())

  // 带对比计算的列表（自动计算）
  const listWithComparison = computed(() => calcRefuelListWithComparison(records.value))

  // 统计数据
  const statistics = computed(() => calcStatistics(listWithComparison.value))

  function reload() {
    records.value = refuelRepo.getAll()
  }

  function add(data) {
    const record = { ...createRefuelRecord(), ...data }
    const err = validateRefuel(record)
    if (err) return { success: false, error: err }
    refuelRepo.add(record)
    reload()
    return { success: true, data: record }
  }

  function update(id, patch) {
    const cur = refuelRepo.getById(id)
    if (!cur) return { success: false, error: '记录不存在' }
    const record = { ...cur, ...patch, id }
    const err = validateRefuel(record)
    if (err) return { success: false, error: err }
    refuelRepo.update(id, patch)
    reload()
    return { success: true, data: record }
  }

  function remove(id) {
    refuelRepo.remove(id)
    reload()
    return { success: true }
  }

  function removeByMonth(year, month) {
    const n = refuelRepo.removeByMonth(year, month)
    reload()
    return { success: true, count: n }
  }

  function getMonths() {
    return refuelRepo.getMonths()
  }

  function getById(id) {
    return refuelRepo.getById(id)
  }

  return {
    records,
    listWithComparison,
    statistics,
    reload,
    add,
    update,
    remove,
    removeByMonth,
    getMonths,
    getById
  }
})
