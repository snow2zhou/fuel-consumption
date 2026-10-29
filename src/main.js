import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Vant from 'vant'
import 'vant/lib/index.css'
import App from './App.vue'
import router from './router'
import { runMigrations } from './api/storage'
import { initHolidayOverrides } from './api/holidayData'
import './styles/global.css'

// 启动前执行一次性数据迁移（如旧版发票 exported → 加油记录 exported）
runMigrations()
// 载入用户按年获取的法定节假日安排（覆盖内置）
initHolidayOverrides()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(Vant)
app.mount('#app')
