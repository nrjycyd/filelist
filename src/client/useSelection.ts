import type { Ref } from 'vue'
import type { FNode, FolderStats } from './tree'
import { computed } from 'vue'
import { descendantFiles, folderStats } from './tree'

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
    return stats.value.get(node.path) ?? noStats
  }

  function isChecked(node: FNode): boolean {
    if (!node.is_dir) return selected.value.has(node.path)
    const { files, selected: hit, complete } = statsOf(node)
    return complete && hit > 0 && hit === files
  }

  function isIndeterminate(node: FNode): boolean {
    return node.is_dir && statsOf(node).selected > 0 && !isChecked(node)
  }

  /**
   * Load a directory and all of its sub-directories. Stops at the first folder
   * that needs a password and returns it, so nothing is silently left out.
   */
  async function loadTree(node: FNode): Promise<{ ok: boolean; locked?: FNode }> {
    if (!node.is_dir) return { ok: true }
    if (!(await options.loadChildren(node))) return node.lock ? { ok: false, locked: node } : { ok: false }
    for (const child of node.children) {
      if (!child.is_dir) continue
      const result = await loadTree(child)
      if (!result.ok) {
        // Keep the path to the locked folder open so its input is visible.
        node.expanded = true
        return result
      }
    }
    return { ok: true }
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

  const allFiles = computed(() => roots.value.flatMap(descendantFiles))
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
