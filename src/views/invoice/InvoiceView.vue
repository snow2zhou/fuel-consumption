<template>
  <div class="page">

    <!-- 还没有任何发票 -->
    <van-empty v-if="records.length === 0" description="暂无发票，点击右下角「+」添加" />

    <template v-else>
      <!-- ① 顶部：先选择一张发票 -->
      <div class="picker-card" @click="showInvoiceList = true">
        <div class="pk-main">
          <div class="pk-label">当前发票</div>
          <div class="pk-title">{{ selectedInvoice ? (selectedInvoice.title || '(未命名)') : '请选择发票' }}</div>
          <div class="pk-sub" v-if="selectedInvoice && selectedInvoice.taxNo">税号：{{ selectedInvoice.taxNo }}</div>
        </div>
        <div class="pk-side">
          <van-tag
            v-if="selectedStat.total"
            :type="selectedStat.unexported ? 'warning' : 'success'"
            plain
          >{{ selectedStat.unexported ? `未导出 ${selectedStat.unexported}/${selectedStat.total}` : `已全部导出 ${selectedStat.total}` }}</van-tag>
          <van-tag v-else plain>无关联记录</van-tag>
          <van-icon name="arrow-down" class="pk-arrow" />
        </div>
      </div>

      <template v-if="selectedInvoice">
        <!-- ② 开票主体信息（放大排版，便于手机端查看） -->
        <div class="subject-card">
          <div class="sc-head">
            <div class="sc-title">{{ selectedInvoice.title || '(未命名)' }}</div>
            <span v-if="linkedRefuels.length" class="sc-count">{{ linkedRefuels.length }} 条记录</span>
          </div>

          <div class="sc-list">
            <div class="sc-row">
              <span class="sc-label">税务账号</span>
              <span class="sc-value sc-mono">{{ selectedInvoice.taxNo || '-' }}</span>
            </div>
            <div class="sc-row">
              <span class="sc-label">开户行</span>
              <span class="sc-value">{{ selectedInvoice.bank || '-' }}</span>
            </div>
            <div class="sc-row">
              <span class="sc-label">银行账号</span>
              <span class="sc-value sc-mono">{{ selectedInvoice.account || '-' }}</span>
            </div>
            <div class="sc-row">
              <span class="sc-label">联系电话</span>
              <a
                v-if="selectedInvoice.phone"
                class="sc-value sc-phone"
                :href="'tel:' + selectedInvoice.phone"
              >{{ selectedInvoice.phone }}<van-icon name="phone-o" /></a>
              <span v-else class="sc-value sc-empty">未填写</span>
            </div>
            <div class="sc-row" v-if="selectedInvoice.remark">
              <span class="sc-label">备注</span>
              <span class="sc-value">{{ selectedInvoice.remark }}</span>
            </div>
          </div>

          <div class="sc-actions">
            <van-button size="small" plain type="primary" icon="edit" @click="onEdit(selectedInvoice)">编辑</van-button>
            <van-button size="small" plain type="danger" icon="delete-o" @click="onDelete(selectedInvoice)">删除</van-button>
          </div>
        </div>

        <!-- ③ 关联加油记录：导出状态筛选 + 全选 -->
        <div class="list-bar">
          <div class="filter-tabs">
            <span
              v-for="t in filterTabs"
              :key="t.value"
              :class="['filter-tab', { active: filterType === t.value }]"
              @click="filterType = t.value"
            >{{ t.label }}</span>
          </div>
          <van-checkbox
            v-if="filteredRefuels.length"
            :model-value="allFilteredChecked"
            shape="square"
            class="sel-all"
            @click="toggleSelectAll"
          >全选</van-checkbox>
        </div>

        <van-empty
          v-if="linkedRefuels.length === 0"
          description="该发票暂无关联加油记录（在「加油记录 → 编辑 → 关联发票」中选择）"
        />
        <template v-else>
          <van-empty v-if="filteredRefuels.length === 0" :description="emptyHint" />
          <van-cell-group v-else inset>
            <van-cell
              v-for="r in filteredRefuels"
              :key="r.id"
              clickable
              @click="toggleSelect(r.id)"
            >
              <template #title>
                <div class="rf-title">{{ r.invoiceDate || '未填写开票日期' }}</div>
                <div class="rf-sub">
                  加油 {{ formatDate(r.time, 'YYYY-MM-DD HH:mm') }} · {{ r.fuelType }} ·
                  {{ formatNum(r.volume, 2) }}L · {{ formatMoney(r.cost) }}元
                </div>
                <div :class="['rf-link', { empty: !r.invoiceLink }]">
                  {{ r.invoiceLink || '未填写发票链接' }}
                </div>
              </template>
              <template #right-icon>
                <div class="rf-right">
                  <van-tag
                    :type="r.exported ? 'success' : 'default'"
                    plain
                    @click.stop="onToggleExported(r)"
                  >{{ r.exported ? '已导出' : '未导出' }}</van-tag>
                  <van-checkbox
                    :model-value="selectedIds.has(r.id)"
                    @click.stop="toggleSelect(r.id)"
                  />
                </div>
              </template>
            </van-cell>
          </van-cell-group>
        </template>
      </template>

      <!-- ④ 底部操作条：复制所选为「开票日期：发票链接」 -->
      <div class="copy-bar" v-if="selectedInvoice && linkedRefuels.length">
        <div class="cb-left">
          <div class="cb-count">
            已选 {{ selectedIds.size }} 条<span v-if="selectedIds.size"> · {{ formatMoney(selectedCost) }} 元</span>
          </div>
          <div class="cb-hint">复制格式：开票日期：发票链接</div>
        </div>
        <div class="cb-btns">
          <van-button size="small" plain :disabled="!selectedIds.size" @click="onMarkSelection">
            {{ selectionAllExported ? '标记未导出' : '标记已导出' }}
          </van-button>
          <van-button size="small" type="primary" :disabled="!selectedIds.size" @click="onCopySelected">
            复制{{ selectedIds.size ? `(${selectedIds.size})` : '' }}
          </van-button>
        </div>
      </div>
      <div class="bar-spacer" v-if="selectedInvoice && linkedRefuels.length"></div>
    </template>

    <!-- 发票选择弹层 -->
    <van-popup v-model:show="showInvoiceList" position="bottom" round :style="{ height: '70%' }">
      <div class="pop">
        <div class="pop-header">
          <span>选择发票（{{ records.length }}）</span>
          <van-icon name="cross" @click="showInvoiceList = false" />
        </div>
        <div class="pop-body">
          <van-cell
            v-for="inv in records"
            :key="inv.id"
            clickable
            @click="pickInvoice(inv)"
          >
            <template #title>
              <div class="pi-title">{{ inv.title || '(未命名)' }}</div>
              <div class="pi-sub">{{ inv.taxNo ? '税号：' + inv.taxNo : '未填写税号' }}</div>
            </template>
            <template #right-icon>
              <van-tag
                v-if="statOf(inv.id).total"
                :type="statOf(inv.id).unexported ? 'warning' : 'success'"
                plain
              >{{ statOf(inv.id).unexported ? `未导出 ${statOf(inv.id).unexported}/${statOf(inv.id).total}` : `已全部导出 ${statOf(inv.id).total}` }}</van-tag>
              <van-tag v-else plain>无记录</van-tag>
              <van-icon
                v-if="selectedInvoice && inv.id === selectedInvoice.id"
                name="success"
                class="pi-check"
              />
            </template>
          </van-cell>
        </div>
      </div>
    </van-popup>

    <!-- 新建/编辑发票表单（发票=开票主体，无链接/开票日期/导出状态字段） -->
    <van-popup v-model:show="showForm" position="bottom" round :style="{ height: '80%' }">
      <div class="form-page">
        <van-nav-bar
          :title="editingId ? '编辑发票' : '新建发票'"
          left-text="取消"
          left-arrow
          @click-left="showForm = false"
        >
          <template #right>
            <van-button size="small" type="primary" @click="onSaveInvoice">保存</van-button>
          </template>
        </van-nav-bar>

        <van-form class="form">
          <van-cell-group inset title="开票主体信息">
            <van-field v-model="form.title" label="名称/抬头" placeholder="如：某某有限公司" />
            <van-field v-model="form.taxNo" label="税务账号" placeholder="纳税人识别号" />
            <van-field v-model="form.bank" label="开户行" placeholder="如：中国XX银行XX支行" />
            <van-field v-model="form.account" label="银行账号" placeholder="银行卡号" />
            <van-field v-model="form.phone" label="联系电话" type="tel" placeholder="选填，如 13800138000" clearable />
            <van-field v-model="form.remark" label="备注" type="textarea" rows="2" autosize placeholder="选填" />
          </van-cell-group>

          <div class="form-tip">
            发票链接、开票日期与「是否已导出」属于每条<b>加油记录</b>，在
            「加油记录 → 编辑 → 关联发票」里填写，并可在本页选中记录后批量标记与复制。
          </div>
        </van-form>

        <div class="delete-zone" v-if="editingId">
          <van-button block type="danger" plain icon="delete-o" @click="onDeleteById(editingId)">删除该发票</van-button>
        </div>
      </div>
    </van-popup>
    <!-- 新建发票悬浮按钮（与行程页一致） -->
    <div class="fab" @click="onNew">
      <van-icon name="plus" size="24" color="#fff" />
    </div>
  </div>
