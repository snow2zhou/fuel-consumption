import { ref, computed } from 'vue'
import { utcMonthsAgoRange } from '../utils/date'

/**
 * 列表筛选 + 分页 共用 composable
 *
 * 筛选类型：
 * - 'recent10'  默认：最近10条（按时间倒序）
 * - 'month1'    最近一月
 * - 'month3'    最近三月
 * - 'all'       全部
 * - 'custom'    自定义日期区间
 *
 * @param {Function} getSourceList  返回响应式全量列表的函数（按时间倒序）
 * @param {Object}   options        { defaultPageSize: 默认每页条数(10) }
 */
export function useListFilter(getSourceList, options = {}) {
  const defaultPageSize = options.defaultPageSize || 10

  // 当前筛选类型
  const filterType = ref('recent10')
  // 自定义日期区间（ISO 字符串，仅 filterType='custom' 时使用）
  const customStart = ref(null) // YYYY-MM-DD 00:00:00
  const customEnd = ref(null)   // YYYY-MM-DD 23:59:59
  // 当前已加载的条数（用于"加载更多"）
  const loadedSize = ref(defaultPageSize)

  /**
   * 按筛选条件过滤后的全量列表（不含分页）
   * 注意：输入 getSourceList() 假定按时间倒序，输出保持倒序
   */
  const filteredList = computed(() => {
    const all = getSourceList() || []
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
        const s = new Date(customStart.value)
        s.setHours(0, 0, 0, 0)
        const e = new Date(customEnd.value)
        e.setHours(23, 59, 59, 999)
        return all.filter(r => {
          const t = new Date(r.time)
          return t >= s && t <= e
        })
      }
      case 'recent10':
      default:
        return all
    }
  })

  // 实际可见列表（应用分页）
  const visibleList = computed(() => filteredList.value.slice(0, loadedSize.value))

  const totalCount = computed(() => filteredList.value.length)
  const visibleCount = computed(() => visibleList.value.length)
  const hasMore = computed(() => visibleList.value.length < filteredList.value.length)

  function loadMore() {
    if (hasMore.value) {
      loadedSize.value += defaultPageSize
    }
  }

  /**
   * 切换筛选类型
   * @param {String} type 'recent10' | 'month1' | 'month3' | 'all' | 'custom'
   * @param {Object} payload { start, end } 仅 type='custom' 时需要，ISO 字符串或 YYYY-MM-DD
   */
  function setFilter(type, payload = {}) {
    filterType.value = type
    if (type === 'custom') {
      customStart.value = payload.start || null
      customEnd.value = payload.end || null
    }
    // 切换筛选时重置分页
    loadedSize.value = defaultPageSize
  }

  return {
    filterType,
    customStart,
    customEnd,
    loadedSize,
    filteredList,
    visibleList,
    totalCount,
    visibleCount,
    hasMore,
    loadMore,
    setFilter
  }
}
