<template>
  <div class="page">
    <van-cell-group inset title="偏好设置">
      <van-cell title="默认油号" :value="settings.preferredFuelType" is-link @click="showFuelPicker = true" />
      <van-cell title="油耗单位" :value="settings.unit" is-link @click="showUnitPicker = true" />
      <van-cell title="默认首页" :value="defaultPageLabel" is-link @click="showDefaultPagePicker = true" />
      <van-cell title="油价地区" :value="settings.oilProvince || '未设置'" is-link @click="openProvincePicker" />
      <van-cell title="调价提醒" center>
        <template #right-icon>
          <van-switch :model-value="!!settings.oilRemind" size="20" @update:model-value="onToggleOilRemind" />
        </template>
      </van-cell>
      <van-cell title="加油自动带出参考价" center>
        <template #right-icon>
          <van-switch
            :model-value="settings.autoFillPrice !== false"
            size="20"
            @update:model-value="onToggleAutoFill"
          />
        </template>
      </van-cell>
      <van-field
        v-model.number="tankCapacityInput"
        label="油箱容量"
        type="number"
        placeholder="请输入油箱容量"
        input-align="right"
        @blur="onSaveTankCapacity"
      >
        <template #button>升(L)</template>
      </van-field>
    </van-cell-group>

    <van-cell-group inset title="油价数据源">
      <van-cell
        v-for="s in sourceRows"
        :key="s.id"
        :title="s.name"
        :label="s.desc"
        clickable
        @click="onSelectSource(s)"
      >
        <template #right-icon>
          <span class="src-status" :class="{ warn: s.status === '待填写凭据' }">{{ s.status }}</span>
          <van-icon v-if="s.id === settings.oilSourceId" name="success" class="src-check" />
          <van-icon v-else name="arrow" class="src-arrow" />
        </template>
      </van-cell>
      <van-cell
        title="配置当前数据源凭据"
        is-link
        :value="currentCredsLabel"
        @click="openCredsDialog()"
      />
      <van-cell title="添加自定义来源" is-link @click="openAddSource" />
      <van-cell title="油价记录" is-link value="查看 / 新增" @click="$router.push('/oil/prices')" />
      <van-cell
        v-if="activeCustomSource"
        title="删除当前自定义来源"
        is-link
        @click="onDeleteSource(activeCustomSource)"
      />
    </van-cell-group>

    <van-cell-group inset title="节假日数据">
      <van-cell title="已收录年份" :value="holidayYearsLabel" />
      <van-cell
        title="获取指定年份安排"
        label="国务院一般每年 11–12 月公布次年安排"
        is-link
        value="选择年份"
        @click="showHolidayYearPicker = true"
      />
      <van-cell
        v-if="hasRemoteHoliday"
        title="清除已获取的年份数据"
        is-link
        @click="onClearHolidayYears"
      />
    </van-cell-group>

    <van-cell-group inset title="数据管理">
      <van-cell title="加油记录数" :value="`${refuelCount} 条`" />
      <van-cell title="行程快照数" :value="`${tripCount} 条`" />
      <van-cell title="发票数" :value="`${invoiceCount} 张`" />
      <van-cell title="待导出加油记录" :value="`${pendingExportCount} 条`" />
      <van-cell title="油价历史记录" :value="`${oilHistoryCount} 条`" />
      <van-cell title="清空加油记录" is-link @click="clearRefuel" />
      <van-cell title="清空行程快照" is-link @click="clearTrip" />
      <van-cell title="清空油价历史" is-link @click="clearOilHistory" />
      <van-cell title="清空所有数据" is-link @click="clearAll" />
    </van-cell-group>

    <van-cell-group inset title="按月份清理">
      <van-cell
        title="清理加油记录（按月份）"
        label="选择月份，删除该月所有加油记录"
        is-link
        @click="openRefuelMonthPicker"
      />
      <van-cell
        title="清理行程记录（按月份）"
        label="选择月份，删除该月所有行程快照"
        is-link
        @click="openTripMonthPicker"
      />
    </van-cell-group>

    <van-cell-group inset title="数据迁移">
      <van-cell
        title="导出全部数据"
        label="将加油记录、行程快照、发票、设置导出为 JSON 文件"
        is-link
        @click="onExportAll"
      />
      <van-cell
        title="导入数据（覆盖）"
        label="用导入的文件替换当前所有数据"
        is-link
        @click="onImportOverwrite"
      />
      <van-cell
        title="导入数据（合并）"
        label="保留当前数据，仅追加不存在的记录"
        is-link
        @click="onImportMerge"
      />
    </van-cell-group>

    <van-cell-group inset title="关于">
      <van-cell title="应用名称" value="油耗记录" />
      <van-cell title="版本" value="1.0.0" />
      <van-cell title="技术栈" value="Vue3 + Vant + Capacitor" />
    </van-cell-group>

    <input
      ref="fileInput"
      type="file"
      accept=".json,application/json"
      style="display:none"
      @change="onFileChange"
    />

    <van-popup v-model:show="showFuelPicker" position="bottom" round>
      <van-picker
        :columns="FUEL_TYPES"
        :model-value="[settings.preferredFuelType]"
        @confirm="onFuelConfirm"
        @cancel="showFuelPicker = false"
      />
    </van-popup>
    <van-popup v-model:show="showUnitPicker" position="bottom" round>
      <van-picker
        :columns="units"
        :model-value="[settings.unit]"
        @confirm="onUnitConfirm"
        @cancel="showUnitPicker = false"
      />
    </van-popup>
    <van-popup v-model:show="showDefaultPagePicker" position="bottom" round>
      <van-picker
        :columns="defaultPageOptions"
        :model-value="[settings.defaultPage]"
        @confirm="onDefaultPageConfirm"
        @cancel="showDefaultPagePicker = false"
      />
    </van-popup>

    <!-- 油价地区选择 -->
    <van-popup v-model:show="showProvincePicker" position="bottom" round>
      <van-picker
        :columns="provinceColumns"
        title="选择油价地区"
        :model-value="[settings.oilProvince || '北京']"
        @confirm="onProvinceConfirm"
        @cancel="showProvincePicker = false"
      />
    </van-popup>

    <!-- 节假日年份选择 -->
    <van-popup v-model:show="showHolidayYearPicker" position="bottom" round>
      <van-picker
        :columns="holidayYearColumns"
        title="获取哪一年的安排"
        @confirm="onHolidayYearConfirm"
        @cancel="showHolidayYearPicker = false"
      />
    </van-popup>

    <!-- 数据源凭据 -->
    <van-dialog
      v-model:show="showCredsDialog"
      :title="credSource ? `配置：${credSource.name}` : '配置数据源'"
      show-cancel-button
      @confirm="onSaveCreds"
    >
      <div class="cred-box">
        <van-field
          v-for="f in credFields"
          :key="f.key"
          v-model="credDraft[f.key]"
          :label="f.label"
          :placeholder="f.placeholder || '请填写'"
          clearable
        />
        <div class="cred-tip">
          凭据只保存在本机。若来源有免费额度限制，用完后可在油价页切换到其他来源。
        </div>
      </div>
    </van-dialog>

    <!-- 添加自定义来源 -->
    <van-dialog
      v-model:show="showAddSource"
      title="添加自定义来源"
      show-cancel-button
      @confirm="onAddSource"
    >
      <div class="cred-box">
        <van-field v-model="newSource.name" label="名称" placeholder="如：我的油价接口" />
        <van-field label="类型" input-align="right">
          <template #input>
            <van-radio-group v-model="newSource.kind" direction="horizontal">
              <van-radio name="api">JSON 接口</van-radio>
              <van-radio name="page">网页</van-radio>
            </van-radio-group>
          </template>
        </van-field>
        <van-field v-model="newSource.urlTemplate" label="地址" placeholder="https://…?province={province}" />
        <van-field v-model="newSource.headerName" label="请求头名" placeholder="选填，如 X-Api-Key" />
        <van-field v-model="newSource.headerValue" label="请求头值" placeholder="选填" />
        <div class="cred-tip">
          地址中的 {province} 会替换为省份名，{provinceEnc} 为 URL 编码后的省份；
          「网页」类型不做解析，查询时直接展示该页面。
        </div>
      </div>
    </van-dialog>

    <!-- 月份选择器 -->
    <van-popup v-model:show="showMonthPicker" position="bottom" round>
      <van-picker
        :columns="monthColumns"
        title="选择月份"
        @confirm="onMonthConfirm"
        @cancel="showMonthPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { showConfirmDialog, showSuccessToast, showToast, showLoadingToast, closeToast } from 'vant'
