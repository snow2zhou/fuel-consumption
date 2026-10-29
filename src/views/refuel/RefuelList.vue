<template>
  <div class="page">
    <!-- 油价入口：左 = 今日油价 + 调价方向 / 右 = 调价日历 -->
    <div class="oil-entry-row">
      <div class="oil-entry" @click="goOil">
        <div class="oe-left">
          <div class="oe-title">
            <van-icon name="fire-o" class="oe-icon" />
            <span>{{ oilProvince || '油价' }}</span>
            <span class="oe-fuel">{{ oilFuelLabel }}</span>
          </div>
          <div class="oe-sub" v-if="oilPrice !== null">
            今日 {{ formatNum(oilPrice, 2) }} 元/升
            <span :class="['oe-dir', oilDirClass]">{{ oilDirText }}</span>
          </div>
          <div class="oe-sub" v-else-if="oilLoading">正在获取油价…</div>
          <div class="oe-sub" v-else>{{ oilProvince ? '点击查看今日油价与调价测算' : '点击选择油价地区' }}</div>
        </div>
        <van-icon name="arrow" class="oe-arrow" />
      </div>
      <div class="cal-entry" @click="openRefuelCalendar">
        <van-icon name="notes-o" class="ce-icon" />
        <span class="ce-text">调价日历</span>
      </div>
    </div>

    <!-- 概览统计 -->
    <div class="card overview">
      <div class="overview-row">
        <div>
          <div class="stat-value">{{ statistics.refuelCount }}</div>
          <div class="stat-label">加油次数</div>
        </div>
        <div>
          <div class="stat-value">{{ formatNum(statistics.totalVolume, 1) }}<span class="unit">L</span></div>
          <div class="stat-label">累计加油量</div>
        </div>
        <div>
          <div class="stat-value">{{ formatMoney(statistics.totalCost) }}<span class="unit">元</span></div>
          <div class="stat-label">累计费用</div>
        </div>
      </div>
      <div class="overview-row second" v-if="statistics.refuelCount > 0">
        <div>
          <div class="stat-value sm">{{ formatFuel(statistics.avgFuelPer100km, fuelUnit) }}<span class="unit">{{ fuelUnit }}</span></div>
          <div class="stat-label">平均百公里油耗</div>
        </div>
        <div>
          <div class="stat-value sm">{{ formatMoney(statistics.avgCostPerKm) }}<span class="unit">元/km</span></div>
          <div class="stat-label">平均每公里费用</div>
        </div>
      </div>
    </div>

    <!-- 筛选条 -->
    <div class="filter-bar">
      <div class="filter-tabs">
        <span
          v-for="opt in filterOptions"
          :key="opt.value"
          :class="['filter-tab', { active: filterType === opt.value }]"
          @click="onFilterTab(opt.value)"
        >{{ opt.label }}</span>
      </div>
      <div class="filter-info" v-if="list.length > 0">
        已显示 {{ visibleCount }} / {{ totalCount }} 条
        <span class="filter-custom-hint" v-if="filterType === 'custom' && customStart">
          （{{ customStart }} ~ {{ customEnd }}）
        </span>
      </div>
    </div>

    <!-- 自定义日期区间弹出 -->
    <van-calendar
      v-model:show="showCalendar"
      type="range"
      @confirm="onCalendarConfirm"
      :min-date="minCalendarDate"
      :max-date="maxCalendarDate"
      allow-same-day
    />

    <!-- 调价日历（发改委调价数据） -->
    <van-popup v-model:show="showPriceCalendar" position="bottom" round class="pcal-popup">
      <div class="pcal-head">
        <span class="pcal-title">调价日历</span>
        <van-icon name="cross" class="pcal-close" @click="showPriceCalendar = false" />
      </div>
      <div class="pcal-sub">{{ oilProvince || '全国' }} · 汽油口径 · 来自发改委调价数据（东方财富）</div>
      <div v-if="priceCalLoading" class="pcal-sub pcal-loading">正在获取调价数据…</div>
      <van-calendar
        title=" "
        :key="priceCalKey"
        :poppable="false"
        :show-confirm="false"
        :show-mark="false"
        :min-date="pcalMin"
        :max-date="pcalMax"
        :default-date="pcalDefault"
        :formatter="pcalFormatter"
        :style="{ height: '440px' }"
      />
      <div class="pcal-note">带底色 = 调价日：<b>红</b>上调 · <b>绿</b>下调 · 灰搁浅 · 蓝未来；日期上方为本机记录的当天生效油价与当次变动（92# 折算）；数据来自发改委调价记录</div>
    </van-popup>

    <!-- 记录列表 -->
    <div v-if="list.length === 0" class="empty-tip">
      <van-empty :description="emptyHint" />
    </div>

    <van-swipe-cell v-for="item in list" :key="item.id">
      <div class="card record-card" @click="onEdit(item)">
        <div class="card-header">
          <span class="item-title">{{ formatDate(item.time) }}</span>
          <van-tag :type="item.isFull ? 'primary' : 'default'" plain>
            {{ item.isFull ? '加满' : '未加满' }}
          </van-tag>
          <van-tag v-if="item.exported" type="success" plain icon="checked">已导出</van-tag>
          <van-tag v-else-if="item.invoiceLink" type="warning" plain icon="description">待导出</van-tag>
          <van-tag v-else-if="item.invoiceId" type="default" plain icon="description">已关联发票</van-tag>
        </div>
        <div class="info-grid">
          <div><span class="lbl">油号</span><span class="val">{{ item.fuelType }}</span></div>
          <div><span class="lbl">加油量</span><span class="val">{{ formatNum(item.volume, 2) }} L</span></div>
          <div><span class="lbl">油价</span><span class="val">{{ formatMoney(item.price) }} 元/L</span></div>
          <div><span class="lbl">费用</span><span class="val">{{ formatMoney(item.cost) }} 元</span></div>
        </div>

        <!-- 里程总览（核心判断依据集中显示） -->
        <div class="mileage-overview">
          <div class="mo-row">
            <span class="mo-label">当前总里程</span>
            <span class="mo-val mo-current">{{ formatNum(item.totalMileage, 1) }} km</span>
          </div>
          <div class="mo-row">
            <span class="mo-label">预计总里程</span>
            <span class="mo-val mo-estimate">{{ formatNum(estimatedTotal(item), 1) }} km</span>
          </div>
          <div class="mo-row" v-if="getPrediction(item) && getPrediction(item).calculable">
            <span class="mo-label">智能预测总里程</span>
            <span class="mo-val mo-predict">
              {{ formatNum(getPrediction(item).predictedTotalMileage, 1) }} km
              <span class="mo-dev" v-if="getPrediction(item).deviation">
                ({{ getPrediction(item).deviation.percent > 0 ? '+' : '' }}{{ formatNum(getPrediction(item).deviation.percent, 1) }}%)
              </span>
            </span>
          </div>
        </div>

        <!-- 智能预测详情（次要信息） -->
        <div class="predict-box" v-if="getPrediction(item)">
          <div class="box-title">智能预测（基于历史油耗）</div>
          <template v-if="getPrediction(item).calculable">
            <div class="row">
              <span class="label">预测可行驶里程</span>
              <span class="val">{{ formatNum(getPrediction(item).predictedRange, 0) }} km</span>
            </div>
            <div class="row" v-if="getPrediction(item).predictedDays > 0">
              <span class="label">预测可行驶天数</span>
              <span class="val">{{ formatNum(getPrediction(item).predictedDays, 1) }} 天</span>
            </div>
            <div class="row hint">
              <span class="label">参考：油箱 {{ formatNum(getPrediction(item).tankCapacity, 0) }}L，
                平均油耗 {{ formatFuel(getPrediction(item).avgFuel, fuelUnit) }} {{ fuelUnit }}，
                日均 {{ formatNum(getPrediction(item).avgDailyMileage, 1) }} km</span>
            </div>
            <!-- 偏差分析 -->
            <div class="row deviation" v-if="getPrediction(item).deviation">
              <span class="label">vs 您的输入({{ formatNum(getPrediction(item).userInputRange, 0) }}km)</span>
              <span :class="['dev-val', getPrediction(item).deviation.assessment]">
                {{ getPrediction(item).deviation.assessment }}
                ({{ getPrediction(item).deviation.percent > 0 ? '+' : '' }}{{ formatNum(getPrediction(item).deviation.percent, 1) }}%)
              </span>
            </div>
          </template>
          <template v-else>
            <div class="row warn">{{ getPrediction(item).reason }}</div>
          </template>
        </div>

        <!-- 对比计算结果 -->
        <div class="compare-box" v-if="item.comparison">
          <template v-if="item.comparison.calculable">
            <div class="row">
              <span class="label">间驶里程</span>
              <span class="val">{{ formatNum(item.comparison.intervalMileage, 1) }} km</span>
            </div>
            <div class="row">
              <span class="label">百公里油耗</span>
              <span class="val">{{ formatFuel(item.comparison.fuelPer100km, fuelUnit) }} {{ fuelUnit }}</span>
            </div>
            <div class="row">
              <span class="label">每公里费用</span>
              <span class="val">{{ formatNum(item.comparison.costPerKm, 3) }} 元/km</span>
            </div>
            <div class="row">
              <span class="label">期间总费用</span>
              <span class="val">{{ formatMoney(item.comparison.totalCost) }} 元</span>
            </div>
          </template>
          <template v-else>
            <div class="row">
              <span class="label" style="color:#ee0a24">{{ item.comparison.reason }}</span>
            </div>
          </template>
        </div>

        <div class="remark" v-if="item.remark">备注：{{ item.remark }}</div>
      </div>
      <template #right>
        <van-button square type="danger" text="删除" class="del-btn" @click="onDelete(item)" />
      </template>
    </van-swipe-cell>

    <!-- 加载更多 -->
    <div class="load-more" v-if="hasMore && list.length > 0" @click="loadMore">
      加载更多（剩余 {{ totalCount - visibleCount }} 条）
    </div>
    <div class="load-more no-more" v-else-if="list.length > 0 && totalCount > 0">
      已全部加载完毕（共 {{ totalCount }} 条）
    </div>

    <!-- 添加按钮 -->
    <div class="fab" @click="onAdd">
      <van-icon name="plus" size="24" color="#fff" />
    </div>
  </div>
