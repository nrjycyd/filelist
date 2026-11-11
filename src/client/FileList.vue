<script setup lang="ts">
/**
 * OpenList file browser: folder tree, batch ZIP, folder passwords and an
 * in-page preview. OpenList access is in api.ts (demo.ts when `base` is empty),
 * password choice in usePasswords.ts, tree helpers in tree.ts and downloads in
 * download.ts; this component wires them to the UI.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import type { OLItem } from './api'
import type { FileListLabels, FileListProps, FileListSource } from './types'
import type { ZipProgress } from './download'
import type { FNode, FolderStats, LockState, UnlockError } from './tree'
import type { SortKey } from './utils'
import { createOpenListApi, errorText, isNetworkError, isPasswordError } from './api'
import { createDemoApi, isDemoFile } from './demo'
import ConfirmDialog from './ConfirmDialog.vue'
import { canStreamToDisk, openUrl, pickZipFile, saveBlob, zipFileName, zipToBlob, zipToFile } from './download'
import Icon from './Icon.vue'
import { formatLabel, resolveLabels } from './locales'
import PreviewDialog from './PreviewDialog.vue'
import { descendantFiles, expandedPathsOf, folderStats, loadedPathsOf, newLock, sortTree, sourceName, toNodes } from './tree'
import { usePasswords } from './usePasswords'
import {
  extOf,
  fileKind,
  fillPreviewUrl,
  formatDate,
  formatSize,
  iframePreviewsFor,
  isWithin,
  previewKind,
  totalSize,
} from './utils'

const props = withDefaults(defineProps<FileListProps>(), {
  base: '',
  path: '/',
  sources: () => [] as FileListSource[],
  expanded: false,
  token: '',
  password: '',
  title: '',
  locale: 'zh-CN',
  rememberPassword: true,
  pageSize: 15,
  deepSearchLimit: 500,
  deepSearch: 'manual',
})

const text = computed<FileListLabels>(() => resolveLabels(props.locale, props.labels))

function t(key: keyof FileListLabels, values?: Record<string, string | number>): string {
  return formatLabel(text.value[key], values)
}

/** Prefix for element ids, unique per component instance. */
const uid = useId()
const demo = computed(() => !props.base)
const api = computed(() => (demo.value ? createDemoApi() : createOpenListApi(props.base, props.token)))

const canRemember = computed(() => props.rememberPassword !== false)
const passwords = usePasswords({
  scope: () => props.base.replace(/\/+$/, '') || 'demo',
  enabled: () => canRemember.value,
  fallback: () => props.password,
})
const remembered = passwords.remembered

const rootEl = ref<HTMLElement>()
const roots = ref<FNode[]>([])
const loadingRoot = ref(false)
const errorMsg = ref('')
const refreshing = ref(false)
let refreshSeq = 0
/** Single-path mode: the listed folder itself needs a password. */
const rootLock = ref<LockState | null>(null)
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const toast = ref('')
const sortKey = ref<SortKey>('name')
const sortAsc = ref(true)
const siteTitle = ref('')
const iframePreviews = ref('')
const batchBusy = ref(false)
const zipProgress = ref<ZipProgress | null>(null)
let zipAbort: AbortController | null = null
let toastTimer: ReturnType<typeof setTimeout> | undefined

/** The folder listed in single-path mode, as the parent of the top rows. */
const listedFolder = computed(() => ({ path: props.path, depth: -1, zipPath: [] as string[] }))

function showToast(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3200)
}

/** A failure toast; browser network errors are usually CORS, so say where to look. */
function failureMessage(key: keyof FileListLabels, error: unknown): string {
  const message = t(key, { message: errorText(error) })
  return isNetworkError(error) ? `${message} ${t('corsHint')}` : message
}

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
        const name = node.name
        Object.assign(node, data, { name, unresolved: false })
        node.zipPath = [node.is_dir ? name : data.name || node.zipPath[0]]
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
  Object.assign(node, { expanded: false, loaded: false, children: [], lock: undefined })
  selected.value = new Set([...selected.value].filter((path) => !isWithin(path, node.path)))
  api.value.clearCache(node.path)
}

/* ---------------- loading the tree ---------------- */

async function fetchChildren(node: FNode, password: string) {
  const items = await api.value.list(node.path, password)
  node.children = toNodes(items, node, password)
  sortNodes(node.children)
  node.loaded = true
}

async function listRoot(password: string): Promise<FNode[]> {
  const nodes = toNodes(await api.value.list(props.path, password), listedFolder.value, password)
  sortNodes(nodes)
  return nodes
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
  node.loading = true
  const { password, rememberedAt } = passwords.resolve(node.path, node.password)
  try {
    await fetchChildren(node, password)
    return true
  } catch (error) {
    if (isPasswordError(error)) {
      node.expanded = false
      node.lock = newLock(false, passwords.dropStale(rememberedAt) ? 'stale' : '')
      if (prompt) startPrompt(node, prompt === 'focus')
    } else if (!quiet) {
      showToast(failureMessage('folderFailed', error))
    }
    return false
  } finally {
    node.loading = false
  }
}

