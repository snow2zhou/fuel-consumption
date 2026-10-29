<template>
  <div class="page page-without-tabbar">
    <van-nav-bar
      :title="isEdit ? '编辑加油记录' : '新增加油记录'"
      left-text="返回"
      left-arrow
      @click-left="onBack"
    >
      <template #right>
        <van-button type="primary" size="small" @click="onSave">保存</van-button>
      </template>
    </van-nav-bar>

    <van-form class="form">
      <van-cell-group inset title="基础信息">
        <van-field label="加油时间" input-align="right" :rules="[{ required: true, message: '请选择加油时间' }]">
          <template #input>
            <input
              type="datetime-local"
              v-model="timeLocal"
              class="native-datetime"
              @change="onTimeChange"
            />
          </template>
        </van-field>
        <van-field label="油号" is-link input-align="right" readonly @click="showFuelPicker = true">
          <template #input>
            <span>{{ form.fuelType }}</span>
          </template>
        </van-field>
        <van-field label="关联发票" is-link input-align="right" readonly @click="showInvoicePicker = true">
          <template #input>
            <span>{{ invoiceLabel }}</span>
          </template>
        </van-field>
        <van-field
          v-model="form.invoiceLink"
          label="发票链接"
          placeholder="电子发票链接（选填）"
          clearable
        />
        <van-field label="开票日期" input-align="right">
          <template #input>
            <input type="date" v-model="form.invoiceDate" class="native-datetime" />
          </template>
        </van-field>
        <van-field name="isFull" label="是否加满" input-align="right">
          <template #input>
            <van-switch v-model="form.isFull" />
          </template>
        </van-field>
      </van-cell-group>

      <van-cell-group inset title="加油数据">
        <van-field
          v-model.number="form.volume"
          label="加油量"
          type="number"
          placeholder="请输入加油量"
          input-align="right"
          @update:model-value="autoCalcCost"
        >
          <template #button>升(L)</template>
        </van-field>
        <van-field
          v-model.number="form.price"
          label="油价"
          type="number"
          placeholder="请输入油价"
          input-align="right"
          @update:model-value="onPriceInput"
        >
          <template #button>元/L</template>
        </van-field>
        <div v-if="priceRef" class="price-ref">
          <span class="pr-dot"></span>
          参考价 {{ formatNum(priceRef.price, 2) }} 元/升
          <span class="pr-meta">{{ oilProvince }} · {{ form.fuelType }}{{ priceRef.date ? ' · ' + priceRef.date + ' 起' : '' }} · 省最高零售价</span>
          <span v-if="priceUserModified" class="pr-touched">已手动修改</span>
        </div>
        <van-field
          v-model.number="form.cost"
          label="费用"
          type="number"
          placeholder="自动计算，可手动修改"
          input-align="right"
        >
          <template #button>元</template>
        </van-field>
        <van-field
          v-model.number="form.totalMileage"
          label="总行驶里程"
          type="number"
          placeholder="请输入当前总里程"
          input-align="right"
        >
          <template #button>km</template>
        </van-field>
        <van-field
          v-model.number="form.estimatedRange"
          label="预计可行驶里程"
          type="number"
          placeholder="油表显示可行驶里程"
          input-align="right"
        >
          <template #button>km</template>
        </van-field>
        <van-field label="预计总里程" input-align="right" readonly>
          <template #input>
            <span class="auto-val">{{ formatNum(estimatedTotal, 1) }} km</span>
          </template>
        </van-field>
      </van-cell-group>

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

      <!-- 对比预览 -->
      <div class="card preview" v-if="previewComparison">
        <div class="preview-title">本次加油对比预览</div>
        <template v-if="previewComparison.calculable">
          <div class="row">
            <span class="label">上次加油时间</span>
            <span>{{ formatDate(prevRecord.time) }}</span>
          </div>
          <div class="row">
            <span class="label">间驶里程</span>
            <span class="hl">{{ formatNum(previewComparison.intervalMileage, 1) }} km</span>
          </div>
          <div class="row">
            <span class="label">百公里油耗</span>
            <span class="hl">{{ formatFuel(previewComparison.fuelPer100km, fuelUnit) }} {{ fuelUnit }}</span>
          </div>
          <div class="row">
            <span class="label">每公里费用</span>
            <span class="hl">{{ formatNum(previewComparison.costPerKm, 3) }} 元/km</span>
          </div>
        </template>
        <template v-else>
          <div class="row warn">{{ previewComparison.reason }}</div>
        </template>
      </div>

      <!-- 智能预测预览 -->
      <div class="card predict-preview" v-if="previewPrediction">
        <div class="predict-preview-title">智能预测（基于历史油耗）</div>
        <template v-if="previewPrediction.calculable">
          <div class="row">
            <span class="label">预测可行驶里程</span>
            <span class="hl2">{{ formatNum(previewPrediction.predictedRange, 0) }} km</span>
          </div>
          <div class="row">
            <span class="label">预测总行驶里程</span>
            <span class="hl2">{{ formatNum(previewPrediction.predictedTotalMileage, 0) }} km</span>
          </div>
          <div class="row" v-if="previewPrediction.predictedDays > 0">
            <span class="label">预测可行驶天数</span>
            <span class="hl2">{{ formatNum(previewPrediction.predictedDays, 1) }} 天</span>
          </div>
          <div class="row hint">
            <span>参考：油箱 {{ formatNum(previewPrediction.tankCapacity, 0) }}L，
              平均油耗 {{ formatFuel(previewPrediction.avgFuel, fuelUnit) }} {{ fuelUnit }}，
              日均 {{ formatNum(previewPrediction.avgDailyMileage, 1) }} km</span>
          </div>
          <div class="row deviation" v-if="previewPrediction.deviation">
            <span class="label">vs 您的输入({{ formatNum(previewPrediction.userInputRange, 0) }}km)</span>
            <span :class="['dev-val', previewPrediction.deviation.assessment]">
              {{ previewPrediction.deviation.assessment }}
              ({{ previewPrediction.deviation.percent > 0 ? '+' : '' }}{{ formatNum(previewPrediction.deviation.percent, 1) }}%)
            </span>
          </div>
        </template>
        <template v-else>
          <div class="row warn">{{ previewPrediction.reason }}</div>
        </template>
      </div>

      <!-- 删除按钮（仅编辑模式显示） -->
      <div class="delete-zone" v-if="isEdit">
        <van-button block type="danger" plain icon="delete-o" @click="onDelete">
          删除该加油记录
        </van-button>
      </div>
    </van-form>

    <!-- 油号选择器 -->
    <van-popup v-model:show="showFuelPicker" position="bottom" round>
      <van-picker
        :columns="FUEL_TYPES"
        :model-value="[form.fuelType]"
        @confirm="onFuelConfirm"
        @cancel="showFuelPicker = false"
      />
    </van-popup>

    <!-- 关联发票选择器 -->
    <van-popup v-model:show="showInvoicePicker" position="bottom" round>
      <van-picker
        :columns="invoiceColumns"
        :model-value="[form.invoiceId || '']"
        @confirm="onInvoiceConfirm"
        @cancel="showInvoicePicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { useRefuelStore } from '../../stores/refuel'
