/**
 * 复制文本到剪贴板，带降级方案。
 *
 * 优先使用 navigator.clipboard.writeText（需安全上下文：https 或 localhost）。
 * 在部分安卓 WebView / 非安全上下文 / 旧浏览器中 clipboard API 不可用，
 * 降级到临时 textarea + document.execCommand('copy')。
 *
 * @param {string} text 待复制文本
 * @returns {Promise<boolean>} 是否复制成功
 */
export async function copyText(text) {
  if (!text) return false

  // 优先：Clipboard API
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    // 落到降级方案
  }

  // 降级：textarea + execCommand
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.left = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) {
    return false
  }
}