</template>

<script setup name="InvoiceView">
import { ref, reactive, computed, watch } from 'vue'
import { showToast, showSuccessToast, showConfirmDialog } from 'vant'
import { useInvoiceStore } from '../../stores/invoice'
import { formatDate, formatNum, formatMoney, formatInvoiceLine } from '../../utils/format'
import { copyText } from '../../utils/clipboard'

const store = useInvoiceStore()
const records = computed(() => store.records)

/* ---------- ① 选择发票 ---------- */
const showInvoiceList = ref(false)
const selectedId = ref('')
// 选中的发票若被删除，自动回退到第一张，避免界面空白
const selectedInvoice = computed(() =>
  records.value.find(r => r.id === selectedId.value) || records.value[0] || null
)
function pickInvoice(inv) {
  selectedId.value = inv.id
  selectedIds.value = new Set()
  showInvoiceList.value = false
}
/** 单张发票下关联加油记录的导出进度（依赖 refuel store，切换状态后自动重算） */
function statOf(id) {
  return store.countRefuelStatus(id)
}
const selectedStat = computed(() =>
  selectedInvoice.value
    ? statOf(selectedInvoice.value.id)
    : { total: 0, exported: 0, unexported: 0 }
)

/* ---------- ③ 关联加油记录 + 导出状态筛选 ---------- */
const linkedRefuels = computed(() =>
  selectedInvoice.value ? store.getRefuels(selectedInvoice.value.id) : []
)
const filterType = ref('all')
const exportedCount = computed(() => linkedRefuels.value.filter(r => r.exported).length)
const unexportedCount = computed(() => linkedRefuels.value.length - exportedCount.value)
const filterTabs = computed(() => [
  { value: 'all', label: `全部 ${linkedRefuels.value.length}` },
  { value: 'unexported', label: `未导出 ${unexportedCount.value}` },
  { value: 'exported', label: `已导出 ${exportedCount.value}` }
])
const filteredRefuels = computed(() => {
  if (filterType.value === 'exported') return linkedRefuels.value.filter(r => r.exported)
  if (filterType.value === 'unexported') return linkedRefuels.value.filter(r => !r.exported)
  return linkedRefuels.value
})
const emptyHint = computed(() =>
  filterType.value === 'exported' ? '该发票下暂无已导出的加油记录' : '该发票下暂无未导出的加油记录'
)

