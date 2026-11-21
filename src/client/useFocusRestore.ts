import type { Ref } from 'vue'

interface FocusSpot {
  el: HTMLElement
  spot: 'search' | 'bar' | 'row' | 'more' | 'pin' | 'deep' | 'other'
  key?: string
}

/**
 * Keep keyboard focus inside the list when the focused control disappears after
 * its own action (“show all”, “clear”, unlocking a folder, “Stop”…).
 */
export function useFocusRestore(rootEl: Ref<HTMLElement | undefined>) {
  let lastFocus: FocusSpot | null = null

  function onFocusIn(event: FocusEvent) {
    const el = event.target
    if (!(el instanceof HTMLElement) || el.closest('dialog')) {
      lastFocus = null
      return
    }
    const row = el.closest<HTMLElement>('[data-path]')
    const more = el.closest<HTMLElement>('.fl-more')
    const pin = el.closest<HTMLElement>('[data-pin]')
    if (row) lastFocus = { el, spot: 'row', key: row.dataset.key }
    else if (more) lastFocus = { el, spot: 'more', key: (more.previousElementSibling as HTMLElement | null)?.dataset.key }
    else if (pin) lastFocus = { el, spot: 'pin', key: pin.dataset.pin }
    else if (el.closest('.fl-deep')) lastFocus = { el, spot: 'deep' }
    else if (el.closest('.fl-search')) lastFocus = { el, spot: 'search' }
    else if (el.closest('.fl-bar')) lastFocus = { el, spot: 'bar' }
    else lastFocus = { el, spot: 'other' }
  }

  function onFocusOut(event: FocusEvent) {
    const el = event.target
    setTimeout(() => {
      if (lastFocus?.el === el && (el as HTMLElement).isConnected) lastFocus = null
    })
  }

  function restoreFocus() {
    const last = lastFocus
    const root = rootEl.value
    if (!last || !root || last.el.isConnected) return
    const active = document.activeElement
    lastFocus = null
    if (active && active !== document.body && active !== document.documentElement) return
    const find = (selector: string) => root.querySelector<HTMLElement>(selector)
    const rowAt = (key?: string) =>
      key === undefined ? null : root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
    const inRow = (row: Element | null | undefined) =>
      row instanceof HTMLElement && row.dataset.key !== undefined ? row : null
    let target: HTMLElement | null = null
    if (last.spot === 'row' || last.spot === 'pin') target = inRow(rowAt(last.key))
    else if (last.spot === 'more') target = inRow(rowAt(last.key)?.nextElementSibling)
    else if (last.spot === 'deep') target = find('.fl-deep button') ?? find('.fl-search input')
    else if (last.spot === 'search') target = find('.fl-search input')
    else if (last.spot === 'bar') target = find('.fl-zip-cancel') ?? find('.fl-bar .fl-btn-primary')
    target ??= find('.fl-head input[type="checkbox"]:not(:disabled)') ?? find('.fl-search input')
    target?.focus()
  }

  return { onFocusIn, onFocusOut, restoreFocus }
}
