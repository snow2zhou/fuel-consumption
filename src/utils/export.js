/**
 * Excel 导出工具（基于 SheetJS / xlsx）
 */
import * as XLSX from 'xlsx'
import { formatDate, formatNum, formatMoney } from './format'

/**
 * 导出加油记录到 Excel
 */
export function exportRefuelExcel(listWithComp) {
  // 按时间正序输出（从早到晚，便于阅读）
  const sorted = [...listWithComp].sort((a, b) => new Date(a.time) - new Date(b.time))

  const rows = sorted.map((r, idx) => {
    const c = r.comparison || {}
    return {
      '序号': idx + 1,
      '加油时间': formatDate(r.time),
      '油号': r.fuelType || '',
      '加油量(L)': Number(r.volume || 0),
      '油价(元/L)': Number(r.price || 0),
      '费用(元)': Number(r.cost || 0),
      '总行驶里程(km)': Number(r.totalMileage || 0),
      '是否加满': r.isFull ? '是' : '否',
      '预计可行驶里程(km)': Number(r.estimatedRange || 0),
      '间驶里程(km)': c.calculable ? Number(c.intervalMileage) : '',
      '百公里油耗(L/100km)': c.calculable ? Number(formatNum(c.fuelPer100km, 2)) : '',
      '每公里费用(元/km)': c.calculable ? Number(formatNum(c.costPerKm, 3)) : '',
      '期间总费用(元)': c.calculable ? Number(formatMoney(c.totalCost)) : '',
      '备注': r.remark || ''
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  // 列宽
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 14 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 20 }
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '加油记录')
  const fileName = `加油记录_${formatDate(new Date(), 'YYYYMMDD_HHmm')}.xlsx`
  XLSX.writeFile(wb, fileName)
  return fileName
}

/**
 * 导出行程快照记录到 Excel
 */
export function exportTripExcel(list) {
  const sorted = [...list].sort((a, b) => new Date(a.time) - new Date(b.time))

  const rows = sorted.map((r, idx) => ({
    '序号': idx + 1,
    '记录时间': formatDate(r.time),
    '总行驶里程(km)': Number(r.totalMileage || 0),
    '本次行驶里程(km)': Number(r.tripMileage || 0),
    '估计可行驶里程(km)': Number(r.estimatedRange || 0),
    '估计总行驶里程(km)': Number(r.totalMileage || 0) + Number(r.estimatedRange || 0),
    '备注': r.remark || ''
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 20 }
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '行程快照')
  const fileName = `行程快照_${formatDate(new Date(), 'YYYYMMDD_HHmm')}.xlsx`
  XLSX.writeFile(wb, fileName)
  return fileName
}