import { useSettingsStore } from '../../stores/settings'
import { useRefuelStore } from '../../stores/refuel'
import { useTripStore } from '../../stores/trip'
import { useInvoiceStore } from '../../stores/invoice'
import { FUEL_TYPES } from '../../api/models'
import { refuelRepo, tripRepo, invoiceRepo, readOilSources, writeOilSources } from '../../api/storage'
import { downloadAllDataJson, importDataFromFile } from '../../utils/backup'
import { FUEL_UNITS } from '../../utils/units'
import { PROVINCES, getSourceCreds } from '../../api/oilPrice'
import { allSources, KIND, credsReady, sourceStatusText } from '../../api/oilSources'
import { countPriceHistory, clearPriceHistory } from '../../api/oilHistory'
import { getHolidayYearsInfo } from '../../utils/holidays'
import {
  fetchHolidayYear, saveHolidayYear, clearAllHolidayYears
} from '../../api/holidayData'

const settingsStore = useSettingsStore()
const refuelStore = useRefuelStore()
const tripStore = useTripStore()
const invoiceStore = useInvoiceStore()

const settings = computed(() => settingsStore.settings)
const refuelCount = computed(() => refuelStore.records.length)
const tripCount = computed(() => tripStore.records.length)
const invoiceCount = computed(() => invoiceStore.records.length)
// 已关联/已开票但尚未标记"已导出"的加油记录数（报销进度，状态属于加油记录）
const pendingExportCount = computed(() =>
  refuelStore.records.filter(r => (r.invoiceId || r.invoiceLink) && !r.exported).length
)

