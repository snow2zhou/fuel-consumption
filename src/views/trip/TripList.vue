<template>
  <div class="page">
    <van-nav-bar title="行程快照" />

    <!-- 全局低油量预警横幅 -->
    <div class="global-warning" v-if="hasAnyWarning">
      <van-icon name="warning-o" />
      <span>最新行程显示油量不足，请尽快加油！</span>
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

    <div v-if="list.length === 0" class="empty-tip">
      <van-empty :description="emptyHint" />
    </div>

    <van-swipe-cell v-for="item in list" :key="item.id">
      <div class="card record-card" :class="{ 'warning-border': getWarnings(item).length > 0 }" @click="onEdit(item)">
        <div class="card-header">
          <span class="item-title">{{ formatDate(item.time) }}</span>
          <span class="pulse-tag" v-if="getWarnings(item).length > 0">
            <span class="dot"></span>需加油
          </span>
        </div>
        <div class="info-grid">
          <div><span class="lbl">本次行驶</span><span class="val">{{ formatNum(item.tripMileage, 1) }} km</span></div>
          <div><span class="lbl">估计可行驶</span><span class="val">{{ formatNum(item.estimatedRange, 0) }} km</span></div>
        </div>

        <!-- 里程总览（核心判断依据集中显示） -->
        <div class="mileage-overview">
          <div class="mo-row">
            <span class="mo-label">当前总里程</span>
            <span class="mo-val mo-current">{{ formatNum(item.totalMileage, 1) }} km</span>
          </div>
          <div class="mo-row">
            <span class="mo-label">估计总里程</span>
            <span class="mo-val mo-estimate">{{ formatNum(estimatedTotal(item), 1) }} km</span>
          </div>
          <template v-if="getWarningInfo(item).latestRefuel">
            <div class="mo-row" v-if="getWarningInfo(item).refuelPrediction && getWarningInfo(item).refuelPrediction.calculable">
              <span class="mo-label">加油预测总里程</span>
              <span class="mo-val mo-predict">{{ formatNum(getWarningInfo(item).refuelPrediction.predictedTotalMileage, 1) }} km</span>
            </div>
            <div class="mo-row" v-else>
              <span class="mo-label">加油时预计总里程</span>
              <span class="mo-val mo-predict">{{ formatNum(getWarningInfo(item).refuelEstTotal, 1) }} km</span>
            </div>
            <div class="mo-row" v-if="getWarningInfo(item).remaining !== null">
              <span class="mo-label">距预测极限剩余</span>
              <span :class="['mo-val', getWarningInfo(item).remaining < 50 ? 'mo-warn' : 'mo-ok']">
                {{ formatNum(getWarningInfo(item).remaining, 1) }} km
              </span>
            </div>
          </template>
        </div>

        <!-- 最近加油记录的基本信息（仅显示加油时间，里程类已并入里程总览） -->
        <div class="refuel-info-box" v-if="getWarningInfo(item).latestRefuel">
          <div class="refuel-info-title">
            <van-icon name="gas-station-o" /> 最近加油记录
          </div>
          <div class="refuel-info-row">
            <span class="r-label">加油时间</span>
            <span class="r-val">{{ formatDate(getWarningInfo(item).latestRefuel.time) }}</span>
          </div>
        </div>

        <!-- 低油量预警 -->
        <div class="warning-box" v-if="getWarnings(item).length > 0">
          <div class="warning-title">
            <van-icon name="warning-o" /> 低油量预警
          </div>
          <div class="warning-item" v-for="(w, i) in getWarnings(item)" :key="i">{{ w }}</div>
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

    <div class="fab" @click="onAdd">
      <van-icon name="plus" size="24" color="#fff" />
    </div>
  </div>
</template>

<script setup name="TripList">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useTripStore } from '../../stores/trip'
import { useRefuelStore } from '../../stores/refuel'
import { useSettingsStore } from '../../stores/settings'
import { checkLowFuelWarning } from '../../utils/calc'
import { formatDate, formatNum } from '../../utils/format'
import { useListFilter } from '../../composables/useListFilter'

const router = useRouter()
const store = useTripStore()
const refuelStore = useRefuelStore()
const settingsStore = useSettingsStore()

// 全量列表（按时间倒序）
const fullList = computed(() => store.records)
const allRefuels = computed(() => refuelStore.records)

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
  if (fullList.value.length === 0) return '暂无行程快照，点击右下角添加'
  return '所选范围内暂无行程记录'
})

function estimatedTotal(item) {
  return Number(item.totalMileage || 0) + Number(item.estimatedRange || 0)
}

