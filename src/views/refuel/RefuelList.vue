<template>
  <div class="page">
    <van-nav-bar title="加油记录" />

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
          <div class="stat-value sm">{{ formatNum(statistics.avgFuelPer100km, 2) }}<span class="unit">L/100km</span></div>
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
                平均油耗 {{ formatNum(getPrediction(item).avgFuel, 2) }} L/100km，
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
              <span class="val">{{ formatNum(item.comparison.fuelPer100km, 2) }} L/100km</span>
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
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useRefuelStore } from '../../stores/refuel'
import { useSettingsStore } from '../../stores/settings'
import { formatDate, formatNum, formatMoney } from '../../utils/format'
import { predictRefuelRange } from '../../utils/calc'
import { useListFilter } from '../../composables/useListFilter'

const router = useRouter()
const store = useRefuelStore()
const settingsStore = useSettingsStore()

// 全量列表（带对比计算，按时间倒序）
const fullList = computed(() => store.listWithComparison)
const statistics = computed(() => store.statistics)

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
const emptyHint = computed(() => {
  if (fullList.value.length === 0) return '暂无加油记录，点击右下角添加'
  return '所选范围内暂无加油记录'
})

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
</style>
