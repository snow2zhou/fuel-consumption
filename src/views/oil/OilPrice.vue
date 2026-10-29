<template>
  <div class="page page-without-tabbar">
    <van-nav-bar title="油价" left-text="返回" left-arrow @click-left="onBack">
      <template #right>
        <van-icon name="replay" size="18" @click="load(true)" />
      </template>
    </van-nav-bar>

    <!-- 地区选择 -->
    <div class="region-bar" @click="openProvincePicker">
      <van-icon name="location-o" />
      <span class="rg-name">{{ province || '选择油价地区' }}</span>
      <van-icon name="arrow-down" size="12" />
      <span v-if="data && data.updateDate" class="rg-hint">{{ data.updateDate }} 更新</span>
    </div>

    <!-- 数据源 -->
    <div class="src-bar" @click="openSourceSheet">
      <span class="sb-label">数据源</span>
      <span class="sb-name">{{ sourceName }}</span>
      <span class="sb-status">{{ sourceStatus }}</span>
      <van-icon name="arrow-down" size="12" class="sb-arrow" />
    </div>

    <!-- 查看日期 -->
    <div v-if="province" class="date-bar" @click="openDatePicker">
      <span class="db-label">查看日期</span>
      <span class="db-value">{{ viewDate || '今天（实时）' }}</span>
      <van-icon name="arrow-down" size="12" class="sb-arrow" />
    </div>

    <!-- 历史油价（来自本机价格记录） -->
    <div v-if="viewDate" class="hist-card">
      <div class="h2-head">
        <div>
          <div class="h2-title">{{ viewDate }} 油价</div>
          <div class="h2-sub">{{ province }} · 来自本机价格记录</div>
        </div>
        <van-button size="small" plain type="primary" @click="backToToday">回到今天</van-button>
      </div>
      <div v-if="historyRows.length" class="h2-grid">
        <div v-for="r in historyRows" :key="r.fuelType" class="h2-item">
          <div class="h2-price">{{ formatNum(r.price, 2) }}</div>
          <div class="h2-fuel">{{ r.fuelType }}</div>
          <div class="h2-since">{{ r.since.slice(5) }} 起<template v-if="r.stale"> · 可能已调价</template></div>
        </div>
      </div>

      <!-- 权威数据补齐状态 -->
      <div v-if="emState.loading" class="h2-em">正在从东方财富（发改委调价数据）获取权威历史价…</div>
      <div v-else-if="emState.error" class="h2-em h2-em-error">{{ emState.error }}</div>

      <van-empty v-if="viewDate && historyRows.length === 0 && !emState.loading && !emState.error" image-size="56" description="该日期没有本机价格记录" />
      <div v-if="historyRows.length" class="h2-note">
        缺失或超过一个调价周期（10 个工作日）的油号，会自动从发改委调价数据获取并存入本机（生效日 = 调价日）；98# 数据源未提供。
      </div>
    </div>

    <div v-if="!viewDate && loading && !data" class="loading-tip">正在获取油价…</div>

    <!-- 错误 / 额度用尽 / 未配置凭据 -->
    <div v-if="!viewDate && errorMsg && !loading" class="error-card">
      <div class="ec-title">{{ errorTitle }}</div>
      <div class="ec-sub">{{ errorMsg }}</div>
      <div class="ec-actions">
        <van-button size="small" plain type="primary" @click="load(true)">重试</van-button>
        <van-button size="small" plain @click="openSourceSheet">切换数据源</van-button>
        <van-button v-if="authFailed || needCreds || quota" size="small" type="primary" @click="goSettings">去配置</van-button>
      </div>
    </div>

    <!-- 降级：无法解析 → 展示来源网页 -->
    <div v-if="!viewDate && !loading && (pageOnly || parseFailed) && fallbackUrl" class="degrade-card">
      <div class="dg-title">该来源无法自动解析，已降级为网页内容</div>
      <div class="dg-sub">
        部分网站禁止被内嵌，若下方空白，请点「在浏览器打开」或改用手动录入。
      </div>
      <iframe class="dg-frame" :src="fallbackUrl" referrerpolicy="no-referrer" loading="lazy"></iframe>
      <div class="dg-actions">
        <van-button size="small" plain type="primary" @click="openFallback">在浏览器打开</van-button>
        <van-button size="small" plain @click="openSourceSheet">换个来源</van-button>
        <van-button size="small" type="primary" @click="openManual">手动录入</van-button>
      </div>
    </div>

    <!-- 手动录入源：尚未录入价格 -->
    <div v-if="!viewDate && !loading && manualMode && !data" class="manual-card">
      <div class="mc-title">当前使用「手动录入」</div>
      <div class="mc-sub">不联网，填一次当前 {{ fuelType }} 油价即可，之后可随时修改。</div>
      <van-button size="small" type="primary" @click="openManual">填写当前油价</van-button>
    </div>

    <!-- 手动录入价（接口不可用时的兜底展示） -->
    <div v-else-if="!viewDate && !data && manualPrice" class="manual-card">
      <div class="mc-title">已手动记录的 {{ fuelType }} 油价</div>
      <div class="mc-price">{{ formatNum(manualPrice.price, 2) }} 元/升<span class="mc-date">{{ manualPrice.date }}</span></div>
      <van-button size="small" plain type="primary" @click="openManual">修改</van-button>
    </div>

    <template v-if="data && !viewDate">
      <div v-if="data.stale" class="stale-tip">
        显示的是缓存数据（{{ formatDate(data.fetchedAt, 'MM-DD HH:mm') }}），可能已过期
      </div>

      <!-- 当前油价 -->
      <div class="price-card">
        <div class="pc-label">{{ fuelType }} 最高零售价{{ data.province ? ' · ' + data.province : '' }}</div>
        <div class="pc-line">
          <span class="pc-num">{{ priceText }}</span>
          <span class="pc-unit">元/升</span>
          <span v-if="perLiter !== null" class="pc-delta" :class="dirClass">{{ signedLiter }} 预计</span>
        </div>
        <div v-if="data.manual" class="pc-sub pc-manual" @click="openManual">手动录入 · 点此修改</div>
        <div v-else class="pc-sub">{{ data.forecast && data.forecast.text ? data.forecast.text : '第三方数据，仅供参考' }}</div>
      </div>

      <!-- 下次调价 -->
      <div class="adj-card">
        <div>
          <div class="ac-label">下次调价窗口</div>
          <div class="ac-value">
            {{ data.nextAdjustment ? data.nextAdjustment.label : '待公布' }}
            <span v-if="data.nextAdjustment && data.nextAdjustment.derived" class="ac-derived">推算</span>
          </div>
        </div>
        <div class="ac-right">
          <div class="ac-label">距生效</div>
          <div class="ac-value ac-countdown">{{ countdownText }}</div>
          <div v-if="dayLabel" class="ac-day" :class="{ hot: dayLabel !== '昨日已调价' }">{{ dayLabel }}</div>
        </div>
      </div>

      <!-- 测算结果（仅提供测算的来源才显示） -->
      <div v-if="hasForecast" class="forecast" :class="'fc-' + direction">
        <div class="fc-head">
          <span class="fc-title">
            {{ directionText }}
            <span v-if="data.forecast && data.forecast.derived" class="fc-tag">自算</span>
          </span>
          <span class="fc-amount">{{ perLiterText }}</span>
        </div>
        <div class="fc-line">{{ perTonText }}</div>
        <div class="fc-line muted">{{ basisText }}</div>
        <div class="fc-conf">
          把握度 {{ confidenceLabel }}
          <span v-if="workingDay !== null"> · 计价周期第 {{ workingDay }}/10 个工作日</span>
        </div>
      </div>

      <!-- 建议 -->
      <div v-if="hasForecast" class="advice" :class="'adv-' + advice.level">
        <div class="ad-title">{{ advice.title }}</div>
        <div class="ad-detail">{{ advice.detail }}</div>
      </div>

      <!-- 对我的车的影响 -->
      <div class="metrics">
        <div class="mm-item">
          <div class="mm-label">我的每公里成本</div>
          <div class="mm-value">{{ costPerKmText }}</div>
        </div>
        <div class="mm-item">
          <div class="mm-label">加满一箱 {{ tankCapacity }}L</div>
          <div class="mm-value" :class="dirClass">{{ tankDeltaText }}</div>
        </div>
      </div>

      <!-- 价格记录（本机累积的价格变更点） -->
      <div class="hist-card">
        <div class="hc-head">
          <span class="hc-title">价格记录 · {{ fuelType }}</span>
          <span v-if="historyPoints.length" class="hc-sub">{{ historyPoints.length }} 个变更点</span>
        </div>

        <template v-if="chart">
          <div class="hc-range">
            <span>最高 {{ chart.max.toFixed(2) }}</span>
            <span>最低 {{ chart.min.toFixed(2) }}</span>
            <span
              v-if="historyDelta !== null"
              class="hc-total"
              :class="historyDelta >= 0 ? 'is-up' : 'is-down'"
            >累计 {{ historyDelta > 0 ? '+' : '' }}{{ historyDelta.toFixed(2) }} 元/升</span>
          </div>
          <svg class="hc-chart" :viewBox="`0 0 ${chart.W} ${chart.H}`">
            <path :d="chart.d" fill="none" stroke="#1989fa" stroke-width="2" stroke-linejoin="round" />
            <circle
              v-for="(d, i) in chart.dots"
              :key="i"
              :cx="d.cx"
              :cy="d.cy"
              r="2.5"
              :fill="d.up ? '#ee0a24' : (d.down ? '#07c160' : '#1989fa')"
            />
          </svg>
          <div class="hc-xaxis">
            <span>{{ chart.firstLabel }}</span>
            <span>{{ chart.lastLabel }}</span>
          </div>
        </template>

        <div v-else class="hc-empty">
          已有 {{ historyPoints.length }} 次记录，至少累计 2 次价格变化才能画出曲线。<br />
          每次打开 App（或点右上角刷新）会自动记录当时的价格。
        </div>

        <div v-if="recentChanges.length" class="hc-list">
          <div v-for="p in recentChanges" :key="p.time" class="hc-item">
            <span class="hc-date">{{ p.date ? p.date.slice(5) : formatDate(p.time, 'MM-DD') }}</span>
            <span class="hc-price">{{ p.price.toFixed(2) }} 元/升</span>
            <span
              v-if="p.prev !== null"
              class="hc-delta"
              :class="p.price > p.prev ? 'is-up' : (p.price < p.prev ? 'is-down' : 'is-flat')"
            >{{ p.price > p.prev ? '+' : '' }}{{ (p.price - p.prev).toFixed(2) }}</span>
            <span v-else class="hc-delta is-flat">首次记录</span>
          </div>
        </div>

        <div class="hc-note">
          记录来自本机观察：只有打开 App 时才能看到价格，若两次打开之间跨过多次调价，中间变化不会补记。
        </div>
      </div>

      <div class="footnote">
        数据来源：{{ data.manual ? '手动录入（本机数据）' : sourceName + '（第三方）' }}，非官方发布；实际调价以国家发改委通知为准。<br />
        测算方法：本轮 10 个工作日原油均价对比上轮，折算幅度不足 50 元/吨则搁浅。
      </div>
    </template>

    <!-- 历史日期选择 -->
    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker
        v-model="pickerValue"
        :min-date="minDate"
        :max-date="maxDate"
        title="查看哪一天的油价"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>

    <!-- 数据源切换 -->
    <van-popup v-model:show="showSourceSheet" position="bottom" round>
      <div class="sheet">
        <div class="sheet-head">
          <span>选择数据源</span>
          <van-icon name="cross" @click="showSourceSheet = false" />
        </div>
        <div class="src-list">
          <div v-for="s in sourceRows" :key="s.id" class="src-item" @click="chooseSource(s)">
            <div class="si-main">
              <div class="si-name">
                {{ s.name }}<span v-if="s.custom" class="si-custom">自定义</span>
              </div>
              <div class="si-desc">{{ s.desc }}</div>
            </div>
            <div class="si-right">
              <span class="si-status" :class="{ warn: s.status === '待填写凭据' }">{{ s.status }}</span>
              <van-icon v-if="s.active" name="success" class="si-check" />
            </div>
          </div>
        </div>
        <div class="sheet-tip" @click="goSettings">在设置里添加来源 / 填写凭据 →</div>
      </div>
    </van-popup>

    <!-- 手动录入油价 -->
    <van-dialog
      v-model:show="showManual"
      title="手动录入油价"
      show-cancel-button
      @confirm="onSaveManual"
    >
      <div class="manual-box">
        <van-field v-model="manualDraft" type="number" label="当前油价" placeholder="如 8.61" input-align="right">
          <template #button>元/升</template>
        </van-field>
        <div class="manual-tip">{{ province }} · {{ fuelType }}，保存后会记入价格曲线。</div>
      </div>
    </van-dialog>

    <!-- 省份选择弹层 -->
    <van-popup v-model:show="showProvincePicker" position="bottom" round :style="{ height: '76%' }">
      <div class="pv">
        <div class="pv-head">
          <span>选择油价地区</span>
          <van-icon name="cross" @click="showProvincePicker = false" />
        </div>
        <van-search v-model="provinceKeyword" placeholder="搜索省份" shape="round" />
        <div class="pv-list">
          <div
            v-for="p in filteredProvinces"
            :key="p"
            class="pv-item"
            :class="{ active: p === province }"
            @click="chooseProvince(p)"
          >
            <span class="pv-name">{{ p }}</span>
            <span v-if="cachedMap[p] !== null && cachedMap[p] !== undefined" class="pv-price">
              {{ cachedMap[p].toFixed(2) }}
            </span>
            <van-icon v-if="p === province" name="success" class="pv-check" />
          </div>
        </div>
        <div class="pv-tip">已查过的省份会显示缓存价格；点选即查询该省。</div>
      </div>
    </van-popup>
  </div>
