<template>
  <div class="page page-without-tabbar">
    <van-nav-bar
      :title="isEdit ? '编辑行程快照' : '新增行程快照'"
      left-text="返回"
      left-arrow
      @click-left="onBack"
    >
      <template #right>
        <van-button type="primary" size="small" @click="onSave">保存</van-button>
      </template>
    </van-nav-bar>

    <van-form class="form">
      <van-cell-group inset title="时间">
        <van-field label="记录时间" input-align="right">
          <template #input>
            <input
              type="datetime-local"
              v-model="timeLocal"
              class="native-datetime"
              @change="onTimeChange"
            />
          </template>
        </van-field>
      </van-cell-group>

      <!-- 匹配到的最近记录（时间输入后立即显示） -->
      <div class="matched-box" v-if="!isEdit && matchedRecord">
        <div class="matched-title">
          <van-icon name="link-o" /> 匹配到的最近记录
        </div>
        <div class="matched-row">
          <span class="m-label">类型</span>
          <span class="m-val">{{ matchedRecord._type === 'refuel' ? '加油记录' : '行程快照' }}</span>
        </div>
        <div class="matched-row">
          <span class="m-label">时间</span>
          <span class="m-val">{{ formatDate(matchedRecord.time) }}</span>
        </div>
        <div class="matched-row">
          <span class="m-label">总里程</span>
          <span class="m-val">{{ formatNum(matchedRecord.totalMileage, 1) }} km</span>
        </div>
      </div>
      <div class="matched-box empty" v-else-if="!isEdit && hasSearched && !matchedRecord">
        <van-icon name="warning-o" />
        <span>未找到比当前记录时间更早的记录，请检查记录时间</span>
      </div>

      <van-cell-group inset title="里程数据">
        <van-field
          v-model.number="form.totalMileage"
          label="总行驶里程"
          type="number"
          placeholder="停车时仪表盘读数"
          input-align="right"
        >
          <template #button>km</template>
        </van-field>
        <van-field
          v-model.number="form.tripMileage"
          label="本次行驶里程"
          type="number"
          :placeholder="tripMileagePlaceholder"
          input-align="right"
          @focus="onTripMileageFocus"
        >
          <template #button>
            <span class="auto-tag" v-if="autoFilled">自动</span>
            km
          </template>
        </van-field>
        <van-field
          v-model.number="form.estimatedRange"
          label="估计可行驶里程"
          type="number"
          placeholder="油表显示可行驶里程"
          input-align="right"
        >
          <template #button>km</template>
        </van-field>
        <van-field label="估计总行驶里程" input-align="right" readonly>
          <template #input>
            <span class="auto-val">{{ formatNum(estimatedTotal, 1) }} km</span>
          </template>
        </van-field>
      </van-cell-group>

      <!-- 自动计算结果提示 -->
      <div class="auto-result" v-if="!isEdit && autoFilled && matchedRecord">
        <van-icon name="success" />
        <span>
          本次行驶里程 = {{ formatNum(form.totalMileage, 1) }} − {{ formatNum(matchedRecord.totalMileage, 1) }}
          = <b>{{ formatNum(form.tripMileage, 1) }} km</b>
        </span>
      </div>
      <div class="auto-result warn" v-else-if="!isEdit && form.totalMileage > 0 && matchedRecord && !autoFilled && !tripMileageManual">
        <van-icon name="warning-o" />
        <span>{{ calcFailReason }}</span>
      </div>
      <div class="auto-result manual" v-else-if="!isEdit && tripMileageManual">
        <van-icon name="edit" />
        <span>已切换为手动输入模式</span>
      </div>

      <van-cell-group inset title="其他">
        <van-field
          v-model="form.remark"
          label="备注"
          type="textarea"
          placeholder="可填写备注信息"
          rows="2"
          autosize
        />
      </van-cell-group>

      <!-- 低油量预警预览 -->
      <div class="card warning-preview" v-if="previewWarning && previewWarning.length > 0">
        <div class="warning-preview-title">
          <van-icon name="warning-o" /> 低油量预警预览
        </div>
        <div class="warning-item" v-for="(w, i) in previewWarning" :key="i">{{ w }}</div>
      </div>

      <!-- 最近加油记录参考（页面最下方） -->
      <div class="refuel-ref-box" v-if="latestRefuel">
        <div class="refuel-ref-title">
          <van-icon name="gas-station-o" /> 最近加油记录参考
        </div>
        <div class="refuel-ref-row">
          <span class="rr-label">加油时间</span>
          <span class="rr-val">{{ formatDate(latestRefuel.time) }}</span>
        </div>
        <div class="refuel-ref-row">
          <span class="rr-label">加油量 / 费用</span>
          <span class="rr-val">{{ formatNum(latestRefuel.volume, 2) }} L / {{ formatMoney(latestRefuel.cost) }} 元</span>
        </div>
        <div class="refuel-ref-row">
          <span class="rr-label">加油时总里程</span>
          <span class="rr-val">{{ formatNum(latestRefuel.totalMileage, 1) }} km</span>
        </div>
        <div class="refuel-ref-row" v-if="refuelPrediction && refuelPrediction.calculable">
          <span class="rr-label">智能预测总里程</span>
          <span class="rr-val hl-blue">{{ formatNum(refuelPrediction.predictedTotalMileage, 0) }} km</span>
        </div>
        <div class="refuel-ref-row" v-else-if="latestRefuel.estimatedRange > 0">
          <span class="rr-label">加油时预计总里程</span>
          <span class="rr-val">{{ formatNum(Number(latestRefuel.totalMileage || 0) + Number(latestRefuel.estimatedRange || 0), 0) }} km</span>
        </div>
        <div class="refuel-ref-row" v-if="mileageSinceRefuel !== null">
          <span class="rr-label">加油后已行驶</span>
          <span :class="['rr-val', mileageSinceRefuel < 0 ? 'hl-red' : 'hl-green']">
            {{ formatNum(mileageSinceRefuel, 1) }} km
          </span>
        </div>
      </div>
      <div class="refuel-ref-box empty" v-else>
        <van-icon name="info-o" />
        <span>暂无更早的加油记录，无法参考油量状况</span>
      </div>

      <!-- 删除按钮（仅编辑模式显示） -->
      <div class="delete-zone" v-if="isEdit">
        <van-button block type="danger" plain icon="delete-o" @click="onDelete">
          删除该行程记录
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { useTripStore } from '../../stores/trip'
import { useRefuelStore } from '../../stores/refuel'
import { useSettingsStore } from '../../stores/settings'
import { createTripRecord } from '../../api/models'
import { checkLowFuelWarning, predictRefuelRange } from '../../utils/calc'
import { formatDate, formatNum, formatMoney } from '../../utils/format'

