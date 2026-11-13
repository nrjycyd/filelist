import type { Ref } from 'vue'
import type { OLItem, OpenListApi } from './api'
import type { ListContext } from './context'
import type { FNode, LockState, UnlockError } from './tree'
import type { FileListLabels, FileListSource } from './types'
import type { SortKey } from './utils'
import { computed, nextTick, ref, toRaw } from 'vue'
import { errorText, isPasswordError } from './api'
import { descendantFiles, expandedPathsOf, loadedPathsOf, newLock, sortTree, sourceName, toNodes } from './tree'
import { extOf, fileKind, isWithin, previewKind } from './utils'

function fileSourceName(title: string, original: string): string {
  const extension = extOf(original)
  if (!extension || extOf(title) === extension) return title
  return title + original.slice(-extension.length - 1)
}

/** When OpenList cannot tell us, guess from the name: a known file extension means a file. */
function looksLikeFile(path: string): boolean {
  const name = sourceName(path)
  return fileKind(name) !== 'other' || previewKind(name) !== 'none'
}

/** Run at most `size` tasks at once. */
function concurrency(size: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve))
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}

class RootLockedError extends Error {
  rememberedAt?: string

  constructor(rememberedAt?: string) {
    super('root locked')
    this.rememberedAt = rememberedAt
  }
}

type FolderLoadResult =
  | { kind: 'loaded' | 'locked' | 'superseded' }
  | { kind: 'failed'; error: unknown }

interface FolderLoad {
  api: OpenListApi
  password: string
  generation: number
  promise: Promise<FolderLoadResult>
}

/**
 * The folder tree: loading it, refreshing it in place, opening folders,
 * folder passwords and sorting.
 */
