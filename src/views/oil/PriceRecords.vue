<template>
  <div class="page page-without-tabbar">
    <van-nav-bar title="油价记录" left-text="返回" left-arrow @click-left="onBack">
      <template #right>
        <van-button v-if="province" size="small" type="primary" @click="openAdd">新增</van-button>
      </template>
    </van-nav-bar>

    <template v-if="!province">
      <van-empty description="请先在设置里选择油价地区" />
      <div class="center">
        <van-button size="small" type="primary" @click="router.push('/settings')">去设置</van-button>
      </div>
    </template>

    <template v-else>
      <div class="fuel-tabs">
        <span
          v-for="f in FUEL_TYPES"
          :key="f.value"
          :class="['fuel-tab', { active: fuelType === f.value }]"
          @click="fuelType = f.value"
        >{{ f.text }}</span>
      </div>

      <div class="auto-row">
        <van-button
          size="small"
          plain
          type="primary"
          icon="notes-o"
          :disabled="autoFetching"
          @click="openYearPicker('calendar')"
        >调价日历</van-button>
        <van-button
          size="small"
          plain
          type="primary"
          icon="down"
          :disabled="autoFetching"
          @click="openYearPicker('fetch')"
        >自动获取全年</van-button>
      </div>
      <div class="auto-tip">
        92# / 95# / 柴油 · 东方财富（发改委调价数据）· 98# 数据源未提供，无法自动获取
      </div>

      <div class="hint">
        {{ province }} · {{ fuelType }} · 共 {{ points.length }} 条。
        日期是<b>生效日</b>（该价从这日起执行，直到下次调价窗口）；新增加油记录时会取「生效日 ≤ 加油日期」中最新的那条。
      </div>

      <van-empty
        v-if="list.length === 0"
        description="暂无记录。可以在「油价」页查一次自动记录，或点上方「新增」"
      />

      <van-cell-group v-else inset>
        <van-cell v-for="p in list" :key="p.id">
          <template #title>
            <div class="pr-date">
              {{ p.date }} 起
              <span v-if="p.manual" class="pr-src">手动</span>
              <span v-else-if="p.source === 'eastmoney'" class="pr-src em">东财</span>
            </div>
            <div class="pr-sub">
              <span v-if="p.nextAdjustmentAt">有效至 {{ formatDate(p.nextAdjustmentAt, 'MM-DD') }}</span>
              <span v-else>下次窗口未知</span>
              <span v-if="p.prevPrice !== null && p.prevPrice !== undefined">
                · 较上次 {{ p.price > p.prevPrice ? '+' : '' }}{{ (p.price - p.prevPrice).toFixed(2) }}
              </span>
            </div>
          </template>
          <template #value>
            <span class="pr-price">{{ formatNum(p.price, 2) }}</span>
          </template>
          <template #right-icon>
            <van-icon name="edit" class="pr-icon" @click.stop="openEdit(p)" />
            <van-icon name="delete-o" class="pr-icon danger" @click.stop="onDelete(p)" />
          </template>
        </van-cell>
      </van-cell-group>
    </template>

    <!-- 自动获取全年 -->
    <van-popup v-model:show="showYearPicker" position="bottom" round>
      <van-picker
        :columns="yearColumns"
        title="获取哪一年的调价记录"
        @confirm="onYearPickerConfirm"
        @cancel="showYearPicker = false"
      />
    </van-popup>

    <!-- 调价日历 -->
    <van-popup v-model:show="showCalendar" position="bottom" round class="cal-popup">
      <div class="cal-head">
        <span class="cal-title">{{ calendarYear }} 年调价日历</span>
        <van-icon name="cross" class="cal-close" @click="showCalendar = false" />
      </div>
      <div class="cal-list">
        <div v-for="a in calendarRows" :key="a.date" class="cal-item">
          <span class="cal-date">{{ a.date.slice(5) }}</span>
          <span
            class="cal-change"
            :class="a.gasolineChange > 0 ? 'up' : a.gasolineChange < 0 ? 'down' : ''"
          >汽油 {{ a.gasolineChange > 0 ? '+' : '' }}{{ a.gasolineChange }} 元/吨</span>
          <span class="cal-bench">基准 {{ a.gasolinePerTon }}</span>
          <van-tag :type="hasLocalRecord(a.date) ? 'success' : 'warning'">
            {{ hasLocalRecord(a.date) ? '已存' : '未存' }}
          </van-tag>
        </div>
        <van-empty v-if="calendarRows.length === 0 && !calendarLoading" image-size="48" description="该年份没有调价记录" />
      </div>
      <div class="cal-foot">
        <van-button
          size="small"
          type="primary"
          block
          :loading="autoFetching"
          @click="runAutoFetch(calendarYear)"
        >拉取全年明细并保存</van-button>
      </div>
    </van-popup>

    <van-dialog
      v-model:show="showForm"
      :title="editingId ? '修改油价' : '新增油价'"
      show-cancel-button
      @confirm="onSave"
    >
      <div class="form-box">
        <van-field label="生效日期" input-align="right">
          <template #input>
            <input v-model="draft.date" type="date" class="native-date" />
          </template>
        </van-field>
        <van-field v-model="draft.price" type="number" label="油价" placeholder="如 8.61" input-align="right">
          <template #button>元/升</template>
        </van-field>
        <div class="form-tip">只填你确认过的价格；解析失败或额度用尽时，这里是可靠的补充入口。</div>
      </div>
    </van-dialog>
  </div>