const showFuelPicker = ref(false)
const showUnitPicker = ref(false)
const showDefaultPagePicker = ref(false)
const units = FUEL_UNITS

// 默认首页选项
const defaultPageOptions = [
  { text: '行程快照', value: '/trip' },
  { text: '加油记录', value: '/refuel' },
  { text: '统计报表', value: '/stats' },
  { text: '发票', value: '/invoice' },
  { text: '设置', value: '/settings' }
]
const defaultPageLabel = computed(() => {
  const f = defaultPageOptions.find(o => o.value === settings.value.defaultPage)
  return f ? f.text : '行程快照'
})

/* ---------- 油价地区 ---------- */
const showProvincePicker = ref(false)
const provinceColumns = PROVINCES.map(p => ({ text: p, value: p }))

function openProvincePicker() {
  showProvincePicker.value = true
}

function onProvinceConfirm({ selectedValues }) {
  settingsStore.save({ oilProvince: selectedValues[0] })
  showProvincePicker.value = false
  showSuccessToast('已保存')
}

/* ---------- 油价数据源 ---------- */
const customSources = ref(readOilSources())
const sourceRows = computed(() =>
  allSources(customSources.value).map(s => ({
    ...s,
    status: sourceStatusText(s, getSourceCreds(s.id))
  }))
)
const activeCustomSource = computed(
  () => customSources.value.find(s => s.id === settings.value.oilSourceId) || null
)
const currentCredsLabel = computed(() => {
  const s = sourceRows.value.find(x => x.id === settings.value.oilSourceId)
  if (!s) return '未设置'
  if (s.kind === KIND.MANUAL) return '无需配置'
  if (!s.credsFields || !s.credsFields.length) return '免配置'
  return s.status
})