import { useSettingsStore } from '../../stores/settings'
import { createRefuelRecord, FUEL_TYPES } from '../../api/models'
import { getPriceOnDate } from '../../api/oilHistory'
import { useInvoiceStore } from '../../stores/invoice'
import { calcRefuelComparison, predictRefuelRange } from '../../utils/calc'
import { formatDate, formatNum } from '../../utils/format'
import { formatFuel } from '../../utils/units'

const route = useRoute()
const router = useRouter()
const store = useRefuelStore()
const settingsStore = useSettingsStore()
const invoiceStore = useInvoiceStore()

// 当前油耗显示单位（来自设置，使"油耗单位"设置生效）
const fuelUnit = computed(() => settingsStore.settings.unit)

const isEdit = computed(() => !!route.params.id)
const form = reactive({ ...createRefuelRecord() })

/* ---------- 参考油价（省最高零售价，自动带出） ---------- */
const oilProvince = computed(() => settingsStore.settings.oilProvince || '')
const autoFillEnabled = computed(() => settingsStore.settings.autoFillPrice !== false)
const priceRef = ref(null) // { price, date }
const lastAutoPrice = ref(null) // 上次自动填入的值（用于判断用户是否改过）

/** 记录日期：按加油时间取，而不是"今天"（支持补录） */
function refuelDate() {
  return (isoToLocal(form.time) || '').slice(0, 10)
}