// 预警缓存（仅对可见列表计算，基于全量加油记录，避免分页后失真）
const warningCache = computed(() => {
  const cache = {}
  const tankCapacity = settingsStore.settings.tankCapacity
  for (const item of list.value) {
    cache[item.id] = checkLowFuelWarning(item, allRefuels.value, { tankCapacity })
  }
  return cache
})

// 最新一条行程是否有预警（用于顶部横幅，基于全量最新行程）
const hasAnyWarning = computed(() => {
  if (fullList.value.length === 0) return false
  const latest = fullList.value[0]
  const info = warningCache.value[latest.id]
  if (info) return info.warnings.length > 0
  // 若最新行程不在当前可见列表中，临时计算
  const tankCapacity = settingsStore.settings.tankCapacity
  const tempInfo = checkLowFuelWarning(latest, allRefuels.value, { tankCapacity })
  return tempInfo.warnings.length > 0
})

function getWarningInfo(item) {
  return warningCache.value[item.id] || { warnings: [], latestRefuel: null }
}

function getWarnings(item) {
  return getWarningInfo(item).warnings
}

function onAdd() {
  router.push('/trip/edit')
}

function onEdit(item) {
  router.push(`/trip/edit/${item.id}`)
}

function onDelete(item) {
  showConfirmDialog({
    title: '确认删除',
    message: '确定删除该行程快照吗？'
  }).then(() => {
    store.remove(item.id)
    showToast('已删除')
  }).catch(() => {})
}
</script>

<style scoped>
.global-warning {
  margin: 10px 12px 0;
  padding: 10px 14px;
  background: linear-gradient(135deg, #fff1f0 0%, #ffe1e0 100%);
  border: 1px solid #ffccc7;
  border-radius: 8px;
  color: #ee0a24;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  animation: banner-pulse 2s ease-in-out infinite;
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
  background: #07c160;
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
  color: #07c160;
  margin-left: 4px;
}
/* 加载更多 */
.load-more {
  margin: 12px;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  color: #07c160;
  background: #fff;
  border: 1px dashed #07c160;
  border-radius: 8px;
  cursor: pointer;
}
.load-more.no-more {
  color: #969799;
  border-color: #ebedf0;
  cursor: default;
}
@keyframes banner-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(238, 10, 36, 0.3); }
  50% { box-shadow: 0 0 8px 2px rgba(238, 10, 36, 0.15); }
}
.record-card { margin-bottom: 0; }
.record-card.warning-border {
  border: 1px solid #ffccc7;
  box-shadow: 0 1px 6px rgba(238, 10, 36, 0.1);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.pulse-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #ee0a24;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}
.pulse-tag .dot {
  width: 6px;
  height: 6px;
  background: #fff;
  border-radius: 50%;
  animation: dot-pulse 1.2s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.4); }
}
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  font-size: 13px;
}
.info-grid .lbl { color: #969799; margin-right: 6px; }
.info-grid .val { color: #323233; font-weight: 500; }
.info-grid .hl { color: #07c160; }
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
.mileage-overview .mo-current { color: #323233; }
.mileage-overview .mo-estimate { color: #07c160; }
.mileage-overview .mo-predict { color: #1989fa; }
.mileage-overview .mo-ok { color: #07c160; }
.mileage-overview .mo-warn { color: #ee0a24; }
.warning-box {
  margin-top: 10px;
  padding: 10px 12px;
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 8px;
  font-size: 13px;
}
/* 最近加油记录预测信息 */
.refuel-info-box {
  margin-top: 10px;
  padding: 10px 12px;
  background: #f0f9ff;
  border: 1px solid #bae0ff;
  border-radius: 8px;
  font-size: 12px;
}
.refuel-info-title {
  color: #1989fa;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.refuel-info-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.refuel-info-row .r-label { color: #646566; }
.refuel-info-row .r-val { color: #323233; font-weight: 500; }
.refuel-info-row .r-val.hl-blue { color: #1989fa; font-weight: 600; }
.refuel-info-row .r-val.hl-green { color: #07c160; font-weight: 600; }
.refuel-info-row .r-val.hl-red { color: #ee0a24; font-weight: 600; }
.warning-title {
  color: #ee0a24;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.warning-item {
  color: #ee0a24;
  padding: 2px 0;
  padding-left: 4px;
}
.warning-ref {
  font-size: 11px;
  color: #969799;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed #ffccc7;
}
.remark { margin-top: 8px; font-size: 12px; color: #969799; }
.del-btn { height: 100%; }
.fab {
  position: fixed; right: 20px; bottom: 80px;
  width: 52px; height: 52px; border-radius: 50%;
  background: #07c160;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.4);
  z-index: 100;
}
</style>
