/**
 * 应用内油价提醒
 *
 * 纯前端 PWA 没有服务端推送，因此"提醒"只能在打开 App 时检查：
 * 若今天是调价窗口日或前一天，且本轮还没提醒过，就弹一次对话框。
 * 每个调价窗口（以生效时刻 adj.at 为键）只提醒一次。
 */
import { showConfirmDialog } from 'vant'
import { settingsRepo } from '../api/storage'
import { fetchOilPrice } from '../api/oilPrice'
import { adjustmentDayLabel, judgeDirection, perTonToPerLiter, fuelKindOf } from '../utils/oilPrice'

const FLAG_PREFIX = 'fc_oil_reminded_'

/**
 * 检查并弹出提醒（失败静默，不打扰用户）
 * @returns {Promise<boolean>} 是否真的弹了提醒
 */
export async function maybeShowOilReminder() {
  try {
    const s = settingsRepo.get()
    if (!s.oilRemind || !s.oilProvince) return false

    const res = await fetchOilPrice(s.oilProvince)
    if (!res.ok || !res.data || !res.data.nextAdjustment) return false

    const adj = res.data.nextAdjustment
    const dayLabel = adjustmentDayLabel(adj)
    if (!dayLabel || dayLabel === '昨日已调价') return false

    const flag = FLAG_PREFIX + adj.at
    if (localStorage.getItem(flag)) return false
    localStorage.setItem(flag, '1')

    const f = res.data.forecast || {}
    const dir = judgeDirection(f.perTon)
    const perLiter = perTonToPerLiter(f.perTon, fuelKindOf(s.preferredFuelType))
    const cap = Number(s.tankCapacity) || 50

    let tip = '本轮测算暂未公布，可打开油价页查看。'
    if (perLiter !== null && dir === 'up') {
      tip = `预计上调约 ${Math.abs(perLiter).toFixed(2)} 元/升，加满 ${cap}L 约多花 ${(Math.abs(perLiter) * cap).toFixed(0)} 元；建议调价前加满。`
    } else if (perLiter !== null && dir === 'down') {
      tip = `预计下调约 ${Math.abs(perLiter).toFixed(2)} 元/升，可以等调价后再加（加满约省 ${(Math.abs(perLiter) * cap).toFixed(0)} 元）。`
    } else if (dir === 'flat') {
      tip = '本轮预计搁浅（不足 50 元/吨），价格基本不变，随时加都可以。'
    }

    showConfirmDialog({
      title: '油价提醒',
      message: `${dayLabel}（${s.oilProvince} · ${s.preferredFuelType || '92#'}）\n\n${tip}`,
      confirmButtonText: '知道了',
      showCancelButton: false
    }).catch(() => {})

    return true
  } catch (e) {
    return false
  }
}
