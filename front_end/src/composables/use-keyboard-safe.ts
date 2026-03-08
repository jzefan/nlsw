import { onMounted, onUnmounted } from 'vue'

const MOBILE_WIDTH = 768

/**
 * 移动端虚拟键盘安全处理
 *
 * 解决的问题：手机键盘弹出后，输入框被挤出可视区域，用户看不到输入内容。
 *
 * 工作原理：
 * 1. 通过 visualViewport API 追踪实际可视区域，设置 CSS 变量 --visual-vh / --visual-vt
 * 2. CSS 利用这些变量将 dialog 定位和限高到可视区域内
 * 3. 键盘弹出时自动将聚焦的输入框滚动到可视区域中央
 */
export function useKeyboardSafe() {
  if (typeof window === 'undefined') return

  let prevHeight = 0
  let scrollTimer: ReturnType<typeof setTimeout> | null = null

  function updateCssVars() {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    root.style.setProperty('--visual-vh', `${vv.height}px`)
    root.style.setProperty('--visual-vt', `${vv.offsetTop}px`)
  }

  function handleViewportResize() {
    const vv = window.visualViewport
    if (!vv) return

    updateCssVars()

    if (window.innerWidth >= MOBILE_WIDTH) {
      prevHeight = vv.height
      return
    }

    // 高度减少超过 100px，判定为键盘弹出
    const keyboardOpened = prevHeight - vv.height > 100
    prevHeight = vv.height

    if (keyboardOpened) {
      scheduleScrollToFocused()
    }
  }

  function handleViewportScroll() {
    // iOS 上键盘弹出时 visualViewport 会 scroll，需要同步更新偏移量
    updateCssVars()
  }

  function scheduleScrollToFocused() {
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || !isInputElement(el)) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }

  // focusin 事件兜底：部分浏览器 focus 时 viewport 不会立即 resize
  function handleFocusIn(e: FocusEvent) {
    if (window.innerWidth >= MOBILE_WIDTH) return
    const el = e.target as HTMLElement
    if (!isInputElement(el)) return

    // 等待键盘动画结束后再滚动
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  function isInputElement(el: HTMLElement) {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      || el.getAttribute('contenteditable') === 'true'
      || el.getAttribute('role') === 'combobox'
  }

  onMounted(() => {
    const vv = window.visualViewport
    prevHeight = vv?.height ?? window.innerHeight
    updateCssVars()

    if (vv) {
      vv.addEventListener('resize', handleViewportResize)
      vv.addEventListener('scroll', handleViewportScroll)
    }
    document.addEventListener('focusin', handleFocusIn)
  })

  onUnmounted(() => {
    const vv = window.visualViewport
    if (vv) {
      vv.removeEventListener('resize', handleViewportResize)
      vv.removeEventListener('scroll', handleViewportScroll)
    }
    document.removeEventListener('focusin', handleFocusIn)
    if (scrollTimer) clearTimeout(scrollTimer)
  })
}