</template>

<script setup name="OilPrice">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../../stores/settings'
import { useRefuelStore } from '../../stores/refuel'
import { useTripStore } from '../../stores/trip'
import {
  fetchOilPrice, getCachedOilPrice, PROVINCES,
  getOilSources, getSourceCreds, saveManualPrice, attachCrudeForecast
} from '../../api/oilPrice'
import { getPriceOnDate, getPricesOnDate, addPricePoint } from '../../api/oilHistory'
import { getHistoricalFromEm } from '../../api/eastmoneyOil'
import { showSuccessToast, showToast } from 'vant'
import { KIND, sourceStatusText } from '../../api/oilSources'
import {
  fuelKeyOf, fuelKindOf, perTonToPerLiter, judgeDirection,
  confidenceOf, formatCountdown, buildAdvice, CONFIDENCE_LABELS,
  ADJUST_THRESHOLD_PER_TON, adjustmentDayLabel, buildPriceSeries, toDateStr
} from '../../utils/oilPrice'
import { getPriceHistory } from '../../api/oilHistory'
import { formatDate, formatNum } from '../../utils/format'

const router = useRouter()
const settingsStore = useSettingsStore()
const refuelStore = useRefuelStore()
const tripStore = useTripStore()

// 注意：不要先把 settingsStore.settings 包成 computed 再在 JS 里 `settings.xxx`——
// computed 是 ref 对象，脚本中必须写 `.value`，否则取到的是 undefined。
// 这里直接读 store（pinia 会把内部 ref 解包），避免这个坑。
const province = computed(() => settingsStore.settings.oilProvince || '')
const fuelType = computed(() => settingsStore.settings.preferredFuelType || '92#')
const fuelKey = computed(() => fuelKeyOf(fuelType.value))
const fuelKind = computed(() => fuelKindOf(fuelType.value))
const tankCapacity = computed(() => Number(settingsStore.settings.tankCapacity) || 50)