/* ---------- 多选 ---------- */
const selectedIds = ref(new Set())
function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}
const allFilteredChecked = computed(() =>
  filteredRefuels.value.length > 0 &&
  filteredRefuels.value.every(r => selectedIds.value.has(r.id))
)
function toggleSelectAll() {
  if (allFilteredChecked.value) {
    const s = new Set(selectedIds.value)
    filteredRefuels.value.forEach(r => s.delete(r.id))
    selectedIds.value = s
  } else {
    selectedIds.value = new Set([
      ...selectedIds.value,
      ...filteredRefuels.value.map(r => r.id)
    ])
  }
}
/** 只保留当前筛选内可见的选中项，避免"已选 N 条"包含看不见的记录 */
function pruneSelection() {
  const visible = new Set(filteredRefuels.value.map(r => r.id))
  const next = [...selectedIds.value].filter(id => visible.has(id))
  if (next.length !== selectedIds.value.size) selectedIds.value = new Set(next)
}
watch(filterType, pruneSelection)

const selectedRecords = computed(() =>
  linkedRefuels.value.filter(r => selectedIds.value.has(r.id))
)
const selectedCost = computed(() =>
  selectedRecords.value.reduce((sum, r) => sum + Number(r.cost || 0), 0)
)
const selectionAllExported = computed(() =>
  selectedRecords.value.length > 0 && selectedRecords.value.every(r => r.exported)
)