/** 当前价格是否被用户改过（与上次自动填入值不同） */
const priceUserModified = computed(() =>
  !isEdit.value && !!priceRef.value && Number(form.price) > 0 &&
  Number(form.price) !== Number(lastAutoPrice.value)
)

/** 查当日参考价并自动填入（用户改过则不覆盖） */
function refreshPriceRef() {
  const ref = oilProvince.value
    ? getPriceOnDate(oilProvince.value, form.fuelType, refuelDate())
    : null
  priceRef.value = ref

  if (isEdit.value || !autoFillEnabled.value) return

  // 该日期没有参考价：若框里还是上次自动填的值，就清掉，避免把别的时间的价格留在框里
  if (!ref) {
    if (Number(form.price) > 0 && Number(form.price) === Number(lastAutoPrice.value)) {
      form.price = 0
      lastAutoPrice.value = null
      autoCalcCost()
    }
    return
  }

  const untouched = !(Number(form.price) > 0) || Number(form.price) === Number(lastAutoPrice.value)
  if (!untouched) return
  form.price = ref.price
  lastAutoPrice.value = ref.price
  autoCalcCost()
}

/** 用户编辑价格时重算费用（不做覆盖标记，靠与 lastAutoPrice 比对判断） */
function onPriceInput() {
  autoCalcCost()
}

const showFuelPicker = ref(false)

// 关联发票（外键指向发票实体）
const showInvoicePicker = ref(false)
const invoiceColumns = computed(() => [
  { text: '不关联', value: '' },
  ...invoiceStore.records.map(r => ({ text: r.title || '(未命名)', value: r.id }))
])
const invoiceLabel = computed(() => {
  if (!form.invoiceId) return '不关联'
  const inv = invoiceStore.records.find(r => r.id === form.invoiceId)
  return inv ? inv.title || '(未命名)' : '不关联'
})
function onInvoiceConfirm({ selectedValues }) {
  form.invoiceId = selectedValues[0] || null
  showInvoicePicker.value = false
}

// 原生 datetime-local 输入值（格式 YYYY-MM-DDTHH:mm）
const timeLocal = ref('')