/* ---------- 数据源 ---------- */
const sources = ref([])
const showSourceSheet = ref(false)
const activeSourceId = computed(() => settingsStore.settings.oilSourceId || 'apizero')
const activeSource = computed(
  () => sources.value.find(s => s.id === activeSourceId.value) || sources.value[0] || null
)
const sourceName = computed(() => (activeSource.value ? activeSource.value.name : '—'))
const sourceStatus = computed(() => {
  const s = activeSource.value
  if (!s) return ''
  return sourceStatusText(s, getSourceCreds(s.id))
})
const sourceRows = computed(() =>
  sources.value.map(s => ({
    ...s,
    status: sourceStatusText(s, getSourceCreds(s.id)),
    active: s.id === activeSourceId.value
  }))
)

function reloadSources() {
  sources.value = getOilSources()
}

function openSourceSheet() {
  reloadSources()
  showSourceSheet.value = true
}

function chooseSource(s) {
  settingsStore.save({ oilSourceId: s.id })
  showSourceSheet.value = false
  data.value = null
  load(true)
}

function openFallback() {
  if (fallbackUrl.value) window.open(fallbackUrl.value, '_blank', 'noopener')
}

/* ---------- 手动录入（离线兜底） ---------- */
const showManual = ref(false)
const manualDraft = ref('')
const manualPrice = computed(() => {
  const p = province.value
  const ft = fuelType.value
  if (!p) return null
  const item = (settingsStore.settings.manualPrices || {})[`${p}|${ft}`]
  return item && Number(item.price) > 0 ? { price: Number(item.price), date: item.date || '' } : null
})

