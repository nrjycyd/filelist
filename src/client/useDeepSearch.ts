import type { Ref } from 'vue'
import type { ListContext } from './context'
import type { FNode } from './tree'
import { computed, reactive, ref, watch } from 'vue'

/**
 * The filter and deep search. The filter only sees loaded folders. Deep search
 * loads the rest under the mounted paths (four at a time, `deepSearchLimit` per
 * run) so matches appear in place, in their folders, like any other row.
 * Locked folders are skipped.
 */
export function useDeepSearch(
  ctx: ListContext,
  options: {
    roots: Ref<FNode[]>
    refreshing: Ref<boolean>
    /** Load a folder's children quietly; false when locked or failed. */
    loadChildren: (node: FNode, prompt: false, quiet: true) => Promise<boolean>
  },
) {
  const { props, t } = ctx
  const { roots } = options

  const keyword = ref('')
  const deep = reactive({ running: false, searched: 0, capped: false, done: false })
  // Failed folders wait for an explicit retry or a new search context.
  const failed = reactive(new Set<FNode>())
  /**
   * Deep search mode: entered by “Try deep search” (or at once with
   * `deep-search="auto"`), left by clearing the filter. While on, new keywords,
   * refreshes and newly unlocked folders are searched without asking again.
   */
  const deepMode = ref(false)
  let deepSeq = 0

  /** Folders that are known but not loaded yet (locked ones excluded). */
  function unloadedFolders(): FNode[] {
    const out: FNode[] = []
    const walk = (nodes: FNode[]) => {
      for (const node of nodes) {
        if (!node.is_dir || node.lock) continue
        if (!node.loaded) out.push(node)
        else walk(node.children)
      }
    }
    walk(roots.value)
    return out
  }

  const pending = computed(() => unloadedFolders().filter((node) => !failed.has(node)))
  const failedCount = computed(() => unloadedFolders().filter((node) => failed.has(node)).length)
  const deepRow = computed(() => {
    if (!keyword.value.trim()) return null
    if (deep.running) return 'running'
    if (deep.capped) return 'capped'
    if (!deepMode.value) return pending.value.length ? 'idle' : null
    if (deep.done && failedCount.value) return 'failed'
    return deep.done ? 'done' : null
  })

  /** “Try deep search”, “Continue”, and the automatic runs of deep search mode. */
  async function deepSearch() {
    deepMode.value = true
    const seq = ++deepSeq
    const limit = Math.max(1, Math.floor(props.deepSearchLimit ?? 500))
    const runStart = deep.searched
    Object.assign(deep, { running: true, capped: false, done: false })
    let wave = pending.value
    // `deepSeq` changes in stopDeepSearch() while the awaits below run.
    // eslint-disable-next-line no-unmodified-loop-condition
    while (wave.length && seq === deepSeq) {
      const next: FNode[] = []
      const queue = [...wave]
      const worker = async () => {
        // eslint-disable-next-line no-unmodified-loop-condition
        for (let node = queue.shift(); node && seq === deepSeq; node = queue.shift()) {
          if (deep.searched - runStart >= limit) return
          deep.searched += 1
          const loaded = await options.loadChildren(node, false, true)
          if (seq !== deepSeq) return
          if (!loaded) {
            if (!node.lock) failed.add(node)
            continue
          }
          for (const child of node.children) if (child.is_dir && !child.loaded && !child.lock && !failed.has(child)) next.push(child)
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
      if (deep.searched - runStart >= limit) break
      wave = next
    }
    if (seq !== deepSeq) return
    deep.running = false
    deep.capped = pending.value.length > 0 && deep.searched - runStart >= limit
    deep.done = !deep.capped
  }

  /** Pause a run (internal: refresh, reload). */
  function stopDeepSearch() {
    deepSeq += 1
    deep.running = false
  }

  /** The user's Stop: keep the mode, offer “Continue”, do not restart by itself. */
  function pauseDeepSearch() {
    const wasRunning = deep.running
    stopDeepSearch()
    if (wasRunning && pending.value.length) deep.capped = true
  }

  function retryDeepSearch() {
    failed.clear()
    return deepSearch()
  }

  function clearFilter() {
    keyword.value = ''
  }

  // Clearing the filter leaves deep search mode; loaded folders stay loaded.
  watch(keyword, (value, previous) => {
    if (value.trim() !== previous.trim()) failed.clear()
    if (value.trim()) {
      if (props.deepSearch === 'auto') deepMode.value = true
      return
    }
    stopDeepSearch()
    deepMode.value = false
    Object.assign(deep, { searched: 0, capped: false, done: false })
  })

  watch(roots, () => failed.clear())

  // In deep search mode, folders that become readable (a new keyword, a refresh,
  // an unlocked folder) are searched at once, unless the user stopped or the
  // limit was reached ("Continue" then).
  watch(
    () => deepMode.value && pending.value.length > 0 && !deep.running && !deep.capped && !options.refreshing.value,
    (ready) => {
      if (ready) void deepSearch()
    },
  )

  /**
   * Counted from the tree, so a refresh that re-reads the same folders shows the
   * same numbers: folders read (or found locked), and the locked ones.
   */
  const folderCounts = computed(() => {
    const counts = { checked: 0, locked: 0 }
    const walk = (nodes: FNode[]) => {
      for (const node of nodes) {
        if (!node.is_dir) continue
        if (node.lock) {
          counts.checked += 1
          counts.locked += 1
        } else if (node.loaded) {
          counts.checked += 1
          walk(node.children)
        }
      }
    }
    walk(roots.value)
    return counts
  })
  const lockedFolders = computed(() => folderCounts.value.locked)

  function lockedInSearch(node: FNode): boolean {
    return deepMode.value && !!node.lock && !!keyword.value.trim()
  }

  const deepSummary = computed(() =>
    [
      t(deepRow.value === 'capped' || deepRow.value === 'failed' ? 'deepCapped' : 'deepDone', { count: folderCounts.value.checked }),
      lockedFolders.value ? t('deepSkipped', { count: lockedFolders.value }) : '',
      failedCount.value ? t('deepFailed', { count: failedCount.value }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  )

  /** A name split around the filter keyword, for highlighting. */
  function nameParts(name: string): Array<{ text: string; hit: boolean }> {
    const query = keyword.value.trim().toLowerCase()
    if (!query) return [{ text: name, hit: false }]
    const parts: Array<{ text: string; hit: boolean }> = []
    const lower = name.toLowerCase()
    let from = 0
    for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
      if (at > from) parts.push({ text: name.slice(from, at), hit: false })
      parts.push({ text: name.slice(at, at + query.length), hit: true })
      from = at + query.length
    }
    if (from < name.length) parts.push({ text: name.slice(from), hit: false })
    return parts
  }

  return {
    keyword,
    deep,
    deepMode,
    deepRow,
    deepSearch,
    retryDeepSearch,
    stopDeepSearch,
    pauseDeepSearch,
    clearFilter,
    folderCounts,
    lockedFolders,
    lockedInSearch,
    deepSummary,
    nameParts,
  }
}