// 加载已有数据（编辑模式）
const editingId = ref(null)
onMounted(() => {
  if (route.params.id) {
    const rec = store.getById(route.params.id)
    if (rec) {
      Object.assign(form, rec)
      // 旧记录可能没有开票字段，显式回退为空，避免沿用新建默认值（今天）
      form.invoiceLink = rec.invoiceLink || ''
      form.invoiceDate = rec.invoiceDate || ''
      editingId.value = rec.id
      // 编辑模式：展示这条记录保存时的参考价快照，不重新计算
      priceRef.value = rec.priceRef
        ? { price: Number(rec.priceRef), date: rec.priceRefDate || '' }
        : null
    }
  } else {
    form.fuelType = '92#'
  }
  // 初始化 datetime-local 值
  syncTimeLocal()
  // 新建记录：按"加油日期 + 油号"自动带出参考价
  if (!isEdit.value) refreshPriceRef()
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

// 用户修改 datetime-local 时同步回 form.time
function onTimeChange() {
  if (!timeLocal.value) return
  // datetime-local 字符串按本地时间解析
  const d = new Date(timeLocal.value)
  if (!isNaN(d.getTime())) {
    form.time = d.toISOString()
  }
  // 日期变了，参考价跟着换（仅当价格没被手动改过）
  refreshPriceRef()
}

function onFuelConfirm({ selectedValues }) {
  form.fuelType = selectedValues[0]
  showFuelPicker.value = false
  // 油号变了，参考价也要换
  refreshPriceRef()
}

// 自动计算费用
let manualCostTouched = false
function autoCalcCost() {
  if (manualCostTouched) return
  const v = Number(form.volume) || 0
  const p = Number(form.price) || 0
  form.cost = +(v * p).toFixed(2)
}

// 预计总里程 = 总里程 + 预计可行驶里程
const estimatedTotal = computed(() =>
  Number(form.totalMileage || 0) + Number(form.estimatedRange || 0)
)

// 上一条加油记录（用于预览对比）
const prevRecord = computed(() => {
  const all = store.records
  if (all.length === 0) return null
  // 找出时间早于当前 form.time 的最近一条
  const curTime = new Date(form.time).getTime()
  const earlier = all
    .filter(r => new Date(r.time).getTime() < curTime && r.id !== editingId.value)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
  return earlier[0] || null
})

const previewComparison = computed(() => {
  if (!prevRecord.value) return null
  if (!(form.volume > 0) || !(form.totalMileage >= 0)) return null
  return calcRefuelComparison(form, prevRecord.value)
})

// 智能预测预览（基于历史数据）
const previewPrediction = computed(() => {
  if (!(form.volume > 0)) return null
  return predictRefuelRange(form, store.records, {
    tankCapacity: settingsStore.settings.tankCapacity
  })
})

function onSave() {
  if (!(form.volume > 0)) {
    showToast('请输入加油量')
    return
  }
  const data = {
    time: form.time,
    volume: Number(form.volume),
    price: Number(form.price),
    cost: Number(form.cost),
    totalMileage: Number(form.totalMileage),
    isFull: !!form.isFull,
    estimatedRange: Number(form.estimatedRange),
    fuelType: form.fuelType,
    invoiceId: form.invoiceId || null,
    invoiceLink: (form.invoiceLink || '').trim(),
    invoiceDate: form.invoiceDate || '',
    priceRef: priceRef.value ? priceRef.value.price : null,
    priceRefDate: priceRef.value ? priceRef.value.date || '' : '',
    priceRefSource: priceRef.value
      ? `${oilProvince.value} ${form.fuelType} 省最高零售价`
      : '',
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
    message: '确定删除该加油记录吗？此操作不可恢复。'
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
.form {
  padding: 10px 0;
}
.preview {
  margin: 12px;
  background: #fff8ed;
  border: 1px solid #ffe7c2;
}
.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #ff976a;
  margin-bottom: 8px;
}
.preview .row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}
.preview .label {
  color: #646566;
}
.preview .hl {
  color: #ee0a24;
  font-weight: 600;
}
.preview .warn {
  color: #ee0a24;
  justify-content: center;
}
.predict-preview {
  margin: 12px;
  background: #eef9ff;
  border: 1px solid #c8e3ff;
}
.predict-preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #1989fa;
  margin-bottom: 8px;
}
.predict-preview .row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}
.predict-preview .label {
  color: #646566;
}
.predict-preview .hl2 {
  color: #1989fa;
  font-weight: 600;
}
.predict-preview .hint {
  font-size: 11px;
  color: #969799;
  border-top: 1px dashed #c8e3ff;
  padding-top: 6px;
  margin-top: 4px;
}
.predict-preview .deviation {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed #c8e3ff;
  font-size: 12px;
}
.predict-preview .dev-val {
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.predict-preview .dev-val.一致 { color: #07c160; background: #e6f9ec; }
.predict-preview .dev-val.偏低 { color: #ff976a; background: #fff3e0; }
.predict-preview .dev-val.偏高 { color: #1989fa; background: #eaf5ff; }
.predict-preview .warn {
  color: #ee0a24;
  justify-content: center;
  font-size: 12px;
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
.auto-val {
  color: #07c160;
  font-weight: 600;
}
.price-ref {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 16px 8px;
  font-size: 11px;
  line-height: 1.5;
  color: #969799;
}
.pr-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #1989fa;
  flex-shrink: 0;
}
.pr-meta { color: #c8c9cc; }
.pr-touched { color: #ff976a; }

</style>