function openManual() {
  manualDraft.value = manualPrice.value ? String(manualPrice.value.price) : ''
  showManual.value = true
}

function onSaveManual() {
  const n = Number(manualDraft.value)
  if (!Number.isFinite(n) || n <= 0) return
  saveManualPrice(province.value, fuelType.value, n)
  // 手动录入即切到「手动录入」数据源，保证界面立刻能看到价格
  if (activeSourceId.value !== 'manual') settingsStore.save({ oilSourceId: 'manual' })
  showManual.value = false
  load(true)
}

/* ---------- 数据 ---------- */
const data = ref(null)
const loading = ref(false)
const errorMsg = ref('')
const quota = ref(false)
const errorCode = ref(0)
// 失败类型：决定界面给出"换源 / 填凭据 / 看网页 / 手动录入"哪种出口
const authFailed = ref(false)
const needCreds = ref(false)
const parseFailed = ref(false)
const pageOnly = ref(false)
const manualMode = ref(false)
const fallbackUrl = ref('')
let loadToken = 0 // 防止异步补测算时页面已切换

async function load(force = false) {
  if (!province.value) return
  loading.value = true
  errorMsg.value = ''
  quota.value = false
  errorCode.value = 0
  authFailed.value = false
  needCreds.value = false
  parseFailed.value = false
  pageOnly.value = false
  manualMode.value = false
  fallbackUrl.value = ''
  const token = ++loadToken

  const res = await fetchOilPrice(province.value, { force })
  if (token !== loadToken) return // 期间用户已切省份/重新加载
  parseFailed.value = !!res.parseFailed
  pageOnly.value = !!res.pageOnly
  manualMode.value = !!res.manual
  fallbackUrl.value = res.fallbackUrl || ''

  if (res.ok) {
    data.value = res.data
    // 来源没给测算 → 后台用国际原油自算，算好再补上（不阻塞油价显示）
    if (!(data.value.forecast && data.value.forecast.perTon !== null && data.value.forecast.perTon !== undefined)) {
      attachCrudeForecast(data.value, province.value).then(updated => {
        if (token === loadToken && updated) {
          data.value = updated
          reloadHistory()
        }
      }).catch(() => {})
    }
  } else {
    if (res.data) data.value = res.data
    errorMsg.value = res.error || ''
    quota.value = !!res.quota
    errorCode.value = res.code || res.httpStatus || 0
    authFailed.value = !!res.authFailed
    needCreds.value = !!res.needCreds
  }
  // 拉取成功后接口层会写入本地价格变更点，这里重新读取
  reloadHistory()
  loading.value = false
}

// 错误标题：先判额度/限流，再判凭据（4030 的文案里也提到 Key，避免误判成"凭据无效"）
const errorTitle = computed(() => {
  if (needCreds.value) return '数据源未配置凭据'
  if (quota.value) {
    return (errorCode.value === 429 || errorCode.value === 403)
      ? '接口请求过于频繁'
      : '今日免费额度已用完'
  }
  if (authFailed.value) return '数据源凭据无效'
  return '油价获取失败'
})

