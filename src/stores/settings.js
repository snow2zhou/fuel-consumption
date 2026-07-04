/**
 * 设置状态管理
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { settingsRepo } from '../api/storage'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(settingsRepo.get())

  function save(patch) {
    settings.value = settingsRepo.save(patch)
    return settings.value
  }

  function reload() {
    settings.value = settingsRepo.get()
  }

  return { settings, save, reload }
})
