<template>
  <div class="page">
    <div v-if="fullRefuelList.length === 0" class="empty-tip">
      <van-empty description="暂无数据，请先添加加油记录" />
    </div>

    <template v-else>
      <!-- 日期范围筛选条 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <span
            v-for="opt in filterOptions"
            :key="opt.value"
            :class="['filter-tab', { active: filterType === opt.value }]"
            @click="onFilterTab(opt.value)"
          >{{ opt.label }}</span>
        </div>
        <div class="filter-info">
          <span v-if="filterType === 'all'">当前范围：全部数据（{{ filteredRefuelList.length }} 条）</span>
          <span v-else-if="filterType === 'custom' && customStart">
            当前范围：{{ customStart }} ~ {{ customEnd }}（{{ filteredRefuelList.length }} 条）
          </span>
          <span v-else>当前范围：{{ filterOptions.find(o => o.value === filterType)?.label }}（{{ filteredRefuelList.length }} 条）</span>
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

      <!-- 范围内无数据提示 -->
      <div v-if="filteredRefuelList.length === 0" class="empty-tip">
        <van-empty description="所选时间段暂无加油记录" />
      </div>

      <template v-else>
      <!-- 概览统计 -->
      <div class="card stats-overview">
        <div class="stats-grid">
          <div class="stats-item">
            <div class="stat-value">{{ formatFuel(statistics.avgFuelPer100km, fuelUnit) }}</div>
            <div class="stat-label">平均油耗<br>({{ fuelUnit }})</div>
          </div>
          <div class="stats-item">
            <div class="stat-value">{{ formatMoney(statistics.avgCostPerKm) }}</div>
            <div class="stat-label">平均每公里费用<br>(元/km)</div>
          </div>
          <div class="stats-item">
            <div class="stat-value">{{ formatNum(statistics.totalVolume, 1) }}</div>
            <div class="stat-label">{{ volumeLabel }}<br>(L)</div>
          </div>
          <div class="stats-item">
            <div class="stat-value">{{ formatMoney(statistics.totalCost) }}</div>
            <div class="stat-label">{{ costLabel }}<br>(元)</div>
          </div>
          <div class="stats-item">
            <div class="stat-value">{{ formatNum(statistics.totalIntervalMileage, 0) }}</div>
            <div class="stat-label">{{ mileageLabel }}<br>(km)</div>
          </div>
          <div class="stats-item">
            <div class="stat-value">{{ formatMoney(statistics.avgPrice) }}</div>
            <div class="stat-label">平均油价<br>(元/L)</div>
          </div>
        </div>
      </div>

      <!-- 油价对比（实际单价 vs 省最高零售价） -->
      <div v-if="priceStats" class="card price-compare">
        <div class="pcm-head">
          <span class="pcm-title">油价对比</span>
          <span class="pcm-cov">{{ priceStats.count }}/{{ refuelTotalCount }} 次有参考价</span>
        </div>
        <div class="pcm-grid">
          <div class="pcm-item">
            <div class="pcm-num">{{ formatMoney(priceStats.myAvg) }}</div>
            <div class="pcm-label">我的均价<br>(元/L)</div>
          </div>
          <div class="pcm-item">
            <div class="pcm-num blue">{{ formatMoney(priceStats.refAvg) }}</div>
            <div class="pcm-label">省最高零售价<br>(元/L)</div>
          </div>
          <div class="pcm-item">
            <div class="pcm-num" :class="priceStats.totalDiff <= 0 ? 'green' : 'red'">
              {{ priceStats.totalDiff <= 0 ? '省' : '多花' }} {{ formatMoney(Math.abs(priceStats.totalDiff)) }}
            </div>
            <div class="pcm-label">累计差额<br>(元)</div>
          </div>
        </div>
        <div v-if="priceStats.unitDiff !== null" class="pcm-note">
          平均每升{{ priceStats.unitDiff <= 0 ? '低于' : '高于' }}省最高零售价
          {{ formatNum(Math.abs(priceStats.unitDiff), 2) }} 元；只统计有参考价的加油记录。
        </div>
      </div>
      <div v-else-if="refuelTotalCount > 0" class="card chart-card">
        <div class="chart-title">油价对比</div>
        <div class="pcm-empty">
          还没有参考价数据。在设置里选定油价地区后，新增加油记录会自动带出当日参考价。
        </div>
      </div>

      <!-- 油耗趋势图 -->
      <div class="card chart-card">
        <div class="chart-title">油耗趋势</div>
        <div ref="fuelChartEl" class="chart"></div>
      </div>

      <!-- 费用汇总图 -->
      <div class="card chart-card">
        <div class="chart-title">每次加油费用</div>
        <div ref="costChartEl" class="chart"></div>
      </div>

      <!-- 油价变化图 -->
      <div class="card chart-card">
        <div class="chart-title">油价变化趋势</div>
        <div ref="priceChartEl" class="chart"></div>
      </div>

      <!-- 导出按钮 -->
      <div class="export-area">
        <van-button type="primary" block round icon="down" @click="onExportRefuel">
          导出加油记录 Excel（当前范围 {{ filteredRefuelList.length }} 条）
        </van-button>
        <van-button type="success" block round icon="down" class="mt" @click="onExportTrip">
          导出行程快照 Excel（当前范围 {{ filteredTripList.length }} 条）
        </van-button>
      </div>
      </template>
    </template>
  </div>