function onSelectSource(s) {
  settingsStore.save({ oilSourceId: s.id })
  if (s.credsFields && s.credsFields.length && !credsReady(s, getSourceCreds(s.id))) {
    openCredsDialog(s)
  } else {
    showToast(`已切换到「${s.name}」`)
  }
}

const showCredsDialog = ref(false)
const credSource = ref(null)
const credDraft = ref({})
const credFields = computed(() => (credSource.value && credSource.value.credsFields) || [])

function openCredsDialog(source) {
  const s = source || sourceRows.value.find(x => x.id === settings.value.oilSourceId)
  if (!s) return
  if (!s.credsFields || !s.credsFields.length) {
    showToast('该数据源无需配置')
    return
  }
  credSource.value = s
  credDraft.value = { ...getSourceCreds(s.id) }
  showCredsDialog.value = true
}

function onSaveCreds() {
  const s = credSource.value
  if (!s) return
  const all = { ...(settingsStore.settings.oilSourceCreds || {}) }
  all[s.id] = { ...(all[s.id] || {}), ...credDraft.value }
  settingsStore.save({ oilSourceCreds: all })
  showCredsDialog.value = false
  showSuccessToast('已保存')
}

const showAddSource = ref(false)
const newSource = reactive({ name: '', kind: 'api', urlTemplate: '', headerName: '', headerValue: '' })

function openAddSource() {
  Object.assign(newSource, { name: '', kind: 'api', urlTemplate: '', headerName: '', headerValue: '' })
  showAddSource.value = true
}

function onAddSource() {
  const name = newSource.name.trim()
  const url = newSource.urlTemplate.trim()
  if (!name) {
    showToast('请填写名称')
    return
  }
  if (!/^https?:\/\//i.test(url)) {
    showToast('请填写 http(s) 地址')
    return
  }
  const item = {
    id: 'custom_' + Date.now().toString(36),
    name,
    kind: newSource.kind === 'page' ? KIND.PAGE : KIND.API,
    urlTemplate: url,
    headerName: newSource.headerName.trim(),
    headerValue: newSource.headerValue.trim(),
    createdAt: new Date().toISOString()
  }
  const list = [...readOilSources(), item]
  writeOilSources(list)
  customSources.value = list
  showAddSource.value = false
  showSuccessToast('已添加，点一下即可启用')
}

function onDeleteSource(s) {
  showConfirmDialog({
    title: '删除来源',
    message: `确定删除自定义来源「${s.name}」吗？`
  }).then(() => {
    const list = readOilSources().filter(x => x.id !== s.id)
    writeOilSources(list)
    customSources.value = list
    if (settings.value.oilSourceId === s.id) settingsStore.save({ oilSourceId: 'apizero' })
    showSuccessToast('已删除')
  }).catch(() => {})
}

/* ---------- 节假日数据 ---------- */
const holidayYearsInfo = ref(getHolidayYearsInfo())
const holidayYearsLabel = computed(() => {
  if (holidayYearsInfo.value.length === 0) return '无'
  return holidayYearsInfo.value
    .map(i => `${i.year}${i.source === 'builtin' ? '（内置）' : '（已获取）'}`)
    .join(' · ')
})
const hasRemoteHoliday = computed(() => holidayYearsInfo.value.some(i => i.source === 'remote'))
const showHolidayYearPicker = ref(false)
const holidayYearColumns = (() => {
  const y = new Date().getFullYear()
  return [y, y + 1, y + 2, y + 3].map(v => ({ text: `${v} 年`, value: String(v) }))
})()

async function onHolidayYearConfirm({ selectedValues }) {
  const year = Number(selectedValues[0])
  showHolidayYearPicker.value = false
  showLoadingToast({ message: `获取 ${year} 年安排…`, forbidClick: true, duration: 0 })
  try {
    const res = await fetchHolidayYear(year)
    closeToast()
    if (!res.ok) {
      showToast(res.message || '获取失败')
      return
    }
    const count = saveHolidayYear(year, res.days)
    holidayYearsInfo.value = getHolidayYearsInfo()
    showSuccessToast(`已收录 ${year} 年 ${count} 条`)
  } catch (e) {
    closeToast()
    showToast('获取失败')
  }
}

