<template>
  <div class="page">
    <van-nav-bar title="设置" />

    <van-cell-group inset title="偏好设置">
      <van-cell title="默认油号" :value="settings.preferredFuelType" is-link @click="showFuelPicker = true" />
      <van-cell title="油耗单位" :value="settings.unit" is-link @click="showUnitPicker = true" />
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

    <van-cell-group inset title="数据管理">
      <van-cell title="加油记录数" :value="`${refuelCount} 条`" />
      <van-cell title="行程快照数" :value="`${tripCount} 条`" />
      <van-cell title="清空加油记录" is-link @click="clearRefuel" />
      <van-cell title="清空行程快照" is-link @click="clearTrip" />
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
        label="将加油记录、行程快照、设置导出为 JSON 文件"
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
        @confirm="onFuelConfirm"
        @cancel="showFuelPicker = false"
      />
    </van-popup>
    <van-popup v-model:show="showUnitPicker" position="bottom" round>
      <van-picker
        :columns="units"
        @confirm="onUnitConfirm"
        @cancel="showUnitPicker = false"
      />
    </van-popup>

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
import { ref, computed } from 'vue'
import { showConfirmDialog, showSuccessToast, showToast, showLoadingToast, closeToast } from 'vant'
import { useSettingsStore } from '../../stores/settings'
import { useRefuelStore } from '../../stores/refuel'
import { useTripStore } from '../../stores/trip'
import { FUEL_TYPES } from '../../api/models'
import { refuelRepo, tripRepo } from '../../api/storage'
import { downloadAllDataJson, importDataFromFile } from '../../utils/backup'

const settingsStore = useSettingsStore()
const refuelStore = useRefuelStore()
const tripStore = useTripStore()

const settings = computed(() => settingsStore.settings)
const refuelCount = computed(() => refuelStore.records.length)
const tripCount = computed(() => tripStore.records.length)

const showFuelPicker = ref(false)
const showUnitPicker = ref(false)
const units = ['L/100km', 'L/km']

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
    message: '将清空所有数据（加油记录+行程快照+设置），此操作不可恢复，是否继续？'
  }).then(() => {
    refuelRepo.clear()
    tripRepo.clear()
    refuelStore.reload()
    tripStore.reload()
    showSuccessToast('已全部清空')
  }).catch(() => {})
}

/* ========= 数据迁移 ========= */

function onExportAll() {
  if (refuelCount.value === 0 && tripCount.value === 0) {
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
    settingsStore.reload()
    closeToast()
    const modeText = importMode.value === 'merge' ? '合并' : '覆盖'
    showSuccessToast({
      message: `导入成功（${modeText}）\n加油记录: ${result.refuelCount} 条\n行程快照: ${result.tripCount} 条`,
      duration: 3000
    })
  } catch (err) {
    closeToast()
    showToast(err.message || '导入失败')
  }
}
</script>
