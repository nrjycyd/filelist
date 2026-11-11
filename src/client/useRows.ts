import type { Ref } from 'vue'
import type { ListContext } from './context'
import type { FNode } from './tree'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { isWithin } from './utils'

/** The row closing a long folder while its children are cut at `pageSize`. */
export interface MoreRow {
  more: true
  /** Folder path (the listed folder's path for top-level rows). */
  key: string
  depth: number
  remaining: number
}

export type Row = FNode | MoreRow

/**
 * A folder showing more than its first page: while the reader scrolls through
 * it, its row is pinned at the top with “show less”.
 */
export interface LongFolder {
  key: string
  /** Depth of the folder's own row (-1 for the top level of a single path). */
  depth: number
  shown: number
  total: number
  /** Path of the last row in the folder, so we know when we are past it. */
  last: string
}

export function isMore(row: Row): row is MoreRow {
  return 'more' in row
}

/**
 * The rows on screen: the tree flattened through the filter, long folders cut
 * at `pageSize` with a closing “more” row, and the pinned folder row while the
 * reader scrolls through a long folder. Also measures the theme's fixed bars.
 */
export function useRows(
  ctx: ListContext,
  options: {
    roots: Ref<FNode[]>
    keyword: Ref<string>
    deepMode: Ref<boolean>
  },
) {
  const { props, rootEl } = ctx
  const { roots, keyword, deepMode } = options

  /* ---------------- long folders ---------------- */

  /** Rows shown per folder, beyond the first page; kept across refreshes. */
  const shown = reactive(new Map<string, number>())

  function pageSizeOf(): number {
    return Math.max(0, Math.floor(props.pageSize ?? 15))
  }

  function limitOf(key: string): number {
    const size = pageSizeOf()
    return size ? (shown.get(key) ?? size) : Number.POSITIVE_INFINITY
  }

  function showMore(row: MoreRow, all: boolean) {
    const size = Math.max(1, pageSizeOf())
    shown.set(row.key, all ? Number.POSITIVE_INFINITY : limitOf(row.key) + size)
  }

  /** Every folder (or those inside `folder`) back to its first page. */
  function resetShown(folder?: string) {
    if (folder === undefined) shown.clear()
    else for (const key of [...shown.keys()]) if (isWithin(key, folder)) shown.delete(key)
  }

  /** Back to the first page; the folder's row (or the list's top) comes back into view. */
  async function showLess(key: string) {
    shown.delete(key)
    pinned.value = null
    await nextTick()
    const root = rootEl.value
    if (!root) return
    const target = rowElement(key) ?? root
    // Rows keep `scroll-margin-top` clear of the sticky bars.
    if (target.getBoundingClientRect().top < stickyTop.value) target.scrollIntoView({ block: 'start' })
  }

  const layout = computed(() => {
    const out: Row[] = []
    const long: LongFolder[] = []
    const query = keyword.value.trim().toLowerCase()
    const size = pageSizeOf()
    // In deep search mode a locked folder may hide matches: show it so it can be unlocked.
    const matches = (node: FNode): boolean =>
      !query ||
      node.name.toLowerCase().includes(query) ||
      (node.is_dir && (node.children.some(matches) || (deepMode.value && !!node.lock)))
    const walk = (nodes: FNode[], key: string, depth: number) => {
      const list = nodes.filter(matches)
      // A filter shows every match: a cut list could hide the one searched for.
      const limit = query ? list.length : Math.min(list.length, limitOf(key))
      for (const node of list.slice(0, limit)) {
        out.push(node)
        if (node.is_dir && (node.expanded || query) && node.children.length) walk(node.children, node.path, node.depth + 1)
      }
      if (limit < list.length) out.push({ more: true, key, depth, remaining: list.length - limit })
      let end = out.length - 1
      while (end >= 0 && isMore(out[end])) end -= 1
      const last = out[end]
      if (!query && size > 0 && limit > size && last && !isMore(last)) {
        long.push({ key, depth: depth - 1, shown: limit, total: list.length, last: last.path })
      }
    }
    walk(roots.value, props.sources.length ? '' : props.path, 0)
    return { rows: out, long }
  })

  const rows = computed(() => layout.value.rows)
  const visible = computed<FNode[]>(() => rows.value.filter((row): row is FNode => !isMore(row)))

  /* ---------------- pinned folder row ---------------- */

  const pinned = ref<LongFolder | null>(null)
  /** Height of the sticky selection bar above the pinned row (narrow lists only). */
  const pinOffset = ref(0)

  function rowElement(path: string): HTMLElement | undefined {
    return [...(rootEl.value?.querySelectorAll<HTMLElement>('[data-path]') ?? [])].find((el) => el.dataset.path === path)
  }

  /** The pinned folder's name: its own, or for a single path's top level, the list's title. */
  const pinnedName = computed(() => {
    const folder = pinned.value
    if (!folder) return ''
    if (folder.depth < 0) return props.title || folder.key.split('/').filter(Boolean).pop() || '/'
    const find = (nodes: FNode[]): FNode | undefined => {
      for (const node of nodes) {
        if (node.path === folder.key) return node
        const inner = isWithin(folder.key, node.path) ? find(node.children) : undefined
        if (inner) return inner
      }
    }
    return find(roots.value)?.name ?? ''
  })

  /** Pin the innermost long folder whose own row has scrolled away while its files are still on screen. */
  function updatePin() {
    const root = rootEl.value
    if (!root) return
    const bar = root.querySelector<HTMLElement>('.fl-bar')
    pinOffset.value = bar && getComputedStyle(bar).position === 'sticky' ? bar.offsetHeight : 0
    const top = stickyTop.value + pinOffset.value
    const rowHeight = root.querySelector<HTMLElement>('.fl-head')?.offsetHeight ?? 40
    let found: LongFolder | null = null
    for (const folder of layout.value.long) {
      const head = folder.depth < 0 ? root.querySelector<HTMLElement>('.fl-head') : rowElement(folder.key)
      const last = rowElement(folder.last)
      if (!head || !last) continue
      const inside = head.getBoundingClientRect().bottom <= top && last.getBoundingClientRect().bottom > top + rowHeight
      if (inside && (!found || folder.depth > found.depth)) found = folder
    }
    pinned.value = found
  }

  let pinFrame = 0
  function schedulePin() {
    if (pinFrame) return
    pinFrame = requestAnimationFrame(() => {
      pinFrame = 0
      updatePin()
    })
  }

  watch(layout, () => void nextTick(schedulePin))

  /* ---------------- the theme's fixed bars ---------------- */

  /*
   * In narrow containers the selection bar sticks below the theme's fixed bars.
   * VitePress 1 and 2 pin different bars at different widths, so measure them.
   * `--fl-sticky-top` on the component overrides the measured value.
   */
  const stickyTop = ref(0)

  function measureStickyTop() {
    let top = 0
    for (const el of document.querySelectorAll<HTMLElement>('.VPNav, .VPLocalNav')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || (style.position !== 'fixed' && style.position !== 'sticky')) continue
      top = Math.max(top, (Number.parseFloat(style.top) || 0) + el.offsetHeight)
    }
    stickyTop.value = top
  }

  /** Called from the component's `onMounted`. */
  function mount() {
    measureStickyTop()
    window.addEventListener('resize', measureStickyTop, { passive: true })
    window.addEventListener('scroll', schedulePin, { passive: true })
    window.addEventListener('resize', schedulePin, { passive: true })
  }

  /** Called from the component's `onBeforeUnmount`. */
  function unmount() {
    window.removeEventListener('resize', measureStickyTop)
    window.removeEventListener('scroll', schedulePin)
    window.removeEventListener('resize', schedulePin)
    cancelAnimationFrame(pinFrame)
  }

  return {
    showMore,
    showLess,
    resetShown,
    rows,
    visible,
    pinned,
    pinOffset,
    pinnedName,
    stickyTop,
    mount,
    unmount,
  }
}