</template>

<script setup name="RefuelList">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { fetchEmAdjustments } from '../../api/eastmoneyOil'
import { useRefuelStore } from '../../stores/refuel'
import { useSettingsStore } from '../../stores/settings'
import { formatDate, formatNum, formatMoney } from '../../utils/format'
import { predictRefuelRange } from '../../utils/calc'
import { formatFuel } from '../../utils/units'
import { useListFilter } from '../../composables/useListFilter'
import { fetchOilPrice } from '../../api/oilPrice'
import { getPriceOnDate } from '../../api/oilHistory'
import { fuelKeyOf, fuelKindOf, judgeDirection, perTonToPerLiter, LITERS_PER_TON, shiftWorkdays, nextWindowFrom, toDateStr } from '../../utils/oilPrice'
import { addDays } from '../../utils/holidays'

const router = useRouter()
const store = useRefuelStore()
const settingsStore = useSettingsStore()

// 当前油耗显示单位（来自设置，使"油耗单位"设置生效）
const fuelUnit = computed(() => settingsStore.settings.unit)

// 全量列表（带对比计算，按时间倒序）
const fullList = computed(() => store.listWithComparison)
const statistics = computed(() => store.statistics)

/* ---------- 油价入口（缓存 6 小时，失败静默降级） ---------- */
const oilProvince = computed(() => settingsStore.settings.oilProvince)
const oilFuelLabel = computed(() => settingsStore.settings.preferredFuelType || '92#')
const oilData = ref(null)
const oilLoading = ref(false)