/* ---------- 倒计时 ---------- */
const now = ref(Date.now())
let timer = null
onMounted(() => {
  reloadSources()
  if (!province.value) openProvincePicker()
  else {
    reloadHistory()
    load()
  }
  timer = setInterval(() => { now.value = Date.now() }, 60 * 1000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })

const perTon = computed(() => (data.value && data.value.forecast ? data.value.forecast.perTon : null))
// 只有提供了调价测算的来源（目前是极数本源）才展示方向/建议卡
// 注意：手动录入源的 forecast 是空对象，perTon 为 undefined，不能只判 !== null
const hasForecast = computed(() =>
  perTon.value !== null && perTon.value !== undefined && Number.isFinite(Number(perTon.value))
)
const changeRate = computed(() => (data.value && data.value.forecast ? data.value.forecast.changeRate : null))
const workingDay = computed(() => (data.value && data.value.forecast ? data.value.forecast.workingDay : null))
const crudeAvg = computed(() => (data.value && data.value.forecast ? data.value.forecast.crudeAvg : null))
const perLiter = computed(() => perTonToPerLiter(perTon.value, fuelKind.value))
const direction = computed(() => judgeDirection(perTon.value))

const hoursLeft = computed(() => {
  if (!data.value || !data.value.nextAdjustment) return null
  return (data.value.nextAdjustment.at - now.value) / 3600000
})
const countdownText = computed(() => {
  if (!data.value || !data.value.nextAdjustment) return '—'
  return formatCountdown(data.value.nextAdjustment.at - now.value)
})
// 调价前一天 / 当天标记（按窗口日判断，不能用剩余小时数推断）
const dayLabel = computed(() => adjustmentDayLabel(data.value && data.value.nextAdjustment))
const confidence = computed(() => confidenceOf(workingDay.value, hoursLeft.value))
const confidenceLabel = computed(() => CONFIDENCE_LABELS[confidence.value] || '低')

const price = computed(() => (data.value && data.value.prices ? data.value.prices[fuelKey.value] : null))
const priceText = computed(() => (price.value === null || price.value === undefined ? '—' : formatNum(price.value, 2)))

const dirClass = computed(() => ({
  up: 'is-up',
  down: 'is-down',
  flat: 'is-flat',
  unknown: 'is-flat'
}[direction.value] || 'is-flat'))

const directionText = computed(() => ({
  up: '测算：上调 ↑',
  down: '测算：下调 ↓',
  flat: '测算：搁浅 —',
  unknown: '暂无测算'
}[direction.value]))

const signedLiter = computed(() => {
  if (perLiter.value === null) return ''
  const v = perLiter.value
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
})
const perLiterText = computed(() => {
  if (perLiter.value === null) return '—'
  if (direction.value === 'flat') return '不足 50 元/吨'
  return `${signedLiter.value} 元/升`
})
const perTonText = computed(() => {
  if (perTon.value === null) return '本轮测算暂未公布'
  const v = Math.round(perTon.value)
  const sign = v > 0 ? '+' : ''
  const margin = Math.round(Math.abs(v) - ADJUST_THRESHOLD_PER_TON)
  return `约 ${sign}${v} 元/吨 · 距 ${ADJUST_THRESHOLD_PER_TON} 元/吨门槛 ${margin > 0 ? margin + ' 元' : '未达'}`
})
const basisText = computed(() => {
  const parts = []
  if (changeRate.value !== null) parts.push(`原油变化率 ${changeRate.value > 0 ? '+' : ''}${formatNum(changeRate.value, 2)}%`)
  if (crudeAvg.value !== null) parts.push(`周期均价 $${formatNum(crudeAvg.value, 2)}/桶`)
  if (workingDay.value !== null) parts.push(`第 ${workingDay.value}/10 个工作日`)
  return parts.join(' · ') || '依据：本轮原油均价对比上轮'
})

/* ---------- 估算日均里程与剩余续航（用本 App 已有数据） ---------- */
const avgDailyKm = computed(() => {
  const list = [...refuelStore.records].sort((a, b) => new Date(a.time) - new Date(b.time))
  if (list.length < 2) return null
  const first = list[0]
  const last = list[list.length - 1]
  const days = (new Date(last.time) - new Date(first.time)) / 86400000
  if (!(days >= 1)) return null
  const km = Number(last.totalMileage) - Number(first.totalMileage)
  if (!(km > 0)) return null
  return km / days
})

const rangeKm = computed(() => {
  const t = tripStore.records[0]
  const r = refuelStore.records[0]
  if (!t && !r) return null
  let latest = r
  if (t && (!r || new Date(t.time) > new Date(r.time))) latest = t
  const v = Number(latest && latest.estimatedRange)
  return Number.isFinite(v) && v > 0 ? v : null
})

const advice = computed(() => buildAdvice({
  direction: direction.value,
  perTon: perTon.value,
  perLiter: perLiter.value,
  confidence: confidence.value,
  workingDay: workingDay.value,
  hoursLeft: hoursLeft.value,
  rangeKm: rangeKm.value,
  avgDailyKm: avgDailyKm.value,
  tankCapacity: tankCapacity.value
}))

/* ---------- 对我的车的影响 ---------- */
const costPerKmText = computed(() => {
  const avg = refuelStore.statistics.avgFuelPer100km
  if (!price.value || !avg) return '—'
  return `${formatNum(price.value * avg / 100, 2)} 元/km`
})
const tankDeltaText = computed(() => {
  if (perLiter.value === null) return '—'
  const delta = perLiter.value * tankCapacity.value
  if (Math.abs(delta) < 0.5) return '基本无变化'
  return `${delta > 0 ? '多花' : '省'} ${Math.abs(delta).toFixed(0)} 元`
})

/* ---------- 价格记录（本地累积，非接口返回） ---------- */
const historyPoints = ref([])

function reloadHistory() {
  historyPoints.value = province.value
    ? buildPriceSeries(getPriceHistory(province.value, fuelType.value))
    : []
}

const historyDelta = computed(() => {
  const pts = historyPoints.value
  if (pts.length < 2) return null
  return pts[pts.length - 1].price - pts[0].price
})

const recentChanges = computed(() => historyPoints.value.slice(-6).reverse())

const chart = computed(() => {
  const pts = historyPoints.value
  if (pts.length < 2) return null

  const W = 320
  const H = 120
  const padL = 6
  const padR = 6
  const padT = 10
  const padB = 10
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const prices = pts.map(p => p.price)
  let min = Math.min(...prices)
  let max = Math.max(...prices)
  if (max - min < 0.02) {
    min -= 0.05
    max += 0.05
  }

  const t0 = new Date(pts[0].time).getTime()
  const t1 = new Date(pts[pts.length - 1].time).getTime()
  const xAt = i => {
    if (t1 <= t0) return padL + innerW * i / (pts.length - 1)
    return padL + innerW * (new Date(pts[i].time).getTime() - t0) / (t1 - t0)
  }
  const yAt = p => padT + innerH * (1 - (p - min) / (max - min))

  // 阶梯线：横向走到下次变更，再纵向跳到新价
  let d = `M ${xAt(0)} ${yAt(pts[0].price)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` H ${xAt(i)} V ${yAt(pts[i].price)}`
  }

  const dots = pts.map((p, i) => ({
    cx: xAt(i),
    cy: yAt(p.price),
    up: p.prev !== null && p.price > p.prev,
    down: p.prev !== null && p.price < p.prev
  }))

  const last = pts[pts.length - 1]
  return {
    W, H, d, dots, min, max,
    firstLabel: pts[0].date ? pts[0].date.slice(5) : formatDate(pts[0].time, 'MM-DD'),
    lastLabel: last.date ? last.date.slice(5) : formatDate(last.time, 'MM-DD')
  }
})

/* ---------- 地区选择 ---------- */
const showProvincePicker = ref(false)
const provinceKeyword = ref('')
const cachedMap = ref({})

const filteredProvinces = computed(() => {
  const kw = provinceKeyword.value.trim()
  if (!kw) return PROVINCES
  return PROVINCES.filter(p => p.includes(kw))
})

function openProvincePicker() {
  const map = {}
  for (const p of PROVINCES) {
    const c = getCachedOilPrice(p, activeSourceId.value)
    map[p] = c && c.prices ? c.prices[fuelKey.value] : null
  }
  cachedMap.value = map
  showProvincePicker.value = true
}

function chooseProvince(p) {
  settingsStore.save({ oilProvince: p })
  showProvincePicker.value = false
  provinceKeyword.value = ''
  data.value = null
  load()
}

/* ---------- 历史油价查看 ---------- */
const showDatePicker = ref(false)
const pickerValue = ref([])
const viewDate = ref('') // 非空 = 正在查看该日期的历史油价
const historyRows = ref([])
const todayStr = computed(() => toDateStr(new Date()))
const minDate = new Date(new Date().getFullYear() - 2, 0, 1)
const maxDate = new Date()

function openDatePicker() {
  pickerValue.value = (viewDate.value || todayStr.value).split('-')
  // 重新选择同一日期时允许再次尝试权威数据回填（如上次网络失败）
  if (viewDate.value) histTried.delete(viewDate.value)
  showDatePicker.value = true
}

function applyHistory() {
  applyHistoryAsync()
}

/* ---------- 东方财富·发改委调价数据回填（历史视图，自动保存） ---------- */
const emState = ref({ loading: false, error: '' })
const EM_GRADES = ['92#', '95#', '柴油']
let histToken = 0
const histTried = new Set() // 本会话内已尝试回填的日期（防止保存后再次触发循环）

async function applyHistoryAsync() {
  const date = viewDate.value
  if (!date || !province.value) {
    historyRows.value = []
    emState.value = { loading: false, error: '' }
    return
  }
  const token = ++histToken

  // 1) 本机记录（带"是否跨过调价周期"标记）
  let rows = getPricesOnDate(province.value, date)
  historyRows.value = rows

  // 2) 缺失、或生效日距目标日期超过 10 个工作日的油号 → 从东财取权威数据并自动存入
  const need = EM_GRADES.filter(t => {
    const r = rows.find(x => x.fuelType === t)
    return !r || r.stale
  })

  if (need.length > 0 && !histTried.has(date)) {
    histTried.add(date)
    emState.value = { loading: true, error: '' }
    let saved = 0
    let emMsg = ''
    try {
      const res = await getHistoricalFromEm(province.value, date)
      if (token !== histToken || viewDate.value !== date) return
      if (res.ok) {
        for (const r of res.rows) {
          if (!need.includes(r.fuelType)) continue
          const added = addPricePoint({
            province: province.value,
            fuelType: r.fuelType,
            date: res.adjustDate,
            price: r.price,
            source: 'eastmoney',
            manual: false,
            nextAdjustmentAt: (nextWindowFrom(res.adjustDate) || {}).at || null
          })
          if (added) saved++
        }
        if (saved > 0) {
          showSuccessToast(`已自动补齐 ${saved} 条历史油价（生效日 ${res.adjustDate}）`)
        }
      } else {
        emMsg = res.message || '未能获取该日期的权威数据'
      }
    } catch (e) {
      emMsg = '权威数据获取失败'
    }
    if (token !== histToken || viewDate.value !== date) return
    // 重新读本机记录（含刚存入的）
    rows = getPricesOnDate(province.value, date)
    emState.value = { loading: false, error: saved > 0 ? '' : emMsg }
  }

  historyRows.value = rows
}

function onDateConfirm({ selectedValues }) {
  const [y, m, d] = selectedValues
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  showDatePicker.value = false
  // 今天及以后 → 回到实时视图（未来的价还不存在）
  viewDate.value = dateStr >= todayStr.value ? '' : dateStr
  applyHistory()
}

function backToToday() {
  viewDate.value = ''
  historyRows.value = []
}

function onBack() {
  router.back()
}

function goSettings() {
  router.push('/settings')
}
</script>

<style scoped>
/* 历史日期查看 */
.date-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 12px 0;
  padding: 8px 12px;
  background: #fff;
  border-radius: 8px;
  font-size: 12px;
  color: #646566;
  cursor: pointer;
}
.db-label { color: #969799; }
.db-value { font-weight: 500; color: #323233; }

.hist-card {
  margin: 10px 12px 0;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #ebedf0;
  border-radius: 10px;
}
.h2-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.h2-title { font-size: 15px; font-weight: 600; color: #323233; }
.h2-sub { margin-top: 2px; font-size: 11px; color: #969799; }
.h2-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.h2-item { text-align: center; }
.h2-price { font-size: 16px; font-weight: 600; color: #1989fa; }
.h2-fuel { margin-top: 3px; font-size: 11px; color: #323233; }
.h2-since { margin-top: 2px; font-size: 10px; color: #c8c9cc; }
.h2-note { margin-top: 10px; font-size: 11px; line-height: 1.6; color: #969799; }
.h2-em { margin-top: 10px; font-size: 11px; line-height: 1.6; color: #969799; }
.h2-em-error { color: #ff976a; }
.h2-em-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.h2-em-src { color: #1989fa; }

/* 数据源栏 */
.src-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 12px 0;
  padding: 8px 12px;
  background: #fff;
  border-radius: 8px;
  font-size: 12px;
  color: #646566;
  cursor: pointer;
}
.sb-label { color: #969799; }
.sb-name { font-weight: 500; color: #323233; }
.sb-status {
  padding: 0 6px;
  border-radius: 8px;
  background: #f2f3f5;
  color: #969799;
  font-size: 10px;
}
.sb-arrow { margin-left: auto; color: #c8c9cc; }

/* 降级：展示来源网页 */
.degrade-card {
  margin: 10px 12px 0;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #ebedf0;
  border-radius: 10px;
}
.dg-title { font-size: 13px; font-weight: 600; color: #323233; }
.dg-sub { margin-top: 4px; font-size: 11px; line-height: 1.6; color: #969799; }
.dg-frame {
  width: 100%;
  height: 260px;
  margin-top: 10px;
  border: 1px solid #f2f3f5;
  border-radius: 8px;
  background: #fafafa;
}
.dg-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }

/* 手动录入 */
.manual-card {
  margin: 10px 12px 0;
  padding: 14px;
  background: #fff;
  border: 1px solid #ebedf0;
  border-radius: 10px;
}
.mc-title { font-size: 13px; font-weight: 600; color: #323233; }
.mc-sub { margin: 4px 0 10px; font-size: 11px; line-height: 1.6; color: #969799; }
.mc-price { margin: 6px 0 10px; font-size: 22px; font-weight: 600; color: #1989fa; }
.mc-date { margin-left: 8px; font-size: 11px; font-weight: 400; color: #969799; }

/* 数据源弹层 */
.sheet { max-height: 70vh; display: flex; flex-direction: column; }
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid #f2f3f5;
}
.src-list { overflow-y: auto; }
.src-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #f7f8fa;
  cursor: pointer;
}
.si-main { min-width: 0; flex: 1; }
.si-name { font-size: 14px; font-weight: 500; color: #323233; }
.si-custom {
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 6px;
  background: #eaf5ff;
  color: #1989fa;
  font-size: 10px;
  font-weight: 400;
}
.si-desc { margin-top: 2px; font-size: 11px; line-height: 1.5; color: #969799; }
.si-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.si-status { font-size: 10px; color: #07c160; }
.si-status.warn { color: #ff976a; }
.si-check { color: #07c160; }
.sheet-tip {
  padding: 12px 16px 18px;
  font-size: 12px;
  color: #1989fa;
  text-align: center;
  cursor: pointer;
}

.manual-box { padding: 8px 16px 12px; }
.manual-tip { margin-top: 8px; font-size: 11px; line-height: 1.6; color: #969799; }

.region-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 12px 0;
  padding: 10px 12px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  font-size: 14px;
  cursor: pointer;
}
.rg-name { font-weight: 500; }
.rg-hint { margin-left: auto; font-size: 11px; color: #969799; }

.loading-tip { padding: 40px 0; text-align: center; color: #969799; font-size: 13px; }

.stale-tip {
  margin: 10px 12px 0;
  padding: 8px 10px;
  background: #fff7e8;
  border: 1px solid #ffd9a8;
  border-radius: 8px;
  font-size: 12px;
  color: #d46b08;
}

.error-card {
  margin: 12px;
  padding: 14px;
  background: #fef2f2;
  border: 1px solid #f7c1c1;
  border-radius: 10px;
}
.ec-title { font-size: 14px; font-weight: 600; color: #a32d2d; }
.ec-sub { margin-top: 6px; font-size: 12px; line-height: 1.6; color: #791f1f; word-break: break-all; }
.ec-actions { display: flex; gap: 10px; margin-top: 12px; }

.price-card {
  margin: 10px 12px 0;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.pc-label { font-size: 12px; color: #969799; }
.pc-line { display: flex; align-items: baseline; gap: 6px; margin-top: 4px; }
.pc-num { font-size: 30px; font-weight: 600; color: #323233; letter-spacing: -0.5px; }
.pc-unit { font-size: 12px; color: #969799; }
.pc-delta { margin-left: auto; font-size: 12px; font-weight: 500; }
.pc-sub { margin-top: 6px; font-size: 11px; color: #969799; line-height: 1.5; }
.pc-manual { color: #1989fa; cursor: pointer; }

.is-up { color: #ee0a24; }
.is-down { color: #07c160; }
.is-flat { color: #969799; }

.adj-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 12px 0;
  padding: 12px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.ac-label { font-size: 11px; color: #969799; }
.ac-value { margin-top: 2px; font-size: 15px; font-weight: 600; color: #323233; }
.ac-right { text-align: right; }
.ac-countdown { color: #ff7a00; }
.ac-derived {
  display: inline-block;
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 6px;
  background: #f2f3f5;
  color: #969799;
  font-size: 10px;
  font-weight: 400;
  vertical-align: middle;
}
.ac-day {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  background: #f2f3f5;
  color: #969799;
}
.ac-day.hot { background: #fdecee; color: #ee0a24; }

.forecast {
  margin: 10px 12px 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #ebedf0;
  background: #f7f8fa;
}
.fc-up { background: #fdecee; border-color: #f7c1c1; }
.fc-down { background: #e8f8ee; border-color: #b7ebc9; }
.fc-flat, .fc-unknown { background: #f7f8fa; border-color: #ebedf0; }
.fc-head { display: flex; align-items: center; justify-content: space-between; }
.fc-title { font-size: 15px; font-weight: 600; }
.fc-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 6px;
  background: #f2f3f5;
  color: #969799;
  font-size: 10px;
  font-weight: 400;
  vertical-align: middle;
}
.fc-up .fc-title, .fc-up .fc-amount { color: #ee0a24; }
.fc-down .fc-title, .fc-down .fc-amount { color: #07c160; }
.fc-flat .fc-title, .fc-flat .fc-amount,
.fc-unknown .fc-title, .fc-unknown .fc-amount { color: #646566; }
.fc-amount { font-size: 13px; font-weight: 600; }
.fc-line { margin-top: 6px; font-size: 12px; color: #323233; line-height: 1.5; }
.fc-line.muted { color: #969799; }
.fc-conf { margin-top: 6px; font-size: 11px; color: #969799; }

.advice {
  margin: 10px 12px 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #ebedf0;
  background: #fff;
}
.adv-title { font-size: 14px; font-weight: 600; color: #323233; }
.adv-detail { margin-top: 4px; font-size: 12px; line-height: 1.6; color: #646566; }
.advice.adv-now { background: #fff7e8; border-color: #ffd9a8; }
.advice.adv-now .adv-title { color: #d46b08; }
.advice.adv-wait { background: #e8f8ee; border-color: #b7ebc9; }
.advice.adv-wait .adv-title { color: #07c160; }

.metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 10px 12px 0;
}
.mm-item {
  padding: 12px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.mm-label { font-size: 11px; color: #969799; }
.mm-value { margin-top: 3px; font-size: 17px; font-weight: 600; color: #323233; }

/* 价格记录 */
.hist-card {
  margin: 10px 12px 0;
  padding: 12px 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.hc-head { display: flex; align-items: center; justify-content: space-between; }
.hc-title { font-size: 13px; font-weight: 600; color: #323233; }
.hc-sub { font-size: 11px; color: #969799; }
.hc-range { display: flex; gap: 12px; margin-top: 6px; font-size: 11px; color: #969799; }
.hc-total { margin-left: auto; font-weight: 600; }
.hc-chart { display: block; width: 100%; height: auto; margin-top: 4px; }
.hc-xaxis { display: flex; justify-content: space-between; margin-top: -2px; font-size: 10px; color: #c8c9cc; }
.hc-empty { margin-top: 8px; font-size: 12px; line-height: 1.6; color: #969799; }
.hc-list { margin-top: 8px; border-top: 1px solid #f5f6f7; }
.hc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  font-size: 12px;
  border-bottom: 1px solid #f7f8fa;
}
.hc-date { width: 46px; color: #969799; }
.hc-price { flex: 1; font-weight: 500; color: #323233; }
.hc-delta { font-weight: 600; }
.hc-note { margin-top: 8px; font-size: 10px; line-height: 1.6; color: #c8c9cc; }

.footnote {
  margin: 12px 16px 24px;
  font-size: 11px;
  line-height: 1.7;
  color: #969799;
}

/* 省份弹层 */
.pv { height: 100%; display: flex; flex-direction: column; }
.pv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid #f2f3f5;
}
.pv-list { flex: 1; overflow-y: auto; }
.pv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 14px;
  border-bottom: 1px solid #f7f8fa;
  cursor: pointer;
}
.pv-item.active { background: #eaf5ff; }
.pv-name { font-weight: 500; }
.pv-price { margin-left: auto; font-size: 12px; color: #969799; }
.pv-check { color: #1989fa; }
.pv-tip { padding: 10px 16px 16px; font-size: 11px; color: #969799; }
</style>