function onClearHolidayYears() {
  showConfirmDialog({
    title: '清除节假日数据',
    message: '将删除所有「按年获取」的节假日数据，回到内置版本。是否继续？'
  }).then(() => {
    const n = clearAllHolidayYears()
    holidayYearsInfo.value = getHolidayYearsInfo()
    showSuccessToast(n ? `已清除 ${n} 个年份` : '没有可清除的数据')
  }).catch(() => {})
}

/* ---------- 调价提醒 / 油价历史 ---------- */
const oilHistoryCount = ref(countPriceHistory())

function onToggleOilRemind(v) {
  settingsStore.save({ oilRemind: !!v })
  showToast(v ? '已开启调价提醒' : '已关闭调价提醒')
}

function onToggleAutoFill(v) {
  settingsStore.save({ autoFillPrice: !!v })
  showToast(v ? '已开启自动带出参考价' : '已关闭自动带出参考价')
}

function clearOilHistory() {
  showConfirmDialog({
    title: '警告',
    message: '将清空本机记录的油价历史（价格曲线需重新累积），是否继续？'
  }).then(() => {
    clearPriceHistory()
    oilHistoryCount.value = 0
    showSuccessToast('已清空')
  }).catch(() => {})
}

// 月份选择器
const showMonthPicker = ref(false)
// 当前正在选择的目标类型：'refuel' | 'trip'
const monthPickerTarget = ref('refuel')
// 月份选项（动态生成）
const monthColumns = ref([])

function openRefuelMonthPicker() {
  const months = refuelStore.getMonths()
  if (months.length === 0) {
    showToast('暂无加油记录')
    return
  }
  monthPickerTarget.value = 'refuel'
  monthColumns.value = months.map(m => ({
    text: `${m.year}年${m.month}月 (${m.count}条)`,
    value: `${m.year}-${m.month}`
  }))
  showMonthPicker.value = true
}

function openTripMonthPicker() {
  const months = tripStore.getMonths()
  if (months.length === 0) {
    showToast('暂无行程记录')
    return
  }
  monthPickerTarget.value = 'trip'
  monthColumns.value = months.map(m => ({
    text: `${m.year}年${m.month}月 (${m.count}条)`,
    value: `${m.year}-${m.month}`
  }))
  showMonthPicker.value = true
}

function onMonthConfirm({ selectedValues }) {
  const val = selectedValues[0]
  if (!val) return
  const [year, month] = val.split('-').map(Number)
  const target = monthPickerTarget.value
  const targetText = target === 'refuel' ? '加油记录' : '行程记录'
  // 计算该月记录数（用于确认提示）
  const count = target === 'refuel'
    ? refuelStore.getMonths().find(m => m.year === year && m.month === month)?.count || 0
    : tripStore.getMonths().find(m => m.year === year && m.month === month)?.count || 0

  showMonthPicker.value = false
  showConfirmDialog({
    title: '确认删除',
    message: `将删除 ${year}年${month}月 的所有${targetText}（共 ${count} 条），此操作不可恢复，是否继续？`
  }).then(() => {
    const res = target === 'refuel'
      ? refuelStore.removeByMonth(year, month)
      : tripStore.removeByMonth(year, month)
    if (res.success) {
      showSuccessToast(`已删除 ${res.count} 条${targetText}`)
    } else {
      showToast('删除失败')
    }
  }).catch(() => {})
}

// 油箱容量输入（双向绑定）
const tankCapacityInput = ref(settings.value.tankCapacity ?? 50)
function onSaveTankCapacity() {
  const v = Number(tankCapacityInput.value)
  if (!(v > 0)) {
    showToast('油箱容量必须大于0')
    tankCapacityInput.value = settings.value.tankCapacity ?? 50
    return
  }
  settingsStore.save({ tankCapacity: v })
  showSuccessToast('油箱容量已保存')
}

