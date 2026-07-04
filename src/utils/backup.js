/**
 * 全量数据导入导出工具
 * 数据格式：JSON（包含加油记录、行程快照、设置）
 * 用于跨设备/跨程序数据迁移
 */
import { exportAllData, importAllData } from '../api/storage'
import { formatDate } from './format'

/**
 * 导出全部数据为 JSON 文件
 */
export function downloadAllDataJson() {
  const data = exportAllData()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const fileName = `油耗记录_全量数据_${formatDate(new Date(), 'YYYYMMDD_HHmm')}.json`
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { fileName, recordCount: data.refuelRecords.length + data.tripRecords.length }
}

/**
 * 从 File 对象读取并导入数据
 * @param {File} file
 * @param {Object} options { merge: 是否合并(默认false=覆盖) }
 */
export function importDataFromFile(file, options = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('未选择文件'))
      return
    }
    if (!/\.json$/i.test(file.name)) {
      reject(new Error('请选择 .json 格式的文件'))
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result)
        const result = importAllData(data, options)
        if (!result.success) {
          reject(new Error(result.error || '导入失败'))
          return
        }
        resolve(result)
      } catch (err) {
        reject(new Error('JSON 解析失败，文件格式可能不正确'))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file, 'utf-8')
  })
}