</template>

<script setup name="PriceRecords">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  showToast, showSuccessToast, showConfirmDialog, showLoadingToast, closeToast
} from 'vant'
import { useSettingsStore } from '../../stores/settings'
import { FUEL_TYPES, todayLocalDate } from '../../api/models'
import {
  getPriceHistory, addPricePoint, updatePricePoint, deletePricePoint
} from '../../api/oilHistory'
import { fetchEmAdjustments, fetchEmProvinceDetail } from '../../api/eastmoneyOil'
import { normalizeProvinceName, nextWindowFrom } from '../../utils/oilPrice'
import { formatNum, formatDate } from '../../utils/format'

const router = useRouter()
const settingsStore = useSettingsStore()

const province = computed(() => settingsStore.settings.oilProvince || '')
const fuelType = ref(settingsStore.settings.preferredFuelType || '92#')

const tick = ref(0)
const points = computed(() => {
  void tick.value // 数据来自 localStorage，用 tick 触发重算
  return province.value ? getPriceHistory(province.value, fuelType.value) : []
})
const list = computed(() => [...points.value].reverse())

const showForm = ref(false)
const editingId = ref(null)
const draft = reactive({ date: todayLocalDate(), price: '' })

function openAdd() {
  editingId.value = null
  draft.date = todayLocalDate()
  draft.price = ''
  showForm.value = true
}

function openEdit(p) {
  editingId.value = p.id
  draft.date = p.date || todayLocalDate()
  draft.price = String(p.price)
  showForm.value = true
}

function onSave() {
  const price = Number(draft.price)
  if (!draft.date) {
    showToast('请选择日期')
    return
  }
  if (!Number.isFinite(price) || price <= 0 || price > 30) {
    showToast('请输入正确的油价（元/升）')
    return
  }
  if (editingId.value) {
    updatePricePoint(editingId.value, { date: draft.date, price })
  } else {
    addPricePoint({ province: province.value, fuelType: fuelType.value, date: draft.date, price })
  }
  tick.value++
  showForm.value = false
  showSuccessToast(editingId.value ? '已修改' : '已添加')
}

function onDelete(p) {
  showConfirmDialog({
    title: '删除记录',
    message: `确定删除 ${p.date} 的 ${formatNum(p.price, 2)} 元/升这条记录吗？`
  }).then(() => {
    deletePricePoint(p.id)
    tick.value++
    showSuccessToast('已删除')
  }).catch(() => {})
}

function onBack() {
  router.back()
}

/* ---------- 调价日历 / 自动获取全年调价（东方财富·发改委数据） ---------- */
const showYearPicker = ref(false)
const yearPickerMode = ref('fetch') // 'fetch' 自动获取 | 'calendar' 调价日历
const autoFetching = ref(false)
const showCalendar = ref(false)
const calendarYear = ref(new Date().getFullYear())
const calendarRows = ref([])
const calendarLoading = ref(false)
const yearColumns = (() => {
  const y = new Date().getFullYear()
  const out = []
  for (let v = y; v >= y - 5; v--) out.push({ text: `${v} 年`, value: String(v) })
  return out
})()

function openYearPicker(mode) {
  yearPickerMode.value = mode
  showYearPicker.value = true
}

function onYearPickerConfirm({ selectedValues }) {
  const year = Number(selectedValues[0])
  showYearPicker.value = false
  if (yearPickerMode.value === 'calendar') openCalendar(year)
  else runAutoFetch(year)
}

/** 调价日历：显示该年全部调价日，并标注是否已存入本机 */
async function openCalendar(year) {
  calendarYear.value = year
  showCalendar.value = true
  calendarRows.value = []
  calendarLoading.value = true
  try {
    const adjustments = await fetchEmAdjustments()
    if (calendarYear.value !== year) return
    calendarRows.value = adjustments.filter(a => a.date.startsWith(String(year)))
  } catch (e) {
    showToast('调价时间线获取失败：' + (e && e.message ? e.message : '网络异常'))
  } finally {
    if (calendarYear.value === year) calendarLoading.value = false
  }
}

