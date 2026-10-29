<template>
  <div class="app-container">
    <router-view v-slot="{ Component }">
      <keep-alive include="RefuelList,TripList,Stats,InvoiceView">
        <component :is="Component" />
      </keep-alive>
    </router-view>

    <!-- 底部导航栏 -->
    <van-tabbar v-if="showTabbar" route safe-area-inset-bottom>
      <van-tabbar-item to="/refuel" icon="fire-o">加油</van-tabbar-item>
      <van-tabbar-item to="/trip" icon="logistics">行程</van-tabbar-item>
      <van-tabbar-item to="/invoice" icon="description">发票</van-tabbar-item>
      <van-tabbar-item to="/stats" icon="chart-trending-o">统计</van-tabbar-item>
      <van-tabbar-item to="/settings" icon="setting-o">设置</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { maybeShowOilReminder } from './composables/useOilReminder'

const route = useRoute()
const showTabbar = computed(() => route.meta.showTabbar !== false)

// PWA Service Worker 更新提示
// 当检测到新版本时，弹出对话框提示用户刷新
const { updateServiceWorker } = useRegisterSW({
  onRegisteredSW(swUrl, registration) {
    // 每 60 分钟检查一次更新
    if (registration) {
      setInterval(() => {
        registration.update()
      }, 60 * 60 * 1000)
    }
  },
  onOfflineReady() {
    // 首次离线就绪提示
    showConfirmDialog({
      title: '离线可用',
      message: '应用已缓存完成，现在可以离线使用了！',
      showCancelButton: false,
      confirmButtonText: '知道了'
    }).catch(() => {})
  },
  onNeedRefresh() {
    // 检测到新版本，提示用户刷新
    showConfirmDialog({
      title: '发现新版本',
      message: '应用有新版本可用，是否立即刷新以获取最新功能？',
      confirmButtonText: '刷新',
      cancelButtonText: '稍后'
    }).then(() => {
      // 调用 updateServiceWorker 触发 SW 更新并刷新页面
      updateServiceWorker(true)
    }).catch(() => {})
  }
})

// 应用内油价提醒：每次打开 App 检查是否为调价日/前一天（每个窗口只提醒一次）
// 延迟执行，避免与首屏渲染、PWA 更新弹窗抢占
onMounted(() => {
  setTimeout(() => { maybeShowOilReminder() }, 1500)
})
</script>

<style scoped>
.app-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