</template>

<script setup name="Stats">
import { ref, computed, onMounted, onActivated, nextTick, onDeactivated, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { showToast, showSuccessToast } from 'vant'
import { useRefuelStore } from '../../stores/refuel'
import { useTripStore } from '../../stores/trip'
import { useSettingsStore } from '../../stores/settings'
import { calcStatistics } from '../../utils/calc'
import { formatNum, formatMoney, formatDate } from '../../utils/format'
import { formatFuel, convertFuel } from '../../utils/units'
import { exportRefuelExcel, exportTripExcel } from '../../utils/export'
import { useListFilter } from '../../composables/useListFilter'
import { utcMonthsAgoRange } from '../../utils/date'
import { weightedAveragePrice } from '../../utils/oilPrice'

// 按需注册 ECharts 模块（替代全量引入，显著减小包体）
echarts.use([LineChart, BarChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

const refuelStore = useRefuelStore()
const tripStore = useTripStore()
const settingsStore = useSettingsStore()

// 当前油耗显示单位（来自设置，使"油耗单位"设置生效）
const fuelUnit = computed(() => settingsStore.settings.unit)

// 全量数据
const fullRefuelList = computed(() => refuelStore.listWithComparison)
const fullTripList = computed(() => tripStore.records)

// 筛选器（默认"全部"，仅用筛选不用分页）
const {
  filterType, customStart, customEnd,
  filteredList: filteredRefuelList,
  setFilter: setRefuelFilter
} = useListFilter(() => fullRefuelList.value, { defaultPageSize: 999999 })

// 初始化为"全部"
setRefuelFilter('all')

// 行程列表按相同条件过滤
const filteredTripList = computed(() => {
  const all = fullTripList.value
  if (all.length === 0) return []
  switch (filterType.value) {
    case 'all':
      return all
    case 'month1': {
      const { start, end } = utcMonthsAgoRange(1)
      return all.filter(r => {
        const t = new Date(r.time)
        return t >= start && t < end
      })
    }
    case 'month3': {
      const { start, end } = utcMonthsAgoRange(3)
      return all.filter(r => {
        const t = new Date(r.time)
        return t >= start && t < end
      })
    }
    case 'custom': {
      if (!customStart.value || !customEnd.value) return all
      const s = new Date(customStart.value); s.setHours(0, 0, 0, 0)
      const e = new Date(customEnd.value); e.setHours(23, 59, 59, 999)
      return all.filter(r => {
        const t = new Date(r.time)
        return t >= s && t <= e
      })
    }
    default:
      return all
  }
})

// 基于筛选后列表重新计算统计
const statistics = computed(() => calcStatistics(filteredRefuelList.value))

// "累计/区间"字样动态调整
const isAllRange = computed(() => filterType.value === 'all')
const volumeLabel = computed(() => isAllRange.value ? '累计加油量' : '区间加油量')
const costLabel = computed(() => isAllRange.value ? '累计费用' : '区间费用')
const mileageLabel = computed(() => isAllRange.value ? '累计行驶里程' : '区间行驶里程')

// 筛选选项
const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'month1', label: '最近一月' },
  { value: 'month3', label: '最近三月' },
  { value: 'custom', label: '自定义' }
]

// 自定义日历
const showCalendar = ref(false)
const minCalendarDate = computed(() => {
  const all = refuelStore.records
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
  setRefuelFilter(type)
}

function onCalendarConfirm(dates) {
  if (!dates || dates.length !== 2 || !dates[0] || !dates[1]) {
    showCalendar.value = false
    return
  }
  const [s, e] = dates
  const pad = n => String(n).padStart(2, '0')
  const startStr = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
  const endStr = `${e.getFullYear()}-${pad(e.getMonth() + 1)}-${pad(e.getDate())}`
  setRefuelFilter('custom', { start: startStr, end: endStr })
  showCalendar.value = false
}

const fuelChartEl = ref(null)
const costChartEl = ref(null)
const priceChartEl = ref(null)
let fuelChart = null
let costChart = null
let priceChart = null

// 正序数据用于绘图（基于筛选后列表）
const chartData = computed(() => {
  const sorted = [...filteredRefuelList.value].sort((a, b) => new Date(a.time) - new Date(b.time))
  // 根据范围动态调整 X 轴格式
  const span = sorted.length > 0
    ? (new Date(sorted[sorted.length - 1].time) - new Date(sorted[0].time))
    : 0
  // 超过 90 天用 YYYY-MM，否则用 MM-DD HH:mm
  const longFormat = span > 90 * 24 * 3600 * 1000
  return {
    dates: sorted.map(r => formatDate(r.time, longFormat ? 'YYYY-MM' : 'MM-DD HH:mm')),
    fuels: sorted.map(r => {
      if (!(r.comparison && r.comparison.calculable)) return null
      const c = convertFuel(r.comparison.fuelPer100km, fuelUnit.value)
      return c == null ? null : +c.toFixed(4)
    }),
    costs: sorted.map(r => +Number(r.cost || 0).toFixed(2)),
    prices: sorted.map(r => +Number(r.price || 0).toFixed(2)),
    // 省最高零售价参考值（没有则为 null，曲线断开而不是补 0）
    refPrices: sorted.map(r => (Number(r.priceRef) > 0 ? +Number(r.priceRef).toFixed(2) : null))
  }
})

/* ---------- 油价对比（实际单价 vs 省最高零售价） ---------- */
const refuelTotalCount = computed(() => filteredRefuelList.value.length)

const priceStats = computed(() => {
  const rows = filteredRefuelList.value.filter(
    r => Number(r.priceRef) > 0 && Number(r.price) > 0 && Number(r.volume) > 0
  )
  if (rows.length === 0) return null
  const myAvg = weightedAveragePrice(rows.map(r => ({ price: r.price, volume: r.volume })))
  const refAvg = weightedAveragePrice(rows.map(r => ({ price: r.priceRef, volume: r.volume })))
  let totalDiff = 0
  for (const r of rows) {
    totalDiff += (Number(r.price) - Number(r.priceRef)) * Number(r.volume)
  }
  return {
    count: rows.length,
    myAvg,
    refAvg,
    unitDiff: (myAvg === null || refAvg === null) ? null : myAvg - refAvg,
    totalDiff
  }
})

function renderFuelChart() {
  if (!fuelChartEl.value) return
  if (!fuelChart) fuelChart = echarts.init(fuelChartEl.value)
  fuelChart.setOption({
    tooltip: { trigger: 'axis', formatter: '{b}<br/>{a}: {c} ' + fuelUnit.value },
    grid: { left: 40, right: 15, top: 20, bottom: 35 },
    xAxis: {
      type: 'category',
      data: chartData.value.dates,
      axisLabel: { fontSize: 10, rotate: 30 }
    },
    yAxis: {
      type: 'value',
      name: fuelUnit.value,
      axisLabel: { fontSize: 10 }
    },
    series: [{
      name: '百公里油耗',
      type: 'line',
      smooth: true,
      data: chartData.value.fuels,
      itemStyle: { color: '#1989fa' },
      areaStyle: { color: 'rgba(25,137,250,0.15)' },
      connectNulls: true
    }]
  })
}

function renderCostChart() {
  if (!costChartEl.value) return
  if (!costChart) costChart = echarts.init(costChartEl.value)
  costChart.setOption({
    tooltip: { trigger: 'axis', formatter: '{b}<br/>{a}: {c} 元' },
    grid: { left: 45, right: 15, top: 20, bottom: 35 },
    xAxis: {
      type: 'category',
      data: chartData.value.dates,
      axisLabel: { fontSize: 10, rotate: 30 }
    },
    yAxis: {
      type: 'value',
      name: '元',
      axisLabel: { fontSize: 10 }
    },
    series: [{
      name: '费用',
      type: 'bar',
      data: chartData.value.costs,
      itemStyle: { color: '#07c160' }
    }]
  })
}

function renderPriceChart() {
  if (!priceChartEl.value) return
  if (!priceChart) priceChart = echarts.init(priceChartEl.value)
  priceChart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: params => {
        const head = params[0] ? params[0].axisValue : ''
        const lines = params.map(p => {
          const v = (p.value === null || p.value === undefined) ? '—' : `${p.value} 元/L`
          return `${p.marker}${p.seriesName}: ${v}`
        })
        return [head, ...lines].join('<br/>')
      }
    },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 10 } },
    grid: { left: 40, right: 15, top: 34, bottom: 35 },
    xAxis: {
      type: 'category',
      data: chartData.value.dates,
      axisLabel: { fontSize: 10, rotate: 30 }
    },
    yAxis: {
      type: 'value',
      name: '元/L',
      scale: true, // 不从 0 起，否则价格差异会被压平
      axisLabel: { fontSize: 10 }
    },
    series: [
      {
        name: '实际单价',
        type: 'line',
        smooth: true,
        data: chartData.value.prices,
        itemStyle: { color: '#ff976a' }
      },
      {
        name: '省最高零售价',
        type: 'line',
        smooth: true,
        data: chartData.value.refPrices,
        itemStyle: { color: '#1989fa' },
        lineStyle: { type: 'dashed' },
        connectNulls: false
      }
    ]
  })
}

