import { createRouter, createWebHashHistory } from 'vue-router'
import { useSettingsStore } from '../stores/settings'

// 允许作为默认首页的路由白名单
const DEFAULT_PAGE_ALLOWED = ['/refuel', '/trip', '/stats', '/invoice', '/settings']

const routes = [
  {
    path: '/',
    redirect: () => {
      try {
        const dp = useSettingsStore().settings.defaultPage
        if (DEFAULT_PAGE_ALLOWED.includes(dp)) return dp
      } catch (e) {
        // pinia 未就绪时回退默认
      }
      return '/trip'
    }
  },
  {
    path: '/refuel',
    name: 'RefuelList',
    component: () => import('../views/refuel/RefuelList.vue'),
    meta: { title: '加油记录', showTabbar: true }
  },
  {
    path: '/refuel/edit/:id?',
    name: 'RefuelEdit',
    component: () => import('../views/refuel/RefuelEdit.vue'),
    meta: { title: '加油记录', showTabbar: false }
  },
  {
    path: '/trip',
    name: 'TripList',
    component: () => import('../views/trip/TripList.vue'),
    meta: { title: '行程快照', showTabbar: true }
  },
  {
    path: '/trip/edit/:id?',
    name: 'TripEdit',
    component: () => import('../views/trip/TripEdit.vue'),
    meta: { title: '行程快照', showTabbar: false }
  },
  {
    path: '/invoice',
    name: 'Invoice',
    component: () => import('../views/invoice/InvoiceView.vue'),
    meta: { title: '发票', showTabbar: true }
  },
  {
    path: '/oil/prices',
    name: 'OilPriceRecords',
    component: () => import('../views/oil/PriceRecords.vue'),
    meta: { title: '油价记录', showTabbar: false }
  },
  {
    path: '/oil',
    name: 'OilPrice',
    component: () => import('../views/oil/OilPrice.vue'),
    meta: { title: '油价', showTabbar: false }
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('../views/stats/Stats.vue'),
    meta: { title: '统计报表', showTabbar: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/settings/Settings.vue'),
    meta: { title: '设置', showTabbar: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach(to => {
  if (to.meta.title) {
    document.title = to.meta.title
  }
})

export default router