/** When OpenList cannot tell us, guess from the name: a known file extension means a file. */
function looksLikeFile(path: string): boolean {
  const name = sourceName(path)
  return fileKind(name) !== 'other' || previewKind(name) !== 'none'
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
  const name = source.title || item.name || sourceName(path)
  return {
    ...item,
    name,
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
    zipPath: [item.is_dir ? name : item.name || sourceName(path)],
  }
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
  stopDeepSearch()
  refreshSeq += 1
  refreshing.value = false
  loadingRoot.value = true
  errorMsg.value = ''
  try {
    roots.value = await buildTree()
    shown.clear()
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
  stopDeepSearch()
  if (!roots.value.length || errorMsg.value || rootLock.value) {
    await loadRoot()
    return
  }
  const seq = ++refreshSeq
  refreshing.value = true
  try {
    // In deep search mode, folders it had read are read again, so results stay.
    const fresh = await buildTree(expandedPathsOf(roots.value), deepMode.value ? loadedPathsOf(roots.value) : undefined)
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
    for (const key of [...shown.keys()]) if (isWithin(key, node.path)) shown.delete(key)
    return
  }
  node.expanded = await loadChildren(node, 'focus')
}

/* ---------------- sorting and filtering ---------------- */

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

/** Compact sort control for narrow containers, where header cells are hidden. */
const sortOptions = computed(() =>
  (['name', 'size', 'modified'] as SortKey[]).flatMap((key) => {
    const label = t(key === 'name' ? 'columnName' : key === 'size' ? 'columnSize' : 'columnDate')
    return [
      { value: `${key}:asc`, label: `${label} ↑` },
      { value: `${key}:desc`, label: `${label} ↓` },
    ]
  }),
)

const sortValue = computed<string>({
  get: () => `${sortKey.value}:${sortAsc.value ? 'asc' : 'desc'}`,
  set: (value) => {
    const [key, direction] = value.split(':') as [SortKey, string]
    applySort(key, direction !== 'desc')
  },
})

/* ---------------- long folders ---------------- */

/** The row closing a long folder while its children are cut at `pageSize`. */
interface MoreRow {
  more: true
  /** Folder path (the listed folder's path for top-level rows). */
  key: string
  depth: number
  remaining: number
}

type Row = FNode | MoreRow

/**
 * A folder showing more than its first page: while the reader scrolls through
 * it, its row is pinned at the top with “show less”.
 */
interface LongFolder {
  key: string
  /** Depth of the folder's own row (-1 for the top level of a single path). */
  depth: number
  shown: number
  total: number
  /** Path of the last row in the folder, so we know when we are past it. */
  last: string
}

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

function isMore(row: Row): row is MoreRow {
  return 'more' in row
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

const visible = computed<FNode[]>(() => rows.value.filter((row): row is FNode => !isMore(row)))

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

/* ---------------- deep search ---------------- */

/**
 * The filter only sees loaded folders. Deep search loads the rest under the
 * mounted paths (four at a time, `deepSearchLimit` per run) so matches appear
 * in place, in their folders, like any other row. Locked folders are skipped.
 */
const deep = reactive({ running: false, searched: 0, failed: 0, capped: false, done: false })
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

const hasUnloaded = computed(() => unloadedFolders().length > 0)
const deepRow = computed(() => {
  if (!keyword.value.trim()) return null
  if (deep.running) return 'running'
  if (deep.capped) return 'capped'
  if (!deepMode.value) return hasUnloaded.value ? 'idle' : null
  return deep.done ? 'done' : null
})

/** “Try deep search”, “Continue”, and the automatic runs of deep search mode. */
async function deepSearch() {
  deepMode.value = true
  const seq = ++deepSeq
  const limit = Math.max(1, Math.floor(props.deepSearchLimit ?? 500))
  const runStart = deep.searched
  Object.assign(deep, { running: true, capped: false, done: false })
  let wave = unloadedFolders()
  while (wave.length && seq === deepSeq) {
    const next: FNode[] = []
    const queue = [...wave]
    const worker = async () => {
      for (let node = queue.shift(); node && seq === deepSeq; node = queue.shift()) {
        if (deep.searched - runStart >= limit) return
        deep.searched += 1
        if (!(await loadChildren(node, false, true))) {
          if (!node.lock) deep.failed += 1
          continue
        }
        for (const child of node.children) if (child.is_dir && !child.loaded && !child.lock) next.push(child)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
    if (deep.searched - runStart >= limit) break
    wave = next
  }
  if (seq !== deepSeq) return
  deep.running = false
  deep.capped = hasUnloaded.value && deep.searched - runStart >= limit
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
  if (wasRunning && hasUnloaded.value) deep.capped = true
}

function clearFilter() {
  keyword.value = ''
}

// Clearing the filter leaves deep search mode; loaded folders stay loaded.
watch(keyword, (value) => {
  if (value.trim()) {
    if (props.deepSearch === 'auto') deepMode.value = true
    return
  }
  stopDeepSearch()
  deepMode.value = false
  Object.assign(deep, { searched: 0, failed: 0, capped: false, done: false })
})

// In deep search mode, folders that become readable (a new keyword, a refresh,
// an unlocked folder) are searched at once, unless the user stopped or the
// limit was reached ("Continue" then).
watch(
  () => deepMode.value && hasUnloaded.value && !deep.running && !deep.capped && !refreshing.value,
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
    t(deepRow.value === 'capped' ? 'deepCapped' : 'deepDone', { count: folderCounts.value.checked }),
    lockedFolders.value ? t('deepSkipped', { count: lockedFolders.value }) : '',
    deep.failed ? t('deepFailed', { count: deep.failed }) : '',
  ]
    .filter(Boolean)
    .join(' · '),
)

/* ---------------- selection and batch download ---------------- */

const stats = computed(() => folderStats(roots.value, selected.value))
const noStats: FolderStats = { files: 0, bytes: 0, selected: 0 }

function statsOf(node: FNode): FolderStats {
  return stats.value.get(node.path) ?? noStats
}

function isChecked(node: FNode): boolean {
  if (!node.is_dir) return selected.value.has(node.path)
  const { files, selected: hit } = statsOf(node)
  return files > 0 && hit === files
}

function isIndeterminate(node: FNode): boolean {
  if (!node.is_dir) return false
  const { files, selected: hit } = statsOf(node)
  return hit > 0 && hit < files
}

/**
 * Load a directory and all of its sub-directories. Stops at the first folder
 * that needs a password and returns it, so nothing is silently left out.
 */
async function loadTree(node: FNode): Promise<{ ok: boolean; locked?: FNode }> {
  if (!node.is_dir) return { ok: true }
  if (!(await loadChildren(node))) return node.lock ? { ok: false, locked: node } : { ok: false }
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
  // Selecting a folder includes every nested file, so load the whole subtree first.
  if (node.is_dir && !isChecked(node)) {
    const result = await loadTree(node)
    if (!result.ok) {
      if (result.locked) startPrompt(result.locked, true)
      if (input) input.checked = isChecked(node)
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
  const adding = files.some((file) => !next.has(file.path))
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

function fileUrlOf(node: FNode): Promise<string> {
  return api.value.fileUrl(node, passwords.resolve(node.path, node.password).password)
}

async function download(node: FNode) {
  if (node.is_dir) return
  if (demo.value && !isDemoFile(node.path)) {
    showToast(t('demoDownload', { name: node.name }))
    return
  }
  try {
    const url = await fileUrlOf(node)
    openUrl(url, { sameTab: api.value.isAttachmentUrl(url), name: node.name })
    showToast(t('downloadStarted', { name: node.name }))
  } catch (error) {
    showToast(t('downloadFailed', { message: errorText(error) }))
  }
}

const MB = 1024 * 1024

/** In-memory ZIP limits in bytes (Infinity = none); phones get lower defaults. */
function zipLimits(): { warn: number; max: number } {
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
  const bytes = (value: number | undefined, fallback: number) => {
    const mb = value ?? fallback
    return mb > 0 ? mb * MB : Number.POSITIVE_INFINITY
  }
  return { warn: bytes(props.zipWarnSize, touch ? 200 : 500), max: bytes(props.zipMaxSize, touch ? 1024 : 2048) }
}

/** A ZIP question or notice: over the warning size, over the limit, or failed. */
type ZipNotice =
  | { kind: 'warn' | 'block'; size: number; limit: number; files: FNode[] }
  | { kind: 'failed'; message: string }

const zipNotice = ref<ZipNotice | null>(null)
/** Only desktop browsers get “use Chrome or Edge”; on iPhone every browser is Safari. */
const zipTip = computed(() =>
  typeof window !== 'undefined' && !window.matchMedia?.('(pointer: coarse)').matches ? t('zipStreamTip') : '',
)

const zipDialog = computed(() => {
  const notice = zipNotice.value
  if (!notice) return null
  if (notice.kind === 'failed') {
    return { title: t('batchFailedTitle'), text: notice.message, tip: t('batchFailedHint'), cancel: t('gotIt') }
  }
  const warn = notice.kind === 'warn'
  return {
    title: t(warn ? 'zipWarnTitle' : 'zipBlockTitle', { size: formatSize(notice.size) }),
    text: t(warn ? 'zipWarnText' : 'zipBlockText', { limit: formatSize(notice.limit) }),
    tip: zipTip.value,
    confirm: warn ? t('zipContinue') : undefined,
    cancel: warn ? t('cancel') : t('gotIt'),
  }
})

function zipName(): string {
  return zipFileName(props.title || t('defaultZip'))
}

/**
 * Chrome / Edge stream into a file the user picks (no size limit). Other
 * browsers build the ZIP in memory, so large selections ask first or are refused.
 */
async function batchDownload() {
  const files = selectedFiles.value
  if (!files.length || batchBusy.value) return
  if (demo.value && !files.every((file) => isDemoFile(file.path))) {
    showToast(t('demoBatch', { count: files.length }))
    return
  }
  if (canStreamToDisk()) {
    let handle: FileSystemFileHandle | null
    try {
      // First await of the click: the picker needs the user gesture.
      handle = await pickZipFile(zipName())
    } catch (error) {
      showToast(t('batchFailed', { message: errorText(error) }))
      return
    }
    if (handle) await runZip(files, (options) => zipToFile(handle, files, options), handle.name)
    return
  }
  const size = totalSize(files)
  const { warn, max } = zipLimits()
  if (size > max) zipNotice.value = { kind: 'block', size, limit: max, files }
  else if (size > warn) zipNotice.value = { kind: 'warn', size, limit: warn, files }
  else await zipInMemory(files)
}

async function zipInMemory(files: FNode[]) {
  const name = zipName()
  await runZip(
    files,
    async (options) => saveBlob(await zipToBlob(files, options), name),
    name,
  )
}

function confirmZip() {
  const notice = zipNotice.value
  zipNotice.value = null
  if (notice?.kind === 'warn') void zipInMemory(notice.files)
}

async function runZip(
  files: FNode[],
  run: (options: Parameters<typeof zipToBlob<FNode>>[1]) => Promise<void>,
  name: string,
) {
  const controller = new AbortController()
  zipAbort = controller
  batchBusy.value = true
  zipProgress.value = null
  try {
    await run({ urlOf: fileUrlOf, signal: controller.signal, onProgress: (progress) => (zipProgress.value = progress) })
    showToast(t('batchDone', { name, count: files.length, size: formatSize(totalSize(files)) }))
    selected.value = new Set()
  } catch (error) {
    // A failure is worth a dialog: a toast is easy to miss after a long wait.
    if (controller.signal.aborted) showToast(t('batchCanceled'))
    else zipNotice.value = { kind: 'failed', message: errorText(error) }
  } finally {
    zipAbort = null
    batchBusy.value = false
    zipProgress.value = null
  }
}

function cancelZip() {
  zipAbort?.abort()
}

const zipPercent = computed(() => {
  const progress = zipProgress.value
  if (!progress) return 0
  const ratio = progress.totalBytes
    ? progress.bytes / progress.totalBytes
    : progress.totalFiles
      ? progress.files / progress.totalFiles
      : 0
  return Math.min(100, Math.floor(ratio * 100))
})

/* ---------------- preview (dialog, no navigation) ---------------- */

/** Only types the dialog can actually render get a preview button. */
function canPreview(node: FNode): boolean {
  return !node.is_dir && previewKind(node.name) !== 'none'
}

const previewNode = ref<FNode | null>(null)
const previewSrc = ref('')
const previewViewer = ref('')
const previewResolving = ref(false)
const previewError = ref('')
let previewSeq = 0

/** Previewable files in the order they are listed, for ← / →. */
const previewList = computed(() => visible.value.filter(canPreview))
const previewPosition = computed(() => (previewNode.value ? previewList.value.indexOf(previewNode.value) + 1 : 0))

async function preview(node: FNode) {
  const seq = ++previewSeq
  previewNode.value = node
  previewSrc.value = ''
  previewViewer.value = ''
  previewError.value = ''
  previewResolving.value = false
  if ((demo.value && !isDemoFile(node.path)) || !canPreview(node)) return
  previewResolving.value = true
  try {
    const url = await fileUrlOf(node)
    if (seq !== previewSeq) return
    previewSrc.value = url
    const viewer = previewKind(node.name) === 'pdf' ? iframePreviewsFor(node.name, iframePreviews.value)[0] : undefined
    if (viewer) {
      previewViewer.value = fillPreviewUrl(viewer.scheme, {
        name: node.name,
        rawUrl: url,
        downloadUrl: api.value.directUrl(node),
      })
    }
  } catch (error) {
    if (seq === previewSeq) previewError.value = errorText(error)
  } finally {
    if (seq === previewSeq) previewResolving.value = false
  }
}

function stepPreview(delta: number) {
  const list = previewList.value
  if (!list.length) return
  const index = previewNode.value ? list.indexOf(previewNode.value) : -1
  void preview(list[(index + delta + list.length) % list.length])
}

function closePreview() {
  previewSeq += 1
  previewNode.value = null
}

/* ---------------- page chrome ---------------- */

const displayTitle = computed(() => props.title || siteTitle.value || (props.path === '/' ? t('allFiles') : props.path))

async function loadSettings() {
  const settings = await api.value.settings()
  siteTitle.value = settings.title
  iframePreviews.value = settings.iframePreviews
}

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

onMounted(() => {
  passwords.sync()
  void loadRoot()
  void loadSettings()
  measureStickyTop()
  window.addEventListener('resize', measureStickyTop, { passive: true })
  window.addEventListener('scroll', schedulePin, { passive: true })
  window.addEventListener('resize', schedulePin, { passive: true })
})

onBeforeUnmount(() => {
  zipAbort?.abort()
  window.removeEventListener('resize', measureStickyTop)
  window.removeEventListener('scroll', schedulePin)
  window.removeEventListener('resize', schedulePin)
  cancelAnimationFrame(pinFrame)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div
    ref="rootEl"
    class="fl-root"
    :class="{ 'fl-selecting': selected.size > 0, 'fl-refreshing': refreshing }"
    :style="{ '--fl-sticky-top-auto': `${stickyTop}px` }"
    :aria-busy="refreshing || loadingRoot"
  >
    <div class="fl-bar">
      <div v-if="batchBusy" class="fl-selection" role="status">
        <span class="fl-selection-count">{{ t('batching', { percent: zipPercent }) }}</span>
        <span v-if="zipProgress" class="fl-selection-size">{{
          t('batchProgress', {
            done: formatSize(zipProgress.bytes),
            total: formatSize(zipProgress.totalBytes),
            files: zipProgress.files,
            count: zipProgress.totalFiles,
          })
        }}</span>
        <span class="fl-zip-bar" :style="{ width: `${zipPercent}%` }" aria-hidden="true"></span>
      </div>
      <div v-else-if="selected.size" class="fl-selection" role="status">
        <span class="fl-selection-count">{{ t('selected', { count: selected.size }) }}</span>
        <span class="fl-selection-size">{{ t('totalSize', { size: formatSize(totalSize(selectedFiles)) }) }}</span>
      </div>
      <div v-else class="fl-title">
        <span class="fl-title-text">{{ displayTitle }}</span>
        <span v-if="demo" class="fl-demo-badge">{{ t('demoBadge') }}</span>
      </div>
      <button
        v-if="selected.size && !batchBusy"
        class="fl-clear"
        type="button"
        :aria-label="t('clearSelection')"
        :title="t('clearSelection')"
        @click="clearSelection"
      >
        <Icon class="fl-clear-icon" name="close" :size="18" />
        <span class="fl-clear-text">{{ t('clear') }}</span>
      </button>
      <div class="fl-tools">
        <label class="fl-search">
          <Icon name="search" :size="15" />
          <input
            v-model="keyword"
            type="text"
            :placeholder="t('filter')"
            :aria-label="t('filter')"
            @keydown.esc="keyword && ($event.preventDefault(), clearFilter())"
          />
          <button
            v-if="keyword"
            class="fl-search-clear"
            type="button"
            :aria-label="t('clearFilter')"
            :title="t('clearFilter')"
            @click="clearFilter"
          ><Icon name="close" :size="12" /></button>
        </label>
        <button
          class="fl-icon-btn fl-refresh"
          :class="{ 'fl-spinning': refreshing }"
          type="button"
          :disabled="refreshing || loadingRoot"
          :aria-label="refreshing ? t('refreshing') : t('refresh')"
          :title="refreshing ? t('refreshing') : t('refresh')"
          @click="refresh"
        >
          <Icon name="refresh" :size="15" />
        </button>
      </div>
      <button v-if="batchBusy" class="fl-btn fl-zip-cancel" type="button" @click="cancelZip">{{ t('cancel') }}</button>
      <button v-else-if="selected.size" class="fl-btn fl-btn-primary" type="button" @click="batchDownload">
        <Icon name="download" :size="15" />
        {{ t('batch') }}
      </button>
    </div>

    <div class="fl-row fl-head">
      <span v-if="refreshing" class="fl-progress" aria-hidden="true"></span>
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :aria-label="t('selectAll')"
          :disabled="batchBusy"
          :checked="allChecked"
          :indeterminate.prop="someChecked"
          @change="toggleCheckAll"
        />
      </label>
      <span
        v-for="column in (['name', 'size', 'modified'] as SortKey[])"
        :key="column"
        class="fl-cell"
        :class="`fl-cell-${column === 'modified' ? 'date' : column}`"
      >
        <button
          class="fl-sort-btn"
          type="button"
          :aria-sort="sortKey === column ? (sortAsc ? 'ascending' : 'descending') : undefined"
          @click="setSort(column)"
        >
          {{ t(column === 'name' ? 'columnName' : column === 'size' ? 'columnSize' : 'columnDate') }}<span class="fl-sort" aria-hidden="true">{{ sortKey === column ? (sortAsc ? '▲' : '▼') : '' }}</span>
        </button>
      </span>
      <span class="fl-cell fl-cell-op">
        <label class="fl-sort-select">
          <span>{{ t('sortBy') }}</span>
          <span class="fl-sort-current" aria-hidden="true">{{ sortOptions.find((option) => option.value === sortValue)?.label }}</span>
          <select v-model="sortValue" :aria-label="t('sortBy')">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </span>
    </div>

    <!-- While scrolling through a long folder, its row stays at the top with “show less”. -->
    <div class="fl-pin-anchor" :style="{ '--fl-pin-offset': `${pinOffset}px` }">
      <div v-if="pinned" class="fl-pin" :style="{ '--fl-depth': Math.max(pinned.depth, 0) }">
        <span class="fl-cell fl-cell-check"></span>
        <span class="fl-cell fl-cell-name">
          <span v-if="pinned.depth >= 0" class="fl-indent" aria-hidden="true"></span>
          <span v-if="pinned.depth >= 0" class="fl-pin-arrow" aria-hidden="true"><Icon name="next" :size="14" /></span>
          <svg class="fl-folder-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          <span class="fl-pin-name">{{ pinnedName }}</span>
          <span class="fl-pin-count">
            {{ pinned.shown < pinned.total
              ? t('moreShown', { shown: pinned.shown, total: pinned.total })
              : t('allShown', { count: pinned.total }) }}
          </span>
        </span>
        <button class="fl-pin-less" type="button" @click="showLess(pinned.key)">
          {{ t('showLess') }}<Icon name="up" :size="12" />
        </button>
      </div>
    </div>

    <div v-if="loadingRoot" class="fl-status">{{ t('loading') }}</div>
    <form
      v-else-if="rootLock"
      class="fl-unlock-root"
      :class="{ 'fl-unlock-error': rootLock.error }"
      @submit.prevent="submitRootUnlock"
    >
      <Icon class="fl-unlock-lock" name="lock" />
      <label class="fl-unlock-label" :for="`${uid}-root`">{{ t('passwordPrompt') }}</label>
      <span v-if="rootLock.error" :id="`${uid}-root-error`" class="fl-unlock-message" role="alert">{{ unlockErrorText(rootLock.error) }}</span>
      <span class="fl-unlock">
        <input
          :id="`${uid}-root`"
          v-model="rootLock.input"
          type="password"
          autocomplete="off"
          :data-unlock="path"
          :placeholder="t('passwordPlaceholder')"
          :aria-invalid="!!rootLock.error"
          :aria-describedby="rootLock.error ? `${uid}-root-error` : undefined"
        />
        <button
          v-if="canRemember"
          class="fl-unlock-remember"
          type="button"
          :aria-pressed="rootLock.remember"
          :aria-label="t('rememberPassword')"
          :title="t('rememberPassword')"
          @click="rootLock.remember = !rootLock.remember"
        ><Icon name="key" /></button>
        <button class="fl-unlock-submit" type="submit" :disabled="rootLock.busy || !rootLock.input">{{ t('open') }}</button>
      </span>
    </form>
    <div v-else-if="errorMsg" class="fl-status fl-error">
      {{ t('loadFailed', { message: errorMsg }) }}
      <div v-if="/guest/i.test(errorMsg)" class="fl-hint">{{ t('guestHint') }}</div>
      <div v-if="isNetworkError(errorMsg)" class="fl-hint">{{ t('corsHint') }}</div>
      <button class="fl-btn" type="button" @click="loadRoot">{{ t('retry') }}</button>
    </div>
    <div v-else-if="visible.length === 0" class="fl-status">{{ t('empty') }}</div>

    <template v-for="(node, index) in rows" :key="isMore(node) ? `more:${node.key}` : node.path">
    <div
      v-if="isMore(node)"
      class="fl-row fl-more"
      :style="{ '--fl-depth': node.depth }"
    >
      <span class="fl-cell fl-cell-check"></span>
      <span class="fl-cell fl-more-cell">
        <!-- Reads as one more row of the folder: “⋯” in the type column, the count where names start. -->
        <span class="fl-indent" aria-hidden="true"></span>
        <span class="fl-arrow-placeholder" aria-hidden="true"></span>
        <span class="fl-more-tag" aria-hidden="true">⋯</span>
        <span class="fl-more-count">{{ t('moreRemaining', { count: node.remaining }) }}</span>
        <span class="fl-more-actions">
          <template v-if="node.remaining > (pageSize || 0)">
            <button
              class="fl-more-link"
              type="button"
              :aria-label="t('showNext', { count: pageSize })"
              @click="showMore(node, false)"
            >
              <span class="fl-more-long">{{ t('showNext', { count: pageSize }) }}</span>
              <span class="fl-more-short" aria-hidden="true">{{ t('showNextShort', { count: pageSize }) }}</span>
            </button>
            <button class="fl-more-link fl-more-all" type="button" :aria-label="t('showAll')" @click="showMore(node, true)">
              <span class="fl-more-long">{{ t('showAll') }}</span>
              <span class="fl-more-short" aria-hidden="true">{{ t('showAllShort') }}</span>
            </button>
          </template>
          <button v-else class="fl-more-link fl-more-all" type="button" @click="showMore(node, true)">
            {{ t('showRest', { count: node.remaining }) }}
          </button>
        </span>
      </span>
    </div>
    <div
      v-else
      class="fl-row"
      :class="{
        'fl-row-dir': node.is_dir,
        'fl-row-root': node.isRoot,
        'fl-row-selected': !node.is_dir && selected.has(node.path),
        'fl-row-locked': !!node.lock,
        'fl-row-prompting': node.lock?.prompting,
        'fl-row-error': node.lock?.prompting && !!node.lock.error,
      }"
      :style="{ '--fl-depth': node.depth }"
      :data-path="node.path"
    >
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :disabled="!!node.lock || batchBusy"
          :aria-label="t('selectItem', { name: node.name })"
          :checked="isChecked(node)"
          :indeterminate.prop="isIndeterminate(node)"
          @change="toggleCheck(node, $event)"
        />
      </label>
      <span class="fl-cell fl-cell-name" :title="node.isRoot ? node.path : undefined">
        <span class="fl-indent" aria-hidden="true"></span>
        <button
          v-if="node.lock"
          class="fl-arrow fl-lock"
          type="button"
          :aria-label="t('unlockFolder', { name: node.name })"
          :title="t('unlockFolder', { name: node.name })"
          @click="toggleExpand(node)"
        >
          <Icon name="lock" :size="14" />
        </button>
        <button
          v-else-if="node.is_dir"
          class="fl-arrow"
          type="button"
          :class="{ 'fl-arrow-open': node.expanded }"
          :aria-label="t(node.expanded ? 'collapse' : 'expand', { name: node.name })"
          :aria-expanded="node.expanded"
          @click="toggleExpand(node)"
        >
          <Icon name="next" :size="14" />
        </button>
        <span v-else class="fl-arrow-placeholder" aria-hidden="true"></span>
        <svg v-if="node.is_dir" class="fl-folder-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        <span v-else class="fl-type" :data-kind="fileKind(node.name)" aria-hidden="true">{{ extOf(node.name) || 'FILE' }}</span>
        <span class="fl-label">
          <span
            class="fl-name"
            :class="{ 'fl-name-dir': node.is_dir }"
            @click="node.lock || node.is_dir ? toggleExpand(node) : download(node)"
          ><template v-for="(part, at) in nameParts(node.name)" :key="at"><mark v-if="part.hit" class="fl-hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
          <span class="fl-meta">
            <template v-if="!node.is_dir">{{ formatSize(node.size) }} · {{ formatDate(node.modified) }}</template>
            <template v-else-if="node.loaded">{{ t('folderItems', { count: statsOf(node).files }) }} · {{ formatSize(statsOf(node).bytes) }}</template>
            <span v-else-if="lockedInSearch(node)" class="fl-locked-note">{{ t('deepLocked') }}</span>
          </span>
        </span>
        <span v-if="lockedInSearch(node) && !node.lock?.prompting" class="fl-locked-note fl-locked-hint">{{ t('deepLocked') }}</span>
        <span v-if="node.is_dir && node.loaded" class="fl-count">{{ t('folderItems', { count: statsOf(node).files }) }}</span>
        <span
          v-if="node.lock?.prompting && node.lock.error"
          :id="`${uid}-error-${index}`"
          class="fl-unlock-message"
          role="alert"
        >{{ unlockErrorText(node.lock.error) }}</span>
        <button
          v-if="!node.lock && remembered.has(node.path)"
          class="fl-remembered"
          type="button"
          :aria-label="`${t('forgetPassword')} ${node.name}`"
          :title="t('forgetPassword')"
          @click="forgetPassword(node)"
        >
          <Icon name="key" :size="11" />
          {{ t('remembered') }} · {{ t('forgetPassword') }}
        </button>
        <span v-if="node.loading" class="fl-loading" aria-hidden="true">…</span>
      </span>
      <form
        v-if="node.lock?.prompting"
        class="fl-unlock fl-unlock-row"
        @submit.prevent="submitUnlock(node)"
        @keydown.esc.prevent="cancelUnlock(node.lock)"
      >
        <Icon class="fl-unlock-lock" name="lock" :size="18" />
        <input
          v-model="node.lock.input"
          type="password"
          autocomplete="off"
          :data-unlock="node.path"
          :placeholder="node.lock.error ? unlockErrorText(node.lock.error) : t('passwordPlaceholder')"
          :aria-label="t('passwordFor', { name: node.name })"
          :aria-invalid="!!node.lock.error"
          :aria-describedby="node.lock.error ? `${uid}-error-${index}` : undefined"
        />
        <button
          v-if="canRemember"
          class="fl-unlock-remember"
          type="button"
          :aria-pressed="node.lock.remember"
          :aria-label="t('rememberPassword')"
          :title="t('rememberPassword')"
          @click="node.lock.remember = !node.lock.remember"
        ><Icon name="key" /></button>
        <button class="fl-unlock-submit" type="submit" :disabled="node.lock.busy || !node.lock.input">{{ t('open') }}</button>
        <button class="fl-unlock-cancel" type="button" :aria-label="t('cancel')" :title="t('cancel')" @click="cancelUnlock(node.lock)">
          <Icon name="close" :size="14" />
        </button>
      </form>
      <template v-else>
        <span class="fl-cell fl-cell-size">{{ node.is_dir ? '—' : formatSize(node.size) }}</span>
        <span class="fl-cell fl-cell-date">{{ formatDate(node.modified) }}</span>
        <span class="fl-cell fl-cell-op">
          <button
            v-if="node.lock"
            class="fl-action fl-arrow-end fl-lock"
            type="button"
            :aria-label="t('unlockFolder', { name: node.name })"
            @click="toggleExpand(node)"
          >
            <Icon name="lock" :size="18" />
          </button>
          <button
            v-else-if="node.is_dir"
            class="fl-action fl-arrow-end"
            type="button"
            :class="{ 'fl-arrow-open': node.expanded }"
            :aria-label="t(node.expanded ? 'collapse' : 'expand', { name: node.name })"
            :aria-expanded="node.expanded"
            @click="toggleExpand(node)"
          >
            <Icon name="next" :size="18" />
          </button>
          <template v-else>
            <button
              v-if="canPreview(node)"
              class="fl-action fl-preview-btn"
              type="button"
              :aria-label="`${t('preview')} ${node.name}`"
              :title="t('preview')"
              @click="preview(node)"
            ><Icon name="eye" /></button>
            <button
              class="fl-action fl-download"
              type="button"
              :aria-label="`${t('download')} ${node.name}`"
              :title="t('download')"
              @click="download(node)"
            ><Icon name="download" /></button>
          </template>
        </span>
      </template>
    </div>
    </template>

    <div v-if="deepRow" class="fl-deep" role="status">
      <div class="fl-deep-text">
        <template v-if="deepRow === 'running'">
          {{ t('deepRunning', { count: folderCounts.checked }) }} ·
          <button class="fl-deep-link" type="button" @click="pauseDeepSearch">{{ t('deepStop') }}</button>
        </template>
        <template v-else-if="deepRow === 'idle'">
          {{ t('deepHint') }}<button class="fl-deep-link" type="button" @click="deepSearch">{{ t('deepSearch') }}</button>
        </template>
        <template v-else-if="deepRow === 'capped'">
          {{ deepSummary }} ·
          <button class="fl-deep-link" type="button" @click="deepSearch">{{ t('deepContinue') }}</button>
        </template>
        <template v-else>{{ deepSummary }}</template>
      </div>
      <span v-if="deepRow === 'running'" class="fl-deep-bar" aria-hidden="true"></span>
    </div>

    <div class="fl-foot">
      <span>{{ t('loaded', { count: allFiles.length }) }} · {{ t('totalSize', { size: formatSize(totalSize(allFiles)) }) }}</span>
    </div>

    <div v-if="toast" class="fl-toast" role="status">{{ toast }}</div>

    <ConfirmDialog
      :open="!!zipDialog"
      :title="zipDialog?.title ?? ''"
      :text="zipDialog?.text ?? ''"
      :tip="zipDialog?.tip"
      :confirm-label="zipDialog?.confirm"
      :cancel-label="zipDialog?.cancel ?? ''"
      @confirm="confirmZip"
      @close="zipNotice = null"
    />

    <PreviewDialog
      :open="!!previewNode"
      :file="previewNode"
      :labels="text"
      :src="previewSrc"
      :viewer="previewViewer"
      :resolving="previewResolving"
      :error="previewError"
      :demo="demo && !!previewNode && !isDemoFile(previewNode.path)"
      :position="previewPosition"
      :total="previewPosition ? previewList.length : 0"
      @close="closePreview"
      @prev="stepPreview(-1)"
      @next="stepPreview(1)"
      @download="previewNode && download(previewNode)"
    />
  </div>
</template>