const route = useRoute()
const router = useRouter()
const store = useTripStore()
const refuelStore = useRefuelStore()
const settingsStore = useSettingsStore()

const isEdit = computed(() => !!route.params.id)
const form = reactive({ ...createTripRecord() })

const timeLocal = ref('')
const editingId = ref(null)

// 用户是否手动修改过"本次行驶里程"（用户聚焦输入框即视为手动模式）
const tripMileageManual = ref(false)
// 当前自动填充值是否生效（用于显示"自动"标签）
const autoFilled = ref(false)
// 是否已执行过匹配搜索（用于区分"未搜索"和"搜索无结果"）
const hasSearched = ref(false)

const estimatedTotal = computed(() =>
  Number(form.totalMileage || 0) + Number(form.estimatedRange || 0)
)

// 本次行驶里程字段的占位提示
const tripMileagePlaceholder = computed(() => {
  if (isEdit.value) return '本次行程里程'
  if (tripMileageManual.value) return '手动输入本次行程里程'
  return '输入总里程后自动计算，可手动修改'
})

/**
 * 匹配到的最近记录（响应式 computed）
 * 综合加油记录与行程快照，找出时间早于 form.time 的最近一条
 */
const matchedRecord = computed(() => {
  const curTime = new Date(form.time).getTime()
  if (isNaN(curTime)) return null

  const refuels = refuelStore.records.map(r => ({ ...r, _type: 'refuel' }))
  const trips = store.records
    .filter(r => r.id !== editingId.value)
    .map(r => ({ ...r, _type: 'trip' }))

  const all = [...refuels, ...trips]
    .filter(r => new Date(r.time).getTime() < curTime)
    .sort((a, b) => new Date(b.time) - new Date(a.time))

  return all[0] || null
})

