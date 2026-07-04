import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/refuel' },
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
