/**
 * 行程快照记录状态管理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { tripRepo } from '../api/storage'
import { createTripRecord, validateTrip } from '../api/models'

export const useTripStore = defineStore('trip', () => {
  const records = ref(tripRepo.getAll())

  function reload() {
    records.value = tripRepo.getAll()
  }

  function add(data) {
    const record = { ...createTripRecord(), ...data }
    const err = validateTrip(record)
    if (err) return { success: false, error: err }
    tripRepo.add(record)
    reload()
    return { success: true, data: record }
  }

  function update(id, patch) {
    const cur = tripRepo.getById(id)
    if (!cur) return { success: false, error: '记录不存在' }
    const record = { ...cur, ...patch, id }
    const err = validateTrip(record)
    if (err) return { success: false, error: err }
    tripRepo.update(id, patch)
    reload()
    return { success: true, data: record }
  }

  function remove(id) {
    tripRepo.remove(id)
    reload()
    return { success: true }
  }

  function removeByMonth(year, month) {
    const n = tripRepo.removeByMonth(year, month)
    reload()
    return { success: true, count: n }
  }

  function getMonths() {
    return tripRepo.getMonths()
  }

  function getById(id) {
    return tripRepo.getById(id)
  }

  return { records, reload, add, update, remove, removeByMonth, getMonths, getById }
})