const oilPrice = computed(() => {
  if (!oilData.value || !oilData.value.prices) return null
  const v = oilData.value.prices[fuelKeyOf(oilFuelLabel.value)]
  return v === undefined || v === null ? null : v
})
const oilPerTon = computed(() =>
  oilData.value && oilData.value.forecast ? oilData.value.forecast.perTon : null
)
const oilDir = computed(() => judgeDirection(oilPerTon.value))
const oilDirClass = computed(() => ({
  up: 'is-up', down: 'is-down', flat: 'is-flat', unknown: 'is-flat'
}[oilDir.value] || 'is-flat'))
const oilDirText = computed(() => {
  if (oilDir.value === 'flat') return '本轮预计搁浅'
  if (oilDir.value !== 'up' && oilDir.value !== 'down') return ''
  const l = perTonToPerLiter(oilPerTon.value, fuelKindOf(oilFuelLabel.value))
  if (l === null) return oilDir.value === 'up' ? '预计上调' : '预计下调'
  const sign = l > 0 ? '+' : ''
  return `预计${oilDir.value === 'up' ? '上调' : '下调'} ${sign}${l.toFixed(2)} 元/升`
})
const oilNextLabel = computed(() =>
  oilData.value && oilData.value.nextAdjustment ? oilData.value.nextAdjustment.label : ''
)