/* ---------- 导出状态切换 ---------- */
function onToggleExported(refuel) {
  const next = store.toggleRefuelExported(refuel.id)
  showToast(next ? '已标记为已导出' : '已标记为未导出')
  pruneSelection()
}

function onMarkSelection() {
  const ids = selectedRecords.value.map(r => r.id)
  if (ids.length === 0) return
  // 全部已导出 → 撤回为未导出；否则统一标记已导出
  const target = !selectionAllExported.value
  const changed = store.setRefuelExported(ids, target)
  showToast(`已标记 ${changed} 条为${target ? '已导出' : '未导出'}`)
  pruneSelection()
}

/* ---------- ④ 复制所选（开票日期：发票链接） ---------- */
async function onCopySelected() {
  const chosen = selectedRecords.value
  if (chosen.length === 0) return
  const lines = chosen.map(r => formatInvoiceLine(r))
  const ok = await copyText(lines.join('\n'))
  if (!ok) {
    showToast('复制失败，请手动复制')
    return
  }
  // 复制即视为已导出（报销进度推进），无需再手动点一次
  const changed = store.setRefuelExported(chosen.map(r => r.id), true)
  const missingLink = chosen.filter(r => !String(r.invoiceLink || '').trim()).length
  showSuccessToast({
    message: `已复制 ${chosen.length} 条${changed ? `，${changed} 条标记为已导出` : ''}` +
      (missingLink ? `\n注意：${missingLink} 条未填写发票链接` : ''),
    duration: 2500
  })
  pruneSelection()
}

/* ---------- 新建/编辑发票 ---------- */
const showForm = ref(false)
const editingId = ref(null)
const form = reactive({ title: '', taxNo: '', bank: '', account: '', phone: '', remark: '' })
function resetForm() {
  Object.assign(form, { title: '', taxNo: '', bank: '', account: '', phone: '', remark: '' })
}
function onNew() {
  editingId.value = null
  resetForm()
  showForm.value = true
}
function onEdit(inv) {
  editingId.value = inv.id
  Object.assign(form, {
    title: inv.title || '',
    taxNo: inv.taxNo || '',
    bank: inv.bank || '',
    account: inv.account || '',
    phone: inv.phone || '',
    remark: inv.remark || ''
  })
  showForm.value = true
}
function onSaveInvoice() {
  if (!form.title.trim()) { showToast('请填写名称/抬头'); return }
  if (!form.taxNo.trim()) { showToast('请填写税务账号'); return }
  const data = {
    title: form.title.trim(),
    taxNo: form.taxNo.trim(),
    bank: form.bank.trim(),
    account: form.account.trim(),
    phone: (form.phone || '').trim(),
    remark: form.remark || ''
  }
  const res = editingId.value ? store.update(editingId.value, data) : store.add(data)
  if (res.success) {
    showSuccessToast(editingId.value ? '已更新' : '已添加')
    showForm.value = false
  } else {
    showToast(res.error || '保存失败')
  }
}
function onDelete(inv) {
  onDeleteById(inv.id)
}
function onDeleteById(id) {
  showConfirmDialog({
    title: '确认删除',
    message: '删除该发票会同时解除与之关联的加油记录的关联（记录本身保留），此操作不可恢复。'
  }).then(() => {
    store.remove(id)
    if (selectedId.value === id) selectedId.value = ''
    showSuccessToast('已删除')
    showForm.value = false
  }).catch(() => {})
}
</script>