function renderAll() {
  nextTick(() => {
    renderFuelChart()
    renderCostChart()
    renderPriceChart()
  })
}

function resizeAll() {
  fuelChart && fuelChart.resize()
  costChart && costChart.resize()
  priceChart && priceChart.resize()
}

onMounted(renderAll)
onActivated(renderAll)
onDeactivated(() => {
  // 切换页面时释放，下次再渲染
})
// 监听筛选变化重新渲染图表
watch([filterType, customStart, customEnd, () => filteredRefuelList.value.length], renderAll)

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeAll)
}

// 导出按当前筛选范围
function onExportRefuel() {
  if (filteredRefuelList.value.length === 0) {
    showToast('当前范围内暂无加油记录')
    return
  }
  const name = exportRefuelExcel(filteredRefuelList.value)
  showSuccessToast(`已导出：${name}`)
}

function onExportTrip() {
  if (filteredTripList.value.length === 0) {
    showToast('当前范围内暂无行程记录')
    return
  }
  const name = exportTripExcel(filteredTripList.value)
  showSuccessToast(`已导出：${name}`)
}
</script>

<style scoped>
.stats-overview { background: #fff; }
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
  padding: 4px 12px;
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
}
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px 8px;
}
.stats-item { text-align: center; }

.chart-card { padding: 12px; }
/* 油价对比 */
.price-compare { padding-bottom: 12px; }
.pcm-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.pcm-title { font-size: 14px; font-weight: 600; color: #323233; }
.pcm-cov { font-size: 11px; color: #969799; }
.pcm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.pcm-item { text-align: center; }
.pcm-num { font-size: 18px; font-weight: 600; color: #323233; }
.pcm-num.blue { color: #1989fa; }
.pcm-num.green { color: #07c160; }
.pcm-num.red { color: #ee0a24; }
.pcm-label { margin-top: 3px; font-size: 11px; line-height: 1.4; color: #969799; }
.pcm-note { margin-top: 10px; font-size: 11px; line-height: 1.5; color: #969799; }
.pcm-empty { padding: 10px 2px; font-size: 12px; line-height: 1.6; color: #969799; }

.chart-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #323233;
}
.chart { width: 100%; height: 220px; }

.export-area { padding: 16px; }
.export-area .mt { margin-top: 10px; }
</style>
