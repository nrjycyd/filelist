import type { ComputedRef, Ref } from 'vue'
import type { FNode } from './tree'
import type { Row } from './useRows'
import { computed, nextTick, ref } from 'vue'
import { isMore } from './useRows'

/** A row's key: its path, or `more:<folder>` for a folder's “more” row. */
export function rowKey(row: Row): string {
  return isMore(row) ? `more:${row.key}` : row.path
}

const TYPEAHEAD_MS = 600
const PAGE = 10

/**
 * Keyboard model of the list, after the WAI-ARIA treegrid pattern. The list
 * is one Tab stop: the current row. Arrow keys move between rows and open or
 * close folders, → / ← go in and out of a row's buttons, Space ticks, Enter
 * opens, typing jumps to a name, Ctrl / ⌘ + A ticks everything. The controls
 * inside rows are left out of the Tab order (tabindex -1) but still work with
 * a mouse or touch.
 */
export function useKeyboard(options: {
  /** The treegrid element. */
  grid: Ref<HTMLElement | undefined>
  rows: ComputedRef<Row[]>
  toggleExpand: (node: FNode) => unknown
  /** Enter on a file: preview when it can, else download. */
  open: (node: FNode) => unknown
  /** Enter on a “more” row: the next page. */
  showNext: (row: Row) => unknown
  /** Ctrl / ⌘ + A: tick everything, or untick when all is ticked. */
  toggleAll: () => unknown
}) {
  const { grid, rows } = options

  /** The row that holds the Tab stop. */
  const activeKey = ref<string | null>(null)
  /** The key hint in the footer: only while keyboard focus is in the list. */
  const keyboardInside = ref(false)

  const byKey = computed(() => new Map(rows.value.map((row) => [rowKey(row), row])))
  const tabKey = computed(() => {
    const key = activeKey.value
    if (key && byKey.value.has(key)) return key
    return rows.value.length ? rowKey(rows.value[0]) : null
  })

  function rowTabIndex(row: Row): 0 | -1 {
    return rowKey(row) === tabKey.value ? 0 : -1
  }

  /* ---------------- DOM helpers ---------------- */

  function rowEls(): HTMLElement[] {
    return [...(grid.value?.querySelectorAll<HTMLElement>('[data-key]') ?? [])]
  }

  function rowElOf(el: Element | null): HTMLElement | null {
    const row = el?.closest<HTMLElement>('[data-key]')
    return row && grid.value?.contains(row) ? row : null
  }

  function levelOf(el: HTMLElement): number {
    return Number(el.getAttribute('aria-level')) || 1
  }

  /** Buttons reached with → : a file's preview / download, a “more” row's links. */
  function cellsOf(row: HTMLElement): HTMLElement[] {
    return [...row.querySelectorAll<HTMLElement>('.fl-preview-btn, .fl-download, .fl-more-link')]
      .filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0)
  }

  function focusRow(row: HTMLElement | null | undefined) {
    if (!row) return
    activeKey.value = row.dataset.key ?? null
    row.focus()
  }

  /** After opening a folder, focus its first child once it is on screen. */
  async function focusFirstChild(row: HTMLElement) {
    const key = row.dataset.key
    for (let i = 0; i < 40; i++) {
      await nextTick()
      const fresh = rowEls()
      const at = fresh.findIndex((el) => el.dataset.key === key)
      const next = fresh[at + 1]
      if (next && levelOf(next) > levelOf(fresh[at])) return focusRow(next)
      if (i > 2) await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  /* ---------------- type-ahead ---------------- */

  let typed = ''
  let typedAt = 0

  function nameOf(row: HTMLElement): string {
    return (row.querySelector('.fl-name')?.textContent ?? '').trim().toLocaleLowerCase()
  }

  function typeAhead(char: string, current: HTMLElement) {
    const now = Date.now()
    typed = now - typedAt > TYPEAHEAD_MS ? char : typed + char
    typedAt = now
    const all = rowEls().filter((el) => el.querySelector('.fl-name'))
    if (!all.length) return
    const start = all.indexOf(current)
    // The same letter again cycles through the names starting with it.
    const repeat = typed.length > 1 && [...typed].every((c) => c === typed[0])
    const query = repeat ? typed[0] : typed
    const from = repeat || typed.length === 1 ? start + 1 : start
    for (let i = 0; i < all.length; i++) {
      const row = all[(from + i + all.length) % all.length]
      if (nameOf(row).startsWith(query)) return focusRow(row)
    }
  }

  /* ---------------- keys ---------------- */

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    if (target.matches('input:not([type="checkbox"]), select, textarea')) return
    const row = rowElOf(target)
    if (!row) return
    const onRow = target === row
    const key = row.dataset.key!
    const item = byKey.value.get(key)
    const all = rowEls()
    const at = all.indexOf(row)
    const mod = event.ctrlKey || event.metaKey
    let handled = true

    if (mod && !event.altKey && event.key.toLowerCase() === 'a') {
      // Only when the keyboard put focus here; a mouse user keeps the
      // browser's own “select all”.
      if (target.matches(':focus-visible')) options.toggleAll()
      else handled = false
    }
    else if (event.key === 'ArrowDown') focusRow(all[at + 1])
    else if (event.key === 'ArrowUp') focusRow(all[at - 1])
    else if (event.key === 'Home') focusRow(all[0])
    else if (event.key === 'End') focusRow(all.at(-1))
    else if (event.key === 'PageDown') focusRow(all[Math.min(at + PAGE, all.length - 1)])
    else if (event.key === 'PageUp') focusRow(all[Math.max(at - PAGE, 0)])
    else if (event.key === 'ArrowRight') {
      if (!onRow) {
        const cells = cellsOf(row)
        cells[cells.indexOf(target) + 1]?.focus()
      }
      else if (item && !isMore(item) && item.is_dir) {
        if (item.lock || !item.expanded) void options.toggleExpand(item)
        else void focusFirstChild(row)
      }
      else cellsOf(row)[0]?.focus()
    }
    else if (event.key === 'ArrowLeft') {
      const cells = cellsOf(row)
      if (!onRow && cells.indexOf(target) > 0) cells[cells.indexOf(target) - 1].focus()
      else if (!onRow) focusRow(row)
      else if (item && !isMore(item) && item.is_dir && item.expanded) void options.toggleExpand(item)
      else {
        const level = levelOf(row)
        for (let i = at - 1; i >= 0; i--) {
          if (levelOf(all[i]) < level) {
            focusRow(all[i])
            break
          }
        }
      }
    }
    else if (onRow && (event.key === ' ' || event.key === 'Spacebar')) {
      const box = row.querySelector<HTMLInputElement>('.fl-cell-check input')
      if (box && !box.disabled) box.click()
    }
    else if (onRow && event.key === 'Enter') {
      if (!item) handled = false
      else if (isMore(item)) void options.showNext(item)
      else if (item.is_dir) void options.toggleExpand(item)
      else void options.open(item)
    }
    else if (onRow && event.key.length === 1 && !mod && !event.altKey && event.key !== ' ') {
      typeAhead(event.key.toLocaleLowerCase(), row)
    }
    else handled = false

    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  /** Any focus inside a row makes it the Tab stop; the hint follows keyboard focus. */
  function onFocusin(event: FocusEvent) {
    const target = event.target as HTMLElement
    const row = rowElOf(target)
    if (row) activeKey.value = row.dataset.key ?? null
    keyboardInside.value = !!row && target.matches(':focus-visible')
  }

  function onFocusout(event: FocusEvent) {
    const next = event.relatedTarget as HTMLElement | null
    if (!next || !rowElOf(next)) keyboardInside.value = false
  }

  /** A pointer inside the list ends the keyboard hint. */
  function onPointerdown() {
    keyboardInside.value = false
  }

  return { rowTabIndex, onKeydown, onFocusin, onFocusout, onPointerdown, keyboardInside }
}
