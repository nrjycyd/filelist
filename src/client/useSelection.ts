import type { Ref } from 'vue'
import type { FNode, FolderStats } from './tree'
import { computed } from 'vue'
import { descendantFiles, folderStats } from './tree'
import { concurrency } from './utils'

/** Check boxes: files, whole folders (loaded on demand) and “select all”. */
export function useSelection(options: {
  roots: Ref<FNode[]>
  selected: Ref<Set<string>>
  loadChildren: (node: FNode) => Promise<boolean>
  /** Show a locked folder's password input. */
  startPrompt: (node: FNode, focus: boolean) => void
}) {
  const { roots, selected } = options

  const stats = computed(() => folderStats(roots.value, selected.value))
  const noStats: FolderStats = { files: 0, bytes: 0, selected: 0, complete: false }

  function statsOf(node: FNode): FolderStats {
    return stats.value.get(node.key) ?? noStats
  }

  function isChecked(node: FNode): boolean {
    if (!node.is_dir) return selected.value.has(node.path)
    const { files, selected: hit, complete } = statsOf(node)
    return complete && files > 0 && hit === files
  }

  function isIndeterminate(node: FNode): boolean {
    if (!node.is_dir) return false
    const { files, selected: hit, complete } = statsOf(node)
    return hit > 0 && (!complete || hit < files)
  }

  /**
   * Load a directory and all of its sub-directories (up to 4 at a time). Stops
   * scheduling new folders as soon as one needs a password or fails, and returns
   * the first locked folder in tree order so nothing is silently left out.
   */
  async function loadTree(node: FNode): Promise<{ ok: boolean; locked?: FNode }> {
    const limit = concurrency(4)
    let stopped = false
    const walk = async (dir: FNode): Promise<{ ok: boolean; locked?: FNode }> => {
      if (!dir.is_dir) return { ok: true }
      if (stopped) return { ok: false }
      const loaded = dir.loaded || (await limit(() => (stopped ? Promise.resolve(false) : options.loadChildren(dir))))
      if (!loaded) {
        stopped = true
        return dir.lock ? { ok: false, locked: dir } : { ok: false }
      }
      const subdirs = dir.children.filter((child) => child.is_dir)
      if (!subdirs.length) return { ok: true }
      const results = await Promise.all(subdirs.map(walk))
      const failed = results.find((result) => result.locked) ?? results.find((result) => !result.ok)
      if (failed) {
        // Keep the path to the locked folder open so its input is visible.
        if (failed.locked) dir.expanded = true
        return failed
      }
      return { ok: true }
    }
    return walk(node)
  }

  async function toggleCheck(node: FNode, event?: Event) {
    const input = event?.target as HTMLInputElement | null
    const adding = !isChecked(node)
    // Selecting a folder includes every nested file, so load the whole subtree first.
    if (node.is_dir && adding) {
      const result = await loadTree(node)
      if (!result.ok) {
        if (result.locked) options.startPrompt(result.locked, true)
        if (input) {
          input.checked = isChecked(node)
          input.indeterminate = isIndeterminate(node)
        }
        return
      }
      node.expanded = true
    }
    const files = descendantFiles(node)
    if (!files.length) {
      if (input) input.checked = false
      return
    }
    const next = new Set(selected.value)
    for (const file of files) {
      if (adding) next.add(file.path)
      else next.delete(file.path)
    }
    selected.value = next
  }

  const allFiles = computed(() => {
    const byPath = new Map<string, FNode>()
    for (const file of roots.value.flatMap(descendantFiles)) {
      if (file.lock) continue
      if (!byPath.has(file.path)) byPath.set(file.path, file)
    }
    return [...byPath.values()]
  })
  const selectedFiles = computed(() => allFiles.value.filter((file) => selected.value.has(file.path)))
  const allChecked = computed(() => allFiles.value.length > 0 && selectedFiles.value.length === allFiles.value.length)
  const someChecked = computed(() => !allChecked.value && selectedFiles.value.length > 0)

  function toggleCheckAll() {
    selected.value = allChecked.value ? new Set() : new Set(allFiles.value.map((file) => file.path))
  }

  function clearSelection() {
    selected.value = new Set()
  }

  return {
    statsOf,
    isChecked,
    isIndeterminate,
    toggleCheck,
    allFiles,
    selectedFiles,
    allChecked,
    someChecked,
    toggleCheckAll,
    clearSelection,
  }
}
