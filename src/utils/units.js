/**
 * 油耗单位换算工具
 *
 * 设计约定：内部统一以 L/100km 存储与计算（与 calc.js 保持一致）。
 * 展示层根据用户在"设置"中选择的 unit 做换算，使"油耗单位"设置真正生效，
 * 而不是像此前那样可选却对任何界面都不产生作用。
 */

// 可选单位（与设置页选择器一致；保留原 'L/km' 选项以向后兼容已存设置）
export const FUEL_UNITS = [
  { text: 'L/100km', value: 'L/100km' },
  { text: 'L/km', value: 'L/km' },
  { text: 'km/L', value: 'km/L' }
]

// 各单位的默认小数位（L/km 数值很小，需更多小数位才能看清）
const DIGITS = {
  'L/100km': 2,
  'L/km': 4,
  'km/L': 2
}

/**
 * 将内部 L/100km 数值换算为目标单位
 * @param {number} valueL100km 内部油耗值（L/100km）
 * @param {string} toUnit 目标单位（FUEL_UNITS 之一）
 * @returns {number|null} 换算后数值；km/L 且原值为 0 时返回 null（无法行驶）
 */
export function convertFuel(valueL100km, toUnit) {
  const v = Number(valueL100km)
  if (v === null || v === undefined || isNaN(v)) return null
  switch (toUnit) {
    case 'L/km':
      return v / 100
    case 'km/L':
      return v > 0 ? 100 / v : null
    case 'L/100km':
    default:
      return v
  }
}

/**
 * 格式化展示油耗：先换算再按单位取合适小数位
 * @param {number} valueL100km 内部油耗值（L/100km）
 * @param {string} unit 目标单位
 * @param {number} [digits] 覆盖默认小数位
 * @returns {string} 如 '8.50'（不含单位后缀，单位由调用方拼接）
 */
export function formatFuel(valueL100km, unit, digits) {
  const converted = convertFuel(valueL100km, unit)
  if (converted === null || isNaN(converted)) return '-'
  const d = digits != null ? digits : (DIGITS[unit] ?? 2)
  return Number(converted).toFixed(d)
}