// 计算失败的原因提示
const calcFailReason = computed(() => {
  if (!matchedRecord.value) return ''
  const curTotal = Number(form.totalMileage)
  const prevTotal = Number(matchedRecord.value.totalMileage || 0)
  const diff = curTotal - prevTotal
  if (diff <= 0) {
    return `当前总里程(${formatNum(curTotal, 1)}) ≤ 匹配记录总里程(${formatNum(prevTotal, 1)})，差值无效`
  }
  return ''
})

// 低油量预警预览
const previewWarning = computed(() => {
  if (!(form.totalMileage >= 0) || !(form.estimatedRange >= 0)) return []
  return checkLowFuelWarning(form, refuelStore.records, {
    tankCapacity: settingsStore.settings.tankCapacity
  }).warnings
})

/**
 * 最近加油记录（时间早于当前 form.time 的最近一条加油记录）
 * 编辑模式、新增模式均显示，便于用户参考油量状况
 */
const latestRefuel = computed(() => {
  const curTime = new Date(form.time).getTime()
  if (isNaN(curTime)) return null
  const earlier = refuelStore.records
    .filter(r => new Date(r.time).getTime() < curTime)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
  return earlier[0] || null
})

// 最近加油记录的智能预测信息
const refuelPrediction = computed(() => {
  if (!latestRefuel.value) return null
  return predictRefuelRange(latestRefuel.value, refuelStore.records, {
    tankCapacity: settingsStore.settings.tankCapacity
  })
})

// 加油后已行驶 = 当前输入总里程 - 加油时总里程
const mileageSinceRefuel = computed(() => {
  if (!latestRefuel.value) return null
  const curTotal = Number(form.totalMileage)
  if (!(curTotal > 0)) return null
  const refuelTotal = Number(latestRefuel.value.totalMileage || 0)
  return curTotal - refuelTotal
})

/**
 * 自动计算本次行驶里程（核心逻辑）
 * 当用户未手动修改、且有匹配记录、且总里程有效时，自动填入
 * 总里程清空(0或空)时，联动清空本次行驶里程（仅自动模式下）
 */
function tryAutoCalc() {
  if (isEdit.value) return
  // 用户已手动修改，不再自动覆盖
  if (tripMileageManual.value) return

  const curTotal = Number(form.totalMileage)

  // 总里程为空或0时，联动清空本次行驶里程
  if (!(curTotal > 0)) {
    form.tripMileage = 0
    autoFilled.value = false
    return
  }

  const latest = matchedRecord.value
  if (!latest) {
    autoFilled.value = false
    return
  }

  const prevTotal = Number(latest.totalMileage || 0)
  const diff = curTotal - prevTotal

  if (diff > 0) {
    // 直接赋值，无需 isAutoFilling 标志（已用 @focus 检测手动模式）
    form.tripMileage = +diff.toFixed(1)
    autoFilled.value = true
  } else {
    autoFilled.value = false
  }
}

/**
 * 用户聚焦"本次行驶里程"输入框，切换为手动模式
 * 这样程序自动赋值（不会触发 focus）与用户手动输入（触发 focus）被彻底区分
 */
function onTripMileageFocus() {
  if (isEdit.value) return
  if (autoFilled.value) {
    // 自动填入后，用户点击修改，切换为手动模式
    tripMileageManual.value = true
    autoFilled.value = false
  }
}

// 监听总里程变化，触发自动计算
watch(() => form.totalMileage, tryAutoCalc)

// 监听匹配记录变化（时间变化或数据变化时），触发自动计算
watch(matchedRecord, () => {
  hasSearched.value = true
  tryAutoCalc()
})

onMounted(() => {
  if (route.params.id) {
    const rec = store.getById(route.params.id)
    if (rec) {
      Object.assign(form, rec)
      editingId.value = rec.id
    }
  }
  syncTimeLocal()
  hasSearched.value = true
  // 初始计算一次
  if (!isEdit.value) {
    tryAutoCalc()
  }
})

// ISO 时间 → datetime-local 字符串
function isoToLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function syncTimeLocal() {
  timeLocal.value = isoToLocal(form.time)
}