function goOil() {
  router.push('/oil')
}

onMounted(async () => {
  ensurePriceCal() // 预取调价数据：用户点开日历时即已就绪
  if (!oilProvince.value) return
  oilLoading.value = true
  const res = await fetchOilPrice(oilProvince.value)
  if (res.data) oilData.value = res.data
  oilLoading.value = false
})

// 接入筛选 + 分页 composable
const {
  filterType, customStart, customEnd,
  visibleList: list,
  totalCount, visibleCount, hasMore,
  loadMore, setFilter
} = useListFilter(() => fullList.value, { defaultPageSize: 10 })

// 筛选选项
const filterOptions = [
  { value: 'recent10', label: '最近10条' },
  { value: 'month1', label: '最近一月' },
  { value: 'month3', label: '最近三月' },
  { value: 'custom', label: '自定义' },
  { value: 'all', label: '全部' }
]

// 自定义日历
const showCalendar = ref(false)
const minCalendarDate = computed(() => {
  const all = store.records
  if (all.length === 0) return new Date(Date.now() - 365 * 24 * 3600 * 1000)
  const oldest = all.reduce((min, r) => {
    const t = new Date(r.time)
    return t < min ? t : min
  }, new Date())
  return oldest
})
const maxCalendarDate = new Date()

function onFilterTab(type) {
  if (type === 'custom') {
    showCalendar.value = true
    return
  }
  setFilter(type)
}