<style scoped>
/* 顶部发票选择器 */
.picker-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 12px 4px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #1989fa 0%, #2c8cff 100%);
  color: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(25, 137, 250, 0.25);
  cursor: pointer;
}
.pk-label { font-size: 11px; opacity: 0.85; }
.pk-title { font-size: 16px; font-weight: 600; margin-top: 2px; }
.pk-sub { font-size: 11px; opacity: 0.85; margin-top: 2px; }
.pk-side { display: flex; align-items: center; gap: 6px; }
.pk-side :deep(.van-tag--plain) {
  background: rgba(255, 255, 255, 0.9);
  border-color: transparent;
}
.pk-arrow { color: #fff; }

/* 列表操作条 */
.list-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 12px 4px;
  padding: 8px 10px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.filter-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-tab {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 12px;
  background: #f7f8fa;
  color: #646566;
  cursor: pointer;
  transition: all 0.2s;
}
.filter-tab.active { background: #1989fa; color: #fff; font-weight: 500; }
.sel-all { margin-left: auto; font-size: 12px; }

/* 记录项 */
.rf-title { font-size: 14px; color: #323233; font-weight: 500; }
.rf-sub { font-size: 12px; color: #969799; margin-top: 2px; }
.rf-link { font-size: 11px; color: #1989fa; margin-top: 2px; word-break: break-all; }
.rf-link.empty { color: #c8c9cc; }
.rf-right { display: flex; align-items: center; gap: 8px; }

/* 底部复制条 */
.copy-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: #fff;
  border-top: 1px solid #ebedf0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  z-index: 20;
}
.cb-count { font-size: 13px; font-weight: 600; color: #323233; }
.cb-hint { font-size: 11px; color: #969799; }
.cb-btns { display: flex; gap: 8px; }
.bar-spacer { height: 60px; }

/* 选择弹层 */
.pop { height: 100%; display: flex; flex-direction: column; }
.pop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid #f2f3f5;
}
.pop-body { flex: 1; overflow-y: auto; padding-bottom: 20px; }
.pi-title { font-size: 14px; color: #323233; font-weight: 500; }
.pi-sub { font-size: 12px; color: #969799; margin-top: 2px; }
.pi-check { color: #07c160; margin-left: 8px; font-size: 16px; }

/* 开票主体卡片（放大排版，手机端更易读） */
.subject-card {
  margin: 10px 12px 4px;
  padding: 16px 16px 14px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.sc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px dashed #ebedf0;
}
.sc-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  color: #323233;
  word-break: break-word;
}
.sc-count {
  flex-shrink: 0;
  font-size: 12px;
  color: #969799;
}
.sc-list { padding-top: 2px; }
.sc-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
}
.sc-row + .sc-row { border-top: 1px solid #f5f6f7; }
.sc-label {
  flex-shrink: 0;
  width: 76px;
  font-size: 13px;
  line-height: 1.6;
  color: #969799;
}
.sc-value {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.55;
  color: #323233;
  word-break: break-all;
}
/* 税号、银行账号用等宽字体 + 数字对齐，长串更好辨认 */
.sc-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
  letter-spacing: 0.4px;
  font-variant-numeric: tabular-nums;
}
.sc-phone {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #1989fa;
  font-weight: 600;
  font-size: 16px;
  text-decoration: none;
}
.sc-phone .van-icon { font-size: 15px; }
.sc-empty { color: #c8c9cc; font-weight: 400; }
.sc-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  padding-top: 12px;
  border-top: 1px solid #f2f3f5;
}
.sc-actions .van-button { flex: 1; }

/* 表单 */
.form-page { height: 100%; }
.form { padding: 10px 0; }
.form-tip {
  margin: 12px 16px;
  font-size: 12px;
  color: #969799;
  line-height: 1.6;
}
.delete-zone { margin: 16px 12px 24px; }
.fab {
  position: fixed; right: 20px; bottom: 80px;
  width: 52px; height: 52px; border-radius: 50%;
  background: #07c160;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(7, 193, 96, 0.4);
  z-index: 100;
}
</style>