export function useTree(
  ctx: ListContext,
  options: {
    /** The selected file paths; cleared or trimmed when the tree is rebuilt. */
    selected: Ref<Set<string>>
    /** Pause a running deep search before the tree is rebuilt. */
    stopDeepSearch: () => void
    /** In deep search mode, a refresh reads again the folders it had read. */
    deepMode: () => boolean
    /** A folder was closed, or the tree rebuilt: long folders go back to their first page. */
    resetShown: (folder?: string) => void
  },
) {
  const { props, api, passwords, rootEl, t, showToast, failureMessage } = ctx
  const { selected } = options

  const roots = ref<FNode[]>([])
  const loadingRoot = ref(false)
  const errorMsg = ref('')
  const refreshing = ref(false)
  let refreshSeq = 0
  const folderLoads = new WeakMap<FNode, FolderLoad>()
  /** Single-path mode: the listed folder itself needs a password. */
  const rootLock = ref<LockState | null>(null)
  const sortKey = ref<SortKey>('name')
  const sortAsc = ref(true)

  /** The folder listed in single-path mode, as the parent of the top rows. */
  const listedFolder = computed(() => ({ path: props.path, depth: -1, zipPath: [] as string[] }))

  function sortNodes(nodes: FNode[]) {
    sortTree(nodes, sortKey.value, sortAsc.value, props.locale)
  }

  /* ---------------- folder passwords ---------------- */

  function focusUnlock(path: string) {
    void nextTick(() => {
      rootEl.value?.querySelector<HTMLInputElement>(`input[data-unlock="${CSS.escape(path)}"]`)?.focus()
    })
  }

  /** Show a folder's same-row input; focus only on user actions, never on page load. */
  function startPrompt(node: FNode, focus: boolean) {
    node.lock ??= newLock()
    node.lock.prompting = true
    if (focus) focusUnlock(node.path)
  }

  function cancelUnlock(lock: LockState) {
    Object.assign(lock, { prompting: false, input: '', error: '' })
  }

  function unlockErrorText(error: UnlockError | undefined): string {
    if (error === 'wrong') return t('passwordWrong')
    if (error === 'stale') return t('passwordStale')
    return ''
  }

  /**
   * Try the typed password with `open`. On success keep it (and remember it in
   * this tab when asked); on a wrong one clear the input and refocus it.
   */
  async function tryUnlock(
    lock: LockState,
    path: string,
    open: (password: string) => Promise<void>,
    failure: keyof FileListLabels,
  ): Promise<boolean> {
    const password = lock.input
    if (!password || lock.busy) return false
    lock.busy = true
    try {
      await open(password)
      passwords.accept(path, password, lock.remember)
      return true
    } catch (error) {
      if (isPasswordError(error)) {
        Object.assign(lock, { error: 'wrong', input: '' })
        focusUnlock(path)
      } else {
        showToast(failureMessage(failure, error))
      }
      return false
    } finally {
      lock.busy = false
    }
  }

  async function submitUnlock(node: FNode) {
    if (!node.lock) return
    const ok = await tryUnlock(
      node.lock,
      node.path,
      async (password) => {
        if (node.unresolved) {
          const data = await api.value.get(node.path, password)
          const original = data.name || sourceName(node.path)
          const title = node.name
          const name = data.is_dir ? title : fileSourceName(title, original)
          Object.assign(node, data, { name, originalName: data.is_dir ? undefined : original, unresolved: false })
          node.zipPath = [data.is_dir ? name : original]
        }
        if (node.is_dir) {
          await fetchChildren(node, password)
          node.expanded = true
        }
      },
      'folderFailed',
    )
    if (ok) node.lock = undefined
  }

  async function submitRootUnlock() {
    if (!rootLock.value) return
    let nodes: FNode[] = []
    const ok = await tryUnlock(
      rootLock.value,
      props.path,
      async (password) => {
        nodes = await listRoot(password)
      },
      'loadFailed',
    )
    if (!ok) return
    roots.value = nodes
    rootLock.value = null
    selected.value = new Set()
    api.value.clearCache()
  }

  /** Forget a remembered password: the folder folds up and asks again next time. */
  function forgetPassword(node: FNode) {
    passwords.forget(node.path)
    folderLoads.delete(toRaw(node))
    Object.assign(node, { expanded: false, loaded: false, loading: false, children: [], lock: undefined })
    selected.value = new Set([...selected.value].filter((path) => !isWithin(path, node.path)))
    api.value.clearCache(node.path)
  }

  /* ---------------- loading the tree ---------------- */

  async function fetchChildren(node: FNode, password: string) {
    const items = await api.value.list(node.path, password)
    setChildren(node, items, password)
  }

  function setChildren(node: FNode, items: OLItem[], password: string) {
    node.children = toNodes(items, node, password)
    sortNodes(node.children)
    node.loaded = true
  }

  async function listRoot(password: string): Promise<FNode[]> {
    const nodes = toNodes(await api.value.list(props.path, password), listedFolder.value, password)
    sortNodes(nodes)
    return nodes
  }

  function requestChildren(node: FNode): Promise<FolderLoadResult> {
    const key = toRaw(node)
    const client = api.value
    const { password, rememberedAt } = passwords.resolve(node.path, node.password)
    const seq = refreshSeq
    const existing = folderLoads.get(key)
    if (existing?.api === client && existing.password === password && existing.generation === seq) return existing.promise

    node.loading = true
    const current = (): boolean => folderLoads.get(key) === request && seq === refreshSeq && api.value === client
    async function run(): Promise<FolderLoadResult> {
      try {
        const items = await client.list(node.path, password)
        if (!current()) return { kind: 'superseded' }
        setChildren(node, items, password)
        return { kind: 'loaded' }
      } catch (error) {
        if (!current()) return { kind: 'superseded' }
        if (!isPasswordError(error)) return { kind: 'failed', error }
        node.expanded = false
        node.lock = newLock(false, passwords.dropStale(rememberedAt) ? 'stale' : '')
        return { kind: 'locked' }
      } finally {
        if (folderLoads.get(key) === request) {
          folderLoads.delete(key)
          node.loading = false
        }
      }
    }

    const request: FolderLoad = { api: client, password, generation: seq, promise: Promise.resolve().then(run) }
    folderLoads.set(key, request)
    return request.promise
  }

  /**
   * Load a folder's children. A password error locks the folder instead of
   * toasting; `prompt` also shows its same-row input (and focuses it).
   */
  async function loadChildren(
    node: FNode,
    prompt: false | 'show' | 'focus' = false,
    quiet = false,
  ): Promise<boolean> {
    if (node.loaded) return true
    if (node.lock) {
      if (prompt) startPrompt(node, prompt === 'focus')
      return false
    }
    const result = await requestChildren(node)
    if (result.kind === 'locked' && prompt) startPrompt(node, prompt === 'focus')
    if (result.kind === 'failed' && !quiet) showToast(failureMessage('folderFailed', result.error))
    return result.kind === 'loaded'
  }

  async function loadSourceRoot(source: FileListSource, expanded: boolean): Promise<FNode> {
    const path = source.path
    const own = source.password ?? ''
    let item: OLItem = { name: sourceName(path), size: 0, is_dir: !looksLikeFile(path), modified: '' }
    let lock: LockState | undefined
    const { password, rememberedAt } = passwords.resolve(path, own)
    try {
      item = { ...item, ...(await api.value.get(path, password)) }
    } catch (error) {
      // Other errors keep the guess; expanding surfaces the real error.
      if (isPasswordError(error)) lock = newLock(expanded, passwords.dropStale(rememberedAt) ? 'stale' : '')
    }
    const original = item.name || sourceName(path)
    const title = source.title || original
    const name = item.is_dir || lock ? title : fileSourceName(title, original)
    return {
      ...item,
      name,
      originalName: !item.is_dir && source.title ? original : undefined,
      path,
      depth: 0,
      expanded: expanded && !lock,
      loaded: false,
      loading: false,
      children: [],
      password: own,
      isRoot: true,
      lock,
      unresolved: !!lock,
      // A file root keeps its real file name (and extension) inside the ZIP.
      zipPath: [item.is_dir ? name : original],
    }
  }

  /**
   * Build a fresh tree. `expandedPaths` re-opens those folders (refresh keeps
   * what was open); without it the configured `expanded` defaults apply.
   */
  async function buildTree(expandedPaths?: Set<string>, loadedPaths?: Set<string>): Promise<FNode[]> {
    let nodes: FNode[]
    if (props.sources.length) {
      nodes = await Promise.all(
        props.sources.map((source) =>
          loadSourceRoot(source, expandedPaths ? expandedPaths.has(source.path) : (source.expanded ?? props.expanded)),
        ),
      )
    } else {
      const { password, rememberedAt } = passwords.resolve(props.path)
      try {
        nodes = await listRoot(password)
      } catch (error) {
        throw isPasswordError(error) ? new RootLockedError(rememberedAt) : error
      }
    }
    // Open folders are re-opened; folders a deep search had read are re-read
    // without opening them. Four requests at a time across the whole tree.
    const limit = concurrency(4)
    const open = async (list: FNode[]): Promise<void> => {
      await Promise.all(
        list.map(async (node) => {
          const wanted = !!(node.expanded || expandedPaths?.has(node.path))
          const keep = !!loadedPaths?.has(node.path)
          if (!node.is_dir || node.lock || !(wanted || keep)) return
          const ok = await limit(() => loadChildren(node, wanted ? 'show' : false, !wanted))
          node.expanded = wanted && ok
          if (ok && (expandedPaths || loadedPaths)) await open(node.children)
        }),
      )
    }
    await open(nodes)
    return nodes
  }

  function lockRoot(error: RootLockedError, fallback: UnlockError) {
    roots.value = []
    selected.value = new Set()
    rootLock.value = newLock(true, passwords.dropStale(error.rememberedAt) ? 'stale' : fallback)
  }

  /** First load, or a retry after an error: shows the loading state. */
  async function loadRoot() {
    options.stopDeepSearch()
    refreshSeq += 1
    refreshing.value = false
    loadingRoot.value = true
    errorMsg.value = ''
    try {
      roots.value = await buildTree()
      options.resetShown()
      rootLock.value = null
      selected.value = new Set()
      api.value.clearCache()
    } catch (error) {
      if (error instanceof RootLockedError) lockRoot(error, '')
      else errorMsg.value = errorText(error)
    } finally {
      loadingRoot.value = false
    }
  }

  /**
   * Refresh keeps the old rows in place (dimmed) until the new tree is ready, then
   * swaps it in. Open folders stay open; selected files that still exist stay selected.
   */
  async function refresh() {
    if (refreshing.value || loadingRoot.value) return
    options.stopDeepSearch()
    if (!roots.value.length || errorMsg.value || rootLock.value) {
      await loadRoot()
      return
    }
    const seq = ++refreshSeq
    refreshing.value = true
    try {
      // In deep search mode, folders it had read are read again, so results stay.
      const fresh = await buildTree(expandedPathsOf(roots.value), options.deepMode() ? loadedPathsOf(roots.value) : undefined)
      if (seq !== refreshSeq) return
      roots.value = fresh
      const existing = new Set(fresh.flatMap(descendantFiles).map((file) => file.path))
      selected.value = new Set([...selected.value].filter((path) => existing.has(path)))
      api.value.clearCache()
    } catch (error) {
      if (seq !== refreshSeq) return
      // The listed folder's password changed: ask again.
      if (error instanceof RootLockedError) lockRoot(error, 'wrong')
      else showToast(failureMessage('refreshFailed', error))
    } finally {
      if (seq === refreshSeq) refreshing.value = false
    }
  }

  async function toggleExpand(node: FNode) {
    if (node.lock) {
      startPrompt(node, true)
      return
    }
    if (!node.is_dir) return
    if (node.expanded) {
      node.expanded = false
      // Opened again, a long folder starts from its first page.
      options.resetShown(node.path)
      return
    }
    if (await loadChildren(node, 'focus')) node.expanded = true
  }

  /* ---------------- sorting ---------------- */

  function applySort(key: SortKey, ascending: boolean) {
    sortKey.value = key
    sortAsc.value = ascending
    // Source roots keep the order of `sources`; only their contents are sorted.
    if (props.sources.length) roots.value.forEach((root) => sortNodes(root.children))
    else sortNodes(roots.value)
  }

  function setSort(key: SortKey) {
    applySort(key, sortKey.value === key ? !sortAsc.value : true)
  }

  return {
    roots,
    loadingRoot,
    errorMsg,
    refreshing,
    rootLock,
    sortKey,
    sortAsc,
    startPrompt,
    cancelUnlock,
    unlockErrorText,
    submitUnlock,
    submitRootUnlock,
    forgetPassword,
    loadChildren,
    loadRoot,
    refresh,
    toggleExpand,
    setSort,
    applySort,
  }
}