function onCalendarConfirm(dates) {
  // dates: [Date, Date]
  if (!dates || dates.length !== 2 || !dates[0] || !dates[1]) {
    showCalendar.value = false
    return
  }
  const [s, e] = dates
  const pad = n => String(n).padStart(2, '0')
  const startStr = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
  const endStr = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`
  setFilter('custom', { start: startStr, end: endStr })
  showCalendar.value = false
}

// 空状态提示文案

/* ---------- 调价日历（发改委调价数据） ---------- */
const showPriceCalendar = ref(false)
const priceCalMap = ref({}) // 'YYYY-MM-DD' -> { kind: 'adjust'|'flat', perLiter?, perTon? }
const priceCalLoading = ref(false)
const priceCalKey = ref(0) // 数据就绪后强制日历重画
const pcalMin = new Date(new Date().getFullYear() - 2, 0, 1)
const pcalMax = new Date(Date.now() + 90 * 24 * 3600 * 1000) // 允许翻看未来的调价日
const pcalDefault = new Date()

/**
 * 调价日历数据：标记「调价日」，让用户一眼看出"哪天会/曾调价"。
 * - 过去：东财调价时间线里的真实调价日（生效日）+ 当次结果（↑/↓ 折算 元/升）
 * - 未来：从下一个调价窗口起、每 10 个工作日一次（窗口日），仅标底色（结果未知）
 * 搁浅的窗口没有发生调价，不标（用户关心的是调价日本身，不是结果）。
 */
function buildPriceCalMap(list, todayStr) {
  const emMap = {}
  for (const a of list) emMap[a.date] = a

  // 锚：下一个调价窗口日（优先油价数据自带，其次由东财最新生效日 + 10 个工作日推算）
  const w0 = list.length ? nextWindowFrom(list[list.length - 1].date) : null
  const na = oilData.value && oilData.value.nextAdjustment
  const toAnchorStr = (o) => (o && o.year && o.month && o.day)
    ? o.year + '-' + String(o.month).padStart(2, '0') + '-' + String(o.day).padStart(2, '0')
    : ''
  let anchor = toAnchorStr(na) || toAnchorStr(w0)
  if (!anchor) return {}

  const fuel = settingsStore.settings.preferredFuelType || '92#'
  const map = {}
  const mark = (W) => {
    if (!W || map[W]) return
    const E = addDays(W, 1) // 窗口日次日 = 新价生效日
    const row = emMap[E]
    const info = { kind: 'future' }

    if (row && row.gasolineChange !== null && row.gasolineChange !== undefined) {
      // 实际调价：↑ / ↓
      info.kind = row.gasolineChange > 0 ? 'up' : row.gasolineChange < 0 ? 'down' : 'flat'
      info.perLiter = Math.round((row.gasolineChange / LITERS_PER_TON.gasoline) * 100) / 100
      info.perTon = row.gasolineChange
    } else if (E < todayStr) {
      // 窗口已过、无调价记录 → 搁浅
      info.kind = 'flat'
    }

    // 当天生效油价（本机记录，仅用户偏好的油号）
    try {
      const p = getPriceOnDate(oilProvince.value, fuel, E)
      if (p) info.price = p.price
    } catch (e) { /* 本机记录不可用则不显示油价 */ }

    // 下一个未定窗口：油价数据带测算 → 显示预计方向
    if (info.kind === 'future' && E >= todayStr) {
      const fc = oilData.value && oilData.value.forecast
      if (fc && fc.perTon !== null && fc.perTon !== undefined) {
        info.forecastPerLiter = Math.round((fc.perTon / (LITERS_PER_TON[fuelKindOf(fuel)] || 1388)) * 100) / 100
        info.forecastDir = fc.perTon > 0 ? '↑' : fc.perTon < 0 ? '↓' : ''
      }
    }
    map[W] = info
  }

  // 以锚点为准 ±10 个工作日链，覆盖显示范围
  let w = anchor
  while (w && w >= '2024-01-01') { mark(w); w = shiftWorkdays(w, -10) }
  w = shiftWorkdays(anchor, 10)
  while (w && w <= '2027-12-31') { mark(w); w = shiftWorkdays(w, 10) }
  return map
}

async function ensurePriceCal() {
  if (priceCalLoading.value || Object.keys(priceCalMap.value).length > 0) return
  priceCalLoading.value = true
  try {
    const list = await fetchEmAdjustments()
    priceCalMap.value = buildPriceCalMap(list, toDateStr(new Date()))
    priceCalKey.value++ // 日历已渲染过的话，强制重画以显示标记
  } catch (e) {
    showToast('调价数据获取失败')
  } finally {
    priceCalLoading.value = false
  }
}

function openRefuelCalendar() {
  showPriceCalendar.value = true
  ensurePriceCal()
}

function pcalFormatter(day) {
  const a = priceCalMap.value[formatDate(day.date, 'YYYY-MM-DD')]
  if (!a) return day
  const cls = []
  if (a.kind === 'up') cls.push('rcal-up')
  else if (a.kind === 'down') cls.push('rcal-down')
  else if (a.kind === 'flat') cls.push('rcal-flat')
  else if (a.kind === 'future') cls.push('rcal-future')
  day.className = cls.join(' ')

  // 上方：当天生效油价 + 当次变动金额（有数据时）
  if (a.price !== undefined && a.price !== null) {
    let t = formatNum(a.price, 2)
    if (a.perLiter !== undefined && a.perLiter !== null) t += ' ' + (a.perLiter > 0 ? '↑' : a.perLiter < 0 ? '↓' : '＝') + Math.abs(a.perLiter).toFixed(2)
    day.topInfo = t
  } else if (a.forecastPerLiter !== undefined) {
    day.topInfo = '预计' + (a.forecastDir || '') + Math.abs(a.forecastPerLiter).toFixed(2)
  }

  // 下方：结果文字
  if (a.kind === 'up') day.bottomInfo = '上调'
  else if (a.kind === 'down') day.bottomInfo = '下调'
  else if (a.kind === 'flat') day.bottomInfo = '搁浅'
  else if (a.kind === 'future') day.bottomInfo = a.forecastDir ? '预计调价' : '调价日'
  return day
}

// 预计总里程 = 总里程 + 预计可行驶里程
function estimatedTotal(item) {
  return Number(item.totalMileage || 0) + Number(item.estimatedRange || 0)
}

// 智能预测缓存（按 id，基于全量数据计算，避免分页后失真）
const predictionCache = computed(() => {
  const cache = {}
  const all = store.records
  const tankCapacity = settingsStore.settings.tankCapacity
  for (const item of list.value) {
    cache[item.id] = predictRefuelRange(item, all, { tankCapacity })
  }
  return cache
})

function getPrediction(item) {
  return predictionCache.value[item.id] || null
}

function onAdd() {
  router.push('/refuel/edit')
}

function onEdit(item) {
  router.push(`/refuel/edit/${item.id}`)
}

function onDelete(item) {
  showConfirmDialog({
    title: '确认删除',
    message: '确定删除该加油记录吗？'
  }).then(() => {
    store.remove(item.id)
    showToast('已删除')
  }).catch(() => {})
}
</script>

<style scoped>
.overview {
  background: linear-gradient(135deg, #1989fa 0%, #2c8cff 100%);
  color: #fff;
}
/* 筛选条 */
.filter-bar {
  margin: 10px 12px 4px;
  padding: 8px 10px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.filter-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.filter-tab {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 12px;
  background: #f7f8fa;
  color: #646566;
  cursor: pointer;
  transition: all 0.2s;
}
.filter-tab.active {
  background: #1989fa;
  color: #fff;
  font-weight: 500;
}
.filter-info {
  margin-top: 6px;
  font-size: 11px;
  color: #969799;
  text-align: right;
}
.filter-custom-hint {
  color: #1989fa;
  margin-left: 4px;
}
/* 加载更多 */
.load-more {
  margin: 12px;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  color: #1989fa;
  background: #fff;
  border: 1px dashed #1989fa;
  border-radius: 8px;
  cursor: pointer;
}
.load-more.no-more {
  color: #969799;
  border-color: #ebedf0;
  cursor: default;
}
.overview :deep(.stat-value) {
  color: #fff;
}
.overview .unit {
  font-size: 12px;
  font-weight: 400;
  margin-left: 2px;
}
.overview-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.overview-row.second {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}
.stat-value.sm {
  font-size: 17px;
}
.overview .stat-label {
  color: rgba(255, 255, 255, 0.85);
}

.record-card {
  margin-bottom: 0;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  font-size: 13px;
}
.info-grid .lbl {
  color: #969799;
  margin-right: 6px;
}
.info-grid .val {
  color: #323233;
  font-weight: 500;
}
.info-grid .highlight .val {
  color: #07c160;
}
/* 里程总览（核心里程数据集中显示） */
.mileage-overview {
  margin-top: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #fafafa 0%, #f5f7fa 100%);
  border: 1px solid #ebedf0;
  border-radius: 8px;
}
.mileage-overview .mo-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.mileage-overview .mo-row + .mo-row {
  border-top: 1px dashed #ebedf0;
  margin-top: 2px;
  padding-top: 6px;
}
.mileage-overview .mo-label {
  color: #969799;
}
.mileage-overview .mo-val {
  font-weight: 600;
  font-size: 14px;
}
.mileage-overview .mo-current {
  color: #323233;
}
.mileage-overview .mo-estimate {
  color: #07c160;
}
.mileage-overview .mo-predict {
  color: #ee0a24;
}
.mileage-overview .mo-dev {
  font-size: 11px;
  font-weight: 500;
  margin-left: 4px;
  color: #ff7a00;
}
.predict-box {
  background: linear-gradient(135deg, #fff3e0 0%, #fff8ed 100%);
  border: 1px solid #ffd9a8;
  border-radius: 8px;
  padding: 10px 12px;
  margin-top: 10px;
  font-size: 13px;
}
.predict-box .box-title {
  font-size: 12px;
  font-weight: 600;
  color: #ff976a;
  margin-bottom: 6px;
}
.predict-box .row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
}
.predict-box .label {
  color: #646566;
}
.predict-box .val {
  color: #ff7a00;
  font-weight: 600;
}
.predict-box .val.hl {
  color: #ee0a24;
  font-size: 14px;
}
.predict-box .hint {
  font-size: 11px;
  color: #969799;
  margin-top: 4px;
  border-top: 1px dashed #ffd9a8;
  padding-top: 6px;
}
.predict-box .deviation {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed #ffd9a8;
  font-size: 12px;
}
.predict-box .dev-val {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.predict-box .dev-val.一致 {
  color: #07c160;
  background: #e6f9ec;
}
.predict-box .dev-val.偏低 {
  color: #ff976a;
  background: #fff3e0;
}
.predict-box .dev-val.偏高 {
  color: #1989fa;
  background: #eaf5ff;
}
.predict-box .warn {
  color: #ee0a24;
  justify-content: center;
  font-size: 12px;
}
.remark {
  margin-top: 8px;
  font-size: 12px;
  color: #969799;
}
.del-btn {
  height: 100%;
}
.fab {
  position: fixed;
  right: 20px;
  bottom: 80px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #1989fa;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(25, 137, 250, 0.4);
  z-index: 100;
}

.oil-entry {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
}
.oe-left { min-width: 0; }
.oe-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #323233;
}
.oe-icon { color: #ff7a00; }
.oe-fuel { font-size: 11px; font-weight: 400; color: #969799; }
.oe-sub { margin-top: 3px; font-size: 12px; color: #969799; line-height: 1.5; }
.oe-dir { font-weight: 600; }
.oe-next { color: #c8c9cc; margin-left: 4px; }
.oe-arrow { color: #c8c9cc; flex-shrink: 0; margin-left: 8px; }
.is-up { color: #ee0a24; }
.is-down { color: #07c160; }
.is-flat { color: #969799; }

.oil-entry-row {
  display: flex;
  gap: 8px;
  margin: 10px 12px 0;
}
.cal-entry {
  width: 86px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: #1989fa;
}
.ce-icon { font-size: 20px; }
.pcal-popup { padding-bottom: 4px; }
.pcal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 2px;
}
.pcal-title { font-size: 15px; font-weight: 600; color: #323233; }
.pcal-close { color: #969799; cursor: pointer; }
.pcal-sub { padding: 0 16px 6px; font-size: 11px; color: #969799; }
.pcal-loading { color: #1989fa; padding-bottom: 2px; }
.pcal-note { padding: 4px 16px 10px; font-size: 11px; line-height: 1.6; color: #969799; }
</style>

<style>
/* 调价日历：结果着色与内部元素（日历内部不带 scoped 属性，需全局样式；类名已足够特异） */
.van-calendar__day.rcal-up { background: #ffe1df; color: #b4221d; font-weight: 600; border-radius: 8px; }
.van-calendar__day.rcal-down { background: #dff5e8; color: #0a7a43; font-weight: 600; border-radius: 8px; }
.van-calendar__day.rcal-flat { background: #f2f3f5; color: #969799; font-weight: 500; border-radius: 8px; }
.van-calendar__day.rcal-future { background: #e8f3ff; color: #1989fa; font-weight: 600; border-radius: 8px; }
.pcal-popup .van-calendar__top-info,
.pcal-popup .van-calendar__bottom-info { font-size: 9px; line-height: 1.15; }
.rcal-up .van-calendar__top-info, .rcal-up .van-calendar__bottom-info { color: #ee0a24; }
.rcal-down .van-calendar__top-info, .rcal-down .van-calendar__bottom-info { color: #07c160; }
.rcal-flat .van-calendar__bottom-info { color: #969799; }
.rcal-future .van-calendar__top-info, .rcal-future .van-calendar__bottom-info { color: #1989fa; }
</style>