/** 该调价日是否已有本机记录（用 92# 判断） */
function hasLocalRecord(date) {
  void tick.value
  return getPriceHistory(province.value, '92#').some(r => String(r.date || '').slice(0, 10) === date)
}

/** 拉取指定年份全部调价明细并保存（生效日 = 调价日） */
async function runAutoFetch(year) {
  if (autoFetching.value) return
  autoFetching.value = true
  showCalendar.value = false
  showLoadingToast({ message: `获取 ${year} 年调价时间线…`, forbidClick: true, duration: 0 })
  try {
    const adjustments = await fetchEmAdjustments()
    const dates = adjustments.map(a => a.date).filter(d => d.startsWith(String(year)))
    if (dates.length === 0) {
      closeToast()
      showToast(`${year} 年没有调价记录`)
      return
    }

    const target = normalizeProvinceName(province.value)
    let saved = 0
    for (let i = 0; i < dates.length; i++) {
      showLoadingToast({ message: `拉取调价明细 ${i + 1}/${dates.length}…`, forbidClick: true, duration: 0 })
      const rows = await fetchEmProvinceDetail(dates[i])
      const row = rows.find(r => normalizeProvinceName(r.province) === target)
      if (!row) continue
      const grades = [
        { fuelType: '92#', price: row.gasoline92 },
        { fuelType: '95#', price: row.gasoline95 },
        { fuelType: '柴油', price: row.diesel0 }
      ]
      for (const g of grades) {
        const added = addPricePoint({
          province: province.value,
          fuelType: g.fuelType,
          date: dates[i],
          price: g.price,
          source: 'eastmoney',
          manual: false,
          nextAdjustmentAt: (nextWindowFrom(dates[i]) || {}).at || null
        })
        if (added) saved++
      }
      tick.value++
    }

    closeToast()
    if (saved > 0) showSuccessToast(`已存入 ${year} 年 ${saved} 条（生效日 = 调价日）`)
    else showToast(`${year} 年油价已在本机记录中`)
  } catch (e) {
    closeToast()
    showToast('获取失败：' + (e && e.message ? e.message : '网络异常'))
  } finally {
    autoFetching.value = false
    tick.value++
  }
}

</script>

<style scoped>
.center{text-align:center}.fuel-tabs{display:flex;gap:8px;margin:10px 12px 0;padding:8px 10px;background:#fff;border-radius:8px;box-shadow:0 1px 3px #0000000a}.fuel-tab{padding:4px 12px;font-size:12px;border-radius:12px;background:#f7f8fa;color:#646566;cursor:pointer}.fuel-tab.active{background:#1989fa;color:#fff;font-weight:500}.auto-row{display:flex;align-items:center;gap:8px;margin:8px 12px 0;padding:8px 10px;background:#fff;border-radius:8px;box-shadow:0 1px 3px #0000000a}.auto-tip{font-size:11px;line-height:1.5;color:#969799}.hint{margin:8px 16px 4px;font-size:11px;line-height:1.6;color:#969799}.pr-date{font-size:14px;font-weight:500;color:#323233}.pr-src{margin-left:6px;padding:0 5px;border-radius:6px;background:#fff7e8;color:#ff976a;font-size:10px;font-weight:400}.pr-src.em{background:#eaf5ff;color:#1989fa}.pr-sub{margin-top:2px;font-size:11px;color:#969799}.pr-price{font-size:16px;font-weight:600;color:#1989fa}.pr-icon{margin-left:10px;color:#969799;font-size:17px}.pr-icon.danger{color:#ee0a24}.form-box{padding:8px 16px 12px}.form-tip{margin-top:8px;font-size:11px;line-height:1.6;color:#969799}.native-date{border:none;text-align:right;font-size:14px;color:#323233;background:transparent;outline:none;width:100%;font-family:inherit}


.cal-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; }
.cal-title { font-size: 15px; font-weight: 600; color: #323233; }
.cal-close { color: #969799; cursor: pointer; }
.cal-list { max-height: 320px; overflow-y: auto; padding: 0 16px; }
.cal-item { display: flex; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid #f2f3f5; font-size: 12px; }
.cal-date { font-weight: 600; color: #323233; }
.cal-change.up { color: #ee0a24; }
.cal-change.down { color: #07c160; }
.cal-bench { color: #969799; flex: 1; }
.cal-foot { padding: 10px 16px 14px; }
</style>