function onTimeChange() {
  if (!timeLocal.value) return
  const d = new Date(timeLocal.value)
  if (!isNaN(d.getTime())) {
    form.time = d.toISOString()
    // matchedRecord 是 computed，会自动响应 form.time 变化，无需手动调用
  }
}

function onSave() {
  const data = {
    time: form.time,
    totalMileage: Number(form.totalMileage),
    tripMileage: Number(form.tripMileage),
    estimatedRange: Number(form.estimatedRange),
    remark: form.remark || ''
  }
  const res = isEdit.value
    ? store.update(editingId.value, data)
    : store.add(data)
  if (res.success) {
    showSuccessToast(isEdit.value ? '已更新' : '已添加')
    router.back()
  } else {
    showToast(res.error || '保存失败')
  }
}

function onBack() {
  router.back()
}

function onDelete() {
  showConfirmDialog({
    title: '确认删除',
    message: '确定删除该行程记录吗？此操作不可恢复。'
  }).then(() => {
    store.remove(editingId.value)
    showSuccessToast('已删除')
    router.back()
  }).catch(() => {})
}
</script>

<style scoped>
.delete-zone {
  margin: 16px 12px 24px;
}
.form { padding: 10px 0; }
.auto-val { color: #07c160; font-weight: 600; }
.auto-tag {
  display: inline-block;
  background: #1989fa;
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 4px;
  font-weight: 500;
}
/* 匹配记录显示框 */
.matched-box {
  margin: 10px 12px 0;
  padding: 10px 12px;
  background: #f0f9ff;
  border: 1px solid #bae0ff;
  border-radius: 8px;
  font-size: 12px;
}
.matched-box.empty {
  background: #fff7e6;
  border-color: #ffd591;
  color: #fa8c16;
  display: flex;
  align-items: center;
  gap: 6px;
}
.matched-title {
  font-size: 12px;
  font-weight: 600;
  color: #1989fa;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.matched-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
.matched-row .m-label { color: #646566; }
.matched-row .m-val { color: #323233; font-weight: 500; }
/* 自动计算结果提示 */
.auto-result {
  margin: 8px 12px;
  padding: 8px 10px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 6px;
  font-size: 12px;
  color: #52c41a;
  display: flex;
  align-items: center;
  gap: 6px;
}
.auto-result b { color: #389e0d; }
.auto-result.warn {
  background: #fff7e6;
  border-color: #ffd591;
  color: #fa8c16;
}
.auto-result.manual {
  background: #f5f5f5;
  border-color: #d9d9d9;
  color: #8c8c8c;
}
.native-datetime {
  border: none;
  text-align: right;
  font-size: 14px;
  color: #323233;
  background: transparent;
  outline: none;
  width: 100%;
  font-family: inherit;
}
.warning-preview {
  margin: 12px;
  background: #fff1f0;
  border: 1px solid #ffccc7;
}
.warning-preview-title {
  color: #ee0a24;
  font-weight: 600;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.warning-preview .warning-item {
  color: #ee0a24;
  padding: 2px 0;
  padding-left: 4px;
  font-size: 13px;
}
/* 最近加油记录参考框（淡黄色，区别于蓝色匹配记录框） */
.refuel-ref-box {
  margin: 12px 12px 0;
  padding: 10px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 8px;
  font-size: 12px;
}
.refuel-ref-box.empty {
  background: #fafafa;
  border-color: #ebedf0;
  color: #969799;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}
.refuel-ref-title {
  font-size: 12px;
  font-weight: 600;
  color: #fa8c16;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.refuel-ref-row {
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
}
.refuel-ref-row + .refuel-ref-row {
  border-top: 1px dashed #ffe58f;
  margin-top: 2px;
  padding-top: 5px;
}
.refuel-ref-row .rr-label {
  color: #646566;
}
.refuel-ref-row .rr-val {
  color: #323233;
  font-weight: 500;
}
.refuel-ref-row .rr-val.hl-blue {
  color: #1989fa;
  font-weight: 600;
}
.refuel-ref-row .rr-val.hl-green {
  color: #07c160;
  font-weight: 600;
}
.refuel-ref-row .rr-val.hl-red {
  color: #ee0a24;
  font-weight: 600;
}
</style>