// 导入文件相关
const fileInput = ref(null)
// 标记本次导入模式：'overwrite' | 'merge'
const importMode = ref('overwrite')

function onFuelConfirm({ selectedValues }) {
  settingsStore.save({ preferredFuelType: selectedValues[0] })
  showFuelPicker.value = false
  showSuccessToast('已保存')
}

function onUnitConfirm({ selectedValues }) {
  settingsStore.save({ unit: selectedValues[0] })
  showUnitPicker.value = false
  showSuccessToast('已保存')
}

function onDefaultPageConfirm({ selectedValues }) {
  settingsStore.save({ defaultPage: selectedValues[0] })
  showDefaultPagePicker.value = false
  showSuccessToast('已保存')
}

function clearRefuel() {
  showConfirmDialog({
    title: '警告',
    message: '将清空所有加油记录，此操作不可恢复，是否继续？'
  }).then(() => {
    refuelRepo.clear()
    refuelStore.reload()
    showSuccessToast('已清空')
  }).catch(() => {})
}

function clearTrip() {
  showConfirmDialog({
    title: '警告',
    message: '将清空所有行程快照，此操作不可恢复，是否继续？'
  }).then(() => {
    tripRepo.clear()
    tripStore.reload()
    showSuccessToast('已清空')
  }).catch(() => {})
}

function clearAll() {
  showConfirmDialog({
    title: '警告',
    message: '将清空所有数据（加油记录+行程快照+发票+油价历史+设置），此操作不可恢复，是否继续？'
  }).then(() => {
    refuelRepo.clear()
    tripRepo.clear()
    invoiceRepo.clear()
    clearPriceHistory()
    oilHistoryCount.value = 0
    refuelStore.reload()
    tripStore.reload()
    invoiceStore.reload()
    showSuccessToast('已全部清空')
  }).catch(() => {})
}

/* ========= 数据迁移 ========= */

function onExportAll() {
  if (refuelCount.value === 0 && tripCount.value === 0 && invoiceCount.value === 0 && oilHistoryCount.value === 0) {
    showToast('暂无数据可导出')
    return
  }
  const { fileName } = downloadAllDataJson()
  showSuccessToast(`已导出：${fileName}`)
}

function onImportOverwrite() {
  showConfirmDialog({
    title: '导入数据（覆盖模式）',
    message: '此操作将用导入文件替换当前所有数据，现有数据会被覆盖且不可恢复，是否继续？'
  }).then(() => {
    importMode.value = 'overwrite'
    fileInput.value.value = ''
    fileInput.value.click()
  }).catch(() => {})
}

function onImportMerge() {
  importMode.value = 'merge'
  fileInput.value.value = ''
  fileInput.value.click()
}

async function onFileChange(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  showLoadingToast({ message: '导入中...', forbidClick: true, duration: 0 })
  try {
    const result = await importDataFromFile(file, { merge: importMode.value === 'merge' })
    // 刷新各 store
    refuelStore.reload()
    tripStore.reload()
    invoiceStore.reload()
    settingsStore.reload()
    oilHistoryCount.value = countPriceHistory()
    closeToast()
    const modeText = importMode.value === 'merge' ? '合并' : '覆盖'
    showSuccessToast({
      message: `导入成功（${modeText}）\n加油记录: ${result.refuelCount} 条\n行程快照: ${result.tripCount} 条\n发票: ${result.invoiceCount || 0} 张\n油价历史: ${result.oilHistoryCount || 0} 条`,
      duration: 3000
    })
  } catch (err) {
    closeToast()
    showToast(err.message || '导入失败')
  }
}
</script>

<style scoped>
.cred-box { padding: 12px 16px 4px; }
.cred-tip { margin-top: 8px; font-size: 11px; line-height: 1.6; color: #969799; }
.src-status { font-size: 11px; color: #07c160; margin-right: 6px; }
.src-status.warn { color: #ff976a; }
.src-check { color: #07c160; }
.src-arrow { color: #c8c9cc; }
</style>
