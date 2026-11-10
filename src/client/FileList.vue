<script setup lang="ts">
/**
 * FileList.vue —— VitePress 网盘文件列表（界面沿用 FileList，数据来自 OpenList）
 *
 * 用法：
 *   <FileList base="https://pan.example.com" path="/课程资料" />
 *   <FileList />  // 演示模式
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { FileListLabels, FileListProps, FileListSource } from './types'
import { formatLabel, resolveLabels } from './locales'
import PreviewDialog from './PreviewDialog.vue'
import {
  findRememberedPassword,
  forgetFolderPassword,
  isWithin,
  rememberFolderPassword,
  rememberedFolders,
} from './passwords'
import {
  compareNodes,
  extOf,
  encodePath,
  fileKind,
  fillPreviewUrl,
  formatDate,
  formatSize,
  iframePreviewsFor,
  joinPath,
  previewKind,
  totalSize,
  uniqueEntryName,
  zipEntryName,
} from './utils'
import type { SortKey } from './utils'

interface OLItem {
  name: string
  size: number
  is_dir: boolean
  modified: string
  sign?: string
  raw_url?: string
}

interface FNode extends OLItem {
  path: string
  depth: number
  expanded: boolean
  loaded: boolean
  loading: boolean
  children: FNode[]
  password?: string
  isRoot?: boolean
  /** Path segments of this node inside a batch ZIP. */
  zipPath: string[]
  /** Password given by the site (`password` / `sources[].password`). */
  configuredPassword?: string
  /** OpenList reported that this item needs a password. */
  locked?: boolean
  /** The same-row password input is showing. */
  prompting?: boolean
  unlockInput?: string
  unlockError?: '' | 'wrong' | 'stale'
  unlockRemember?: boolean
  unlockBusy?: boolean
  /** A locked root whose real type could not be read yet. */
  unresolved?: boolean
}

type UnlockError = '' | 'wrong' | 'stale'

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
})

const text = computed<FileListLabels>(() => resolveLabels(props.locale, props.labels))

function t(key: keyof FileListLabels, values?: Record<string, string | number>): string {
  return formatLabel(text.value[key], values)
}

const demo = computed(() => !props.base)
const baseUrl = computed(() => props.base.replace(/\/+$/, ''))
const rootEl = ref<HTMLElement>()

const roots = ref<FNode[]>([])
const loadingRoot = ref(false)
const errorMsg = ref('')
const refreshing = ref(false)
let refreshSeq = 0
/** Single-path mode: the listed folder itself needs a password. */
const rootLock = reactive({ active: false, input: '', error: '' as UnlockError, remember: false, busy: false })
/** Password the visitor typed for the listed folder (single-path mode). */
const rootPassword = ref('')
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const toast = ref('')
const sortKey = ref<SortKey>('name')
const sortAsc = ref(true)
const siteTitle = ref('')
/** OpenList's public `iframe_previews` setting (JSON text). */
const iframePreviews = ref('')
const batchBusy = ref(false)
const batchProgress = ref(0)
const downloadCache = new Map<string, string>()
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(msg: string) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3200)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPasswordError(error: unknown): boolean {
  return /password|密码/i.test(errorText(error))
}

function isNetworkError(error: unknown): boolean {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(errorText(error))
}

/** A failure toast; browser network errors are usually CORS, so say where to look. */
function failureMessage(key: keyof FileListLabels, error: unknown): string {
  const message = t(key, { message: errorText(error) })
  return isNetworkError(error) ? `${message} ${t('networkHint')}` : message
}

/** Total size for display: an empty total reads `0 B`, not `-`. */
function formatTotal(bytes: number): string {
  return bytes > 0 ? formatSize(bytes) : '0 B'
}

/* ---------------- 密码 ---------------- */

const canRemember = computed(() => props.rememberPassword !== false)
const passwordScope = computed(() => baseUrl.value || 'demo')
/** Passwords typed on this page (not necessarily remembered), so a refresh keeps folders open. */
const typedPasswords = new Map<string, string>()

function typedPasswordFor(path: string): string {
  let best = ''
  let bestPath = ''
  for (const [folder, password] of typedPasswords) {
    if (isWithin(path, folder) && folder.length > bestPath.length) {
      best = password
      bestPath = folder
    }
  }
  return best
}

/** Folders with a remembered password (mirrors sessionStorage so the template reacts). */
const rememberedPaths = ref<Set<string>>(new Set())

function syncRemembered() {
  rememberedPaths.value = new Set(canRemember.value ? rememberedFolders(passwordScope.value) : [])
}

function storedPassword(path: string) {
  return canRemember.value ? findRememberedPassword(passwordScope.value, path) : null
}

/**
 * Password for an item: its own or inherited one first (site-configured or
 * typed), then one remembered in this tab, then the component's `password`.
 */
function passwordFor(node: FNode): { password: string; rememberedAt?: string } {
  if (node.password) return { password: node.password }
  const typed = typedPasswordFor(node.path)
  if (typed) return { password: typed }
  const stored = storedPassword(node.path)
  if (stored) return { password: stored.password, rememberedAt: stored.path }
  return { password: props.password }
}

function rootPasswordFor(): { password: string; rememberedAt?: string } {
  if (rootPassword.value) return { password: rootPassword.value }
  const stored = storedPassword(props.path)
  if (stored) return { password: stored.password, rememberedAt: stored.path }
  return { password: props.password }
}

/** A remembered password stopped working: drop it so we do not keep retrying it. */
function dropStale(path: string | undefined): boolean {
  if (!path) return false
  forgetFolderPassword(passwordScope.value, path)
  syncRemembered()
  return true
}

function focusUnlock(path: string) {
  void nextTick(() => {
    const input = rootEl.value?.querySelector<HTMLInputElement>(`input[data-unlock="${CSS.escape(path)}"]`)
    input?.focus()
  })
}

/** Show the same-row password input; `focus` only for user actions, never on page load. */
function startPrompt(node: FNode, focus: boolean) {
  node.prompting = true
  if (focus) focusUnlock(node.path)
}

function cancelUnlock(node: FNode) {
  node.prompting = false
  node.unlockInput = ''
  node.unlockError = ''
}

function unlockErrorText(error: UnlockError | undefined): string {
  if (error === 'wrong') return t('passwordWrong')
  if (error === 'stale') return t('passwordStale')
  return ''
}

/* ---------------- 演示数据 ---------------- */
const DEMO_TREE: Record<string, OLItem[]> = {
  '/': [
    { name: 'assignments', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'exams', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'materials', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'notes', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'slides', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: '加密示例（密码 1234）', size: 0, is_dir: true, modified: '2026-10-20T18:00:00+08:00' },
  ],
  '/assignments': [
    { name: '线代作业参考答案', size: 0, is_dir: true, modified: '2026-10-12T21:30:00+08:00' },
    { name: '作业提交说明.pdf', size: 186_432, is_dir: false, modified: '2026-09-03T10:15:00+08:00' },
  ],
  '/assignments/线代作业参考答案': [
    { name: '第1次作业参考答案.doc', size: 412_672, is_dir: false, modified: '2026-09-15T22:41:00+08:00' },
    { name: '第2次作业参考答案.pdf', size: 1_048_576, is_dir: false, modified: '2026-09-22T22:03:00+08:00' },
    { name: '第3次作业参考答案.pdf', size: 986_112, is_dir: false, modified: '2026-09-29T21:57:00+08:00' },
    { name: '第4次作业参考答案.pdf', size: 1_572_864, is_dir: false, modified: '2026-10-13T22:10:00+08:00' },
  ],
  '/exams': [
    { name: '2023 期末试题和答案.pdf', size: 2_345_678, is_dir: false, modified: '2025-01-18T09:20:00+08:00' },
    { name: '2024 期中试题.pdf', size: 1_234_567, is_dir: false, modified: '2025-11-02T14:08:00+08:00' },
    { name: '代数与几何-多年合集-试题和答案.pdf', size: 18_874_368, is_dir: false, modified: '2025-01-18T09:25:00+08:00' },
  ],
  '/materials': [
    { name: '线性代数及其应用（Lay 第5版）.pdf', size: 48_231_424, is_dir: false, modified: '2024-07-29T16:44:00+08:00' },
    { name: 'Introduction to Linear Algebra（Strang）.pdf', size: 36_700_160, is_dir: false, modified: '2024-07-29T16:50:00+08:00' },
    { name: '疑难解答与习题指导.zip', size: 9_437_184, is_dir: false, modified: '2024-08-05T11:12:00+08:00' },
  ],
  '/notes': [
    { name: '线性代数笔记（106页）.pdf', size: 12_582_912, is_dir: false, modified: '2025-06-30T20:31:00+08:00' },
    { name: '期末复习提纲.docx', size: 245_760, is_dir: false, modified: '2026-01-05T19:02:00+08:00' },
  ],
  '/加密示例（密码 1234）': [
    { name: '期末答案（教师版）.pdf', size: 2_621_440, is_dir: false, modified: '2026-10-20T18:00:00+08:00' },
    { name: '成绩登记表.xlsx', size: 48_128, is_dir: false, modified: '2026-10-21T09:12:00+08:00' },
  ],
  '/slides': [
    { name: '第一章 行列式.pptx', size: 3_145_728, is_dir: false, modified: '2026-09-08T13:26:00+08:00' },
    { name: '第二章 矩阵.pptx', size: 4_194_304, is_dir: false, modified: '2026-09-15T13:30:00+08:00' },
  ],
}

/** Demo-only folder passwords, so the demo can show the password flow. */
const DEMO_PASSWORDS: Record<string, string> = { '/加密示例（密码 1234）': '1234' }

/* ---------------- OpenList 接口 ---------------- */
class ApiError extends Error {
  code: number

  constructor(message: string, code: number) {
    super(message)
    this.code = code
  }
}

/** JSON content type only when there is a body: a bare GET then needs no CORS preflight. */
function authHeaders(json: boolean): Record<string, string> {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(props.token ? { Authorization: props.token } : {}),
  }
}

async function request<T>(apiPath: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl.value}${apiPath}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: authHeaders(body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => null)) as
    | { code?: number; message?: string; data?: T }
    | null
  if (!payload) throw new ApiError(`HTTP ${response.status}`, response.status)
  if (payload.code !== 200) {
    throw new ApiError(payload.message || `HTTP ${response.status}`, payload.code ?? response.status)
  }
  return payload.data as T
}


async function listDir(path: string, password: string): Promise<OLItem[]> {
  if (demo.value) {
    await new Promise((resolve) => setTimeout(resolve, 220))
    const guard = Object.entries(DEMO_PASSWORDS).find(([folder]) => isWithin(path, folder))
    if (guard && guard[1] !== password) {
      throw new ApiError('password is incorrect or you have no permission', 403)
    }
    return DEMO_TREE[path] ?? []
  }
  const data = await request<{ content?: OLItem[] }>('/api/fs/list', {
    path,
    password,
    page: 1,
    per_page: 0,
    refresh: false,
  })
  return data?.content ?? []
}

function absoluteUrl(raw: string): string {
  if (!raw) return ''
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw
  const root = baseUrl.value || (typeof window !== 'undefined' ? window.location.origin : '')
  try {
    return new URL(raw, `${root}/`).href
  } catch {
    return raw
  }
}

async function resolveUrl(node: FNode): Promise<string> {
  if (demo.value) return ''
  if (node.raw_url) return absoluteUrl(node.raw_url)
  const cached = downloadCache.get(node.path)
  if (cached) return cached
  let url = ''
  try {
    const data = await request<{ raw_url?: string }>('/api/fs/get', {
      path: node.path,
      password: passwordFor(node).password,
    })
    url = absoluteUrl(data?.raw_url ?? '')
  } catch {
    url = ''
  }
  if (!url) url = directUrl(node)
  downloadCache.set(node.path, url)
  return url
}

/** OpenList's signed `/d/` download link for a file. */
function directUrl(node: FNode): string {
  return `${baseUrl.value}/d${encodePath(node.path)}${node.sign ? `?sign=${encodeURIComponent(node.sign)}` : ''}`
}

async function loadSiteTitle() {
  if (demo.value) return
  try {
    const data = await request<{ site_title?: string; title?: string; iframe_previews?: string }>(
      '/api/public/settings',
    )
    siteTitle.value = data?.site_title || data?.title || ''
    iframePreviews.value = data?.iframe_previews || ''
  } catch {
    siteTitle.value = ''
    iframePreviews.value = ''
  }
}

/* ---------------- 树状态 ---------------- */
function sortTree(nodes: FNode[]) {
  nodes.sort((a, b) => compareNodes(a, b, sortKey.value, sortAsc.value))
  for (const node of nodes) {
    if (node.children.length) sortTree(node.children)
  }
}

function toNodes(
  items: OLItem[],
  parent: string,
  depth: number,
  password = '',
  zipParent: string[] = [],
): FNode[] {
  return items.map((item) => ({
    ...item,
    path: joinPath(parent, item.name),
    depth,
    expanded: false,
    loaded: false,
    loading: false,
    children: [],
    password,
    zipPath: [...zipParent, item.name],
  }))
}

function setSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = true
  }
  resortAll()
}

function resortAll() {
  if (props.sources.length) {
    for (const root of roots.value) {
      if (root.children.length) sortTree(root.children)
    }
  } else {
    sortTree(roots.value)
  }
}

function sourceName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

/**
 * Load a folder's children. A password error marks the folder locked instead of
 * toasting; `prompt` also shows its same-row input (and focuses it).
 */
async function loadChildren(node: FNode, prompt: false | 'show' | 'focus' = false): Promise<boolean> {
  if (node.loaded) return true
  if (node.locked) {
    if (prompt) startPrompt(node, prompt === 'focus')
    return false
  }
  node.loading = true
  const { password, rememberedAt } = passwordFor(node)
  try {
    const items = await listDir(node.path, password)
    node.children = toNodes(items, node.path, node.depth + 1, node.password, node.zipPath)
    sortTree(node.children)
    node.loaded = true
    return true
  } catch (error) {
    if (isPasswordError(error)) {
      node.locked = true
      node.expanded = false
      node.unlockError = dropStale(rememberedAt) ? 'stale' : ''
      if (prompt) startPrompt(node, prompt === 'focus')
    } else {
      showToast(failureMessage('folderFailed', error))
    }
    return false
  } finally {
    node.loading = false
  }
}

/** Submit the same-row password for a locked folder (or a locked root of unknown type). */
async function submitUnlock(node: FNode) {
  const password = node.unlockInput ?? ''
  if (!password || node.unlockBusy) return
  node.unlockBusy = true
  try {
    if (node.unresolved) {
      const data = await request<OLItem>('/api/fs/get', { path: node.path, password })
      const name = node.name
      Object.assign(node, data, { name })
      if (node.is_dir) node.zipPath = [name]
      else node.zipPath = [data.name || node.zipPath[0]]
      node.unresolved = false
    }
    if (node.is_dir) {
      const items = await listDir(node.path, password)
      node.children = toNodes(items, node.path, node.depth + 1, password, node.zipPath)
      sortTree(node.children)
      node.loaded = true
      node.expanded = true
    }
    node.password = password
    typedPasswords.set(node.path, password)
    if (node.unlockRemember && canRemember.value) {
      rememberFolderPassword(passwordScope.value, node.path, password)
      syncRemembered()
    }
    node.locked = false
    node.prompting = false
    node.unlockError = ''
    node.unlockInput = ''
    node.unlockRemember = false
  } catch (error) {
    if (isPasswordError(error)) {
      node.unlockError = 'wrong'
      node.unlockInput = ''
      focusUnlock(node.path)
    } else {
      showToast(failureMessage('folderFailed', error))
    }
  } finally {
    node.unlockBusy = false
  }
}

/** Forget a remembered password: the folder folds up and asks again next time. */
function forgetPassword(node: FNode) {
  forgetFolderPassword(passwordScope.value, node.path)
  typedPasswords.delete(node.path)
  syncRemembered()
  node.password = node.configuredPassword || ''
  node.expanded = false
  node.loaded = false
  node.children = []
  node.locked = false
  selected.value = new Set([...selected.value].filter((path) => !isWithin(path, node.path)))
  for (const key of [...downloadCache.keys()]) if (isWithin(key, node.path)) downloadCache.delete(key)
}

/** When OpenList cannot tell us, guess from the name: a known file extension means a file. */
function looksLikeFile(path: string): boolean {
  const name = sourceName(path)
  return fileKind(name) !== 'other' || previewKind(name) !== 'none'
}

async function loadSourceRoot(source: FileListSource, expanded: boolean): Promise<FNode> {
  const path = source.path
  const configured = source.password ?? ''
  let item: OLItem = { name: sourceName(path), size: 0, is_dir: !looksLikeFile(path), modified: '' }
  let locked = false
  let unlockError: UnlockError = ''
  if (!demo.value) {
    const { password, rememberedAt } = configured
      ? { password: configured, rememberedAt: undefined }
      : (() => {
          const stored = storedPassword(path)
          return stored
            ? { password: stored.password, rememberedAt: stored.path }
            : { password: props.password, rememberedAt: undefined }
        })()
    try {
      const data = await request<OLItem>('/api/fs/get', { path, password })
      item = { ...item, ...data }
    } catch (error) {
      if (isPasswordError(error)) {
        locked = true
        unlockError = dropStale(rememberedAt) ? 'stale' : ''
      }
      // Otherwise keep the guess; expanding surfaces the real error.
    }
  }
  const name = source.title || item.name || sourceName(path)
  return {
    ...item,
    name,
    path,
    depth: 0,
    expanded,
    loaded: false,
    loading: false,
    children: [],
    password: configured,
    configuredPassword: configured,
    isRoot: true,
    locked,
    unresolved: locked,
    unlockError,
    prompting: locked && expanded,
    // A file root keeps its real file name (and extension) inside the ZIP.
    zipPath: [item.is_dir ? name : item.name || sourceName(path)],
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
async function buildTree(expandedPaths?: Set<string>): Promise<FNode[]> {
  let nodes: FNode[]
  if (props.sources.length) {
    nodes = await Promise.all(
      props.sources.map((source) =>
        loadSourceRoot(source, expandedPaths ? expandedPaths.has(source.path) : source.expanded ?? props.expanded),
      ),
    )
  } else {
    const { password, rememberedAt } = rootPasswordFor()
    let items: OLItem[]
    try {
      items = await listDir(props.path, password)
    } catch (error) {
      if (isPasswordError(error)) throw new RootLockedError(rememberedAt)
      throw error
    }
    nodes = toNodes(items, props.path, 0, rootPassword.value)
    sortTree(nodes)
  }
  const open = async (list: FNode[]) => {
    for (const node of list) {
      if (!node.is_dir || node.locked || !node.expanded && !expandedPaths?.has(node.path)) continue
      node.expanded = await loadChildren(node, 'show')
      if (node.expanded && expandedPaths) await open(node.children)
    }
  }
  await open(nodes)
  return nodes
}

/** First load, or a retry after an error: shows the loading state. */
async function loadRoot() {
  refreshSeq += 1
  refreshing.value = false
  loadingRoot.value = true
  errorMsg.value = ''
  try {
    roots.value = await buildTree()
    rootLock.active = false
    selected.value = new Set()
    downloadCache.clear()
  } catch (error) {
    if (error instanceof RootLockedError) {
      roots.value = []
      rootLock.active = true
      rootLock.error = dropStale(error.rememberedAt) ? 'stale' : ''
    } else {
      errorMsg.value = errorText(error)
    }
  } finally {
    loadingRoot.value = false
  }
}

function expandedPathsOf(nodes: FNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.is_dir && node.expanded) {
      out.add(node.path)
      expandedPathsOf(node.children, out)
    }
  }
  return out
}

/**
 * Refresh keeps the old rows in place (dimmed) until the new tree is ready, then
 * swaps it in. Open folders stay open; selected files that still exist stay selected.
 */
async function refresh() {
  if (refreshing.value || loadingRoot.value) return
  if (!roots.value.length || errorMsg.value || rootLock.active) {
    await loadRoot()
    return
  }
  const seq = ++refreshSeq
  refreshing.value = true
  try {
    const fresh = await buildTree(expandedPathsOf(roots.value))
    if (seq !== refreshSeq) return
    roots.value = fresh
    const existing = new Set(fresh.flatMap(descendantFiles).map((file) => file.path))
    selected.value = new Set([...selected.value].filter((path) => existing.has(path)))
    downloadCache.clear()
  } catch (error) {
    if (seq !== refreshSeq) return
    if (error instanceof RootLockedError) {
      // The listed folder's password changed: ask again.
      roots.value = []
      rootLock.active = true
      rootLock.error = dropStale(error.rememberedAt) ? 'stale' : 'wrong'
      selected.value = new Set()
    } else {
      showToast(failureMessage('refreshFailed', error))
    }
  } finally {
    if (seq === refreshSeq) refreshing.value = false
  }
}

/** Single-path mode: unlock the listed folder itself. */
async function submitRootUnlock() {
  const password = rootLock.input
  if (!password || rootLock.busy) return
  rootLock.busy = true
  try {
    const items = await listDir(props.path, password)
    rootPassword.value = password
    if (rootLock.remember && canRemember.value) {
      rememberFolderPassword(passwordScope.value, props.path, password)
      syncRemembered()
    }
    const nodes = toNodes(items, props.path, 0, password)
    sortTree(nodes)
    roots.value = nodes
    Object.assign(rootLock, { active: false, input: '', error: '', remember: false })
    selected.value = new Set()
    downloadCache.clear()
  } catch (error) {
    if (isPasswordError(error)) {
      rootLock.error = 'wrong'
      rootLock.input = ''
      focusUnlock(props.path)
    } else {
      showToast(failureMessage('loadFailed', error))
    }
  } finally {
    rootLock.busy = false
  }
}

async function toggleExpand(node: FNode) {
  if (node.locked) {
    startPrompt(node, true)
    return
  }
  if (!node.is_dir) return
  if (node.expanded) {
    node.expanded = false
    return
  }
  if (!(await loadChildren(node, 'focus'))) return
  node.expanded = true
}

const visible = computed<FNode[]>(() => {
  const out: FNode[] = []
  const query = keyword.value.trim().toLowerCase()
  const matches = (node: FNode): boolean =>
    !query ||
    node.name.toLowerCase().includes(query) ||
    (node.is_dir && node.children.some(matches))
  const walk = (nodes: FNode[]) => {
    for (const node of nodes) {
      if (!matches(node)) continue
      out.push(node)
      if (node.is_dir && (node.expanded || query) && node.children.length) {
        walk(node.children)
      }
    }
  }
  walk(roots.value)
  return out
})

/* ---------------- 勾选与批量下载 ---------------- */
function descendantFiles(node: FNode): FNode[] {
  if (!node.is_dir) return [node]
  return node.children.flatMap(descendantFiles)
}

function isChecked(node: FNode): boolean {
  const files = descendantFiles(node)
  return files.length > 0 && files.every((file) => selected.value.has(file.path))
}

function isIndeterminate(node: FNode): boolean {
  const files = descendantFiles(node)
  const hit = files.filter((file) => selected.value.has(file.path)).length
  return hit > 0 && hit < files.length
}

/**
 * Load a directory and all of its sub-directories. Stops at the first folder
 * that needs a password and returns it, so nothing is silently left out.
 */
async function loadTree(node: FNode): Promise<{ ok: boolean; locked?: FNode }> {
  if (!node.is_dir) return { ok: true }
  if (!(await loadChildren(node))) return node.locked ? { ok: false, locked: node } : { ok: false }
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
    if (result.ok) node.expanded = true
    else {
      if (result.locked) startPrompt(result.locked, true)
      if (input) input.checked = isChecked(node)
      return
    }
  }
  const files = descendantFiles(node)
  if (!files.length) {
    if (input) input.checked = false
    return
  }
  const next = new Set(selected.value)
  if (files.every((file) => next.has(file.path))) {
    files.forEach((file) => next.delete(file.path))
  } else {
    files.forEach((file) => next.add(file.path))
  }
  selected.value = next
}

const allFiles = computed(() => roots.value.flatMap(descendantFiles))
const allChecked = computed(
  () =>
    allFiles.value.length > 0 &&
    allFiles.value.every((file) => selected.value.has(file.path)),
)
const someChecked = computed(
  () => !allChecked.value && allFiles.value.some((file) => selected.value.has(file.path)),
)

const selectedFiles = computed(() => allFiles.value.filter((file) => selected.value.has(file.path)))
const selectedBytes = computed(() => totalSize(selectedFiles.value))
const loadedBytes = computed(() => totalSize(allFiles.value))

function clearSelection() {
  selected.value = new Set()
}

function folderFiles(node: FNode): FNode[] {
  return node.is_dir && node.loaded ? descendantFiles(node) : []
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
    sortKey.value = key
    sortAsc.value = direction !== 'desc'
    resortAll()
  },
})

function toggleCheckAll() {
  selected.value = allChecked.value
    ? new Set()
    : new Set(allFiles.value.map((file) => file.path))
}

function triggerUrl(url: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function triggerBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(href)
}

async function download(node: FNode) {
  if (node.is_dir) return
  if (demo.value) {
    showToast(t('demoDownload', { name: node.name }))
    return
  }
  try {
    triggerUrl(await resolveUrl(node))
  } catch (error) {
    showToast(t('downloadFailed', { message: errorText(error) }))
  }
}

/* ---------------- 预览（弹窗，不跳转） ---------------- */

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
const previewPosition = computed(() =>
  previewNode.value ? previewList.value.indexOf(previewNode.value) + 1 : 0,
)

async function preview(node: FNode) {
  const seq = ++previewSeq
  previewNode.value = node
  previewSrc.value = ''
  previewViewer.value = ''
  previewError.value = ''
  previewResolving.value = false
  if (demo.value || !canPreview(node)) return
  previewResolving.value = true
  try {
    const url = await resolveUrl(node)
    if (seq !== previewSeq) return
    previewSrc.value = url
    if (previewKind(node.name) === 'pdf') {
      const viewer = iframePreviewsFor(node.name, iframePreviews.value)[0]
      if (viewer) {
        previewViewer.value = fillPreviewUrl(viewer.scheme, {
          name: node.name,
          rawUrl: url,
          downloadUrl: directUrl(node),
        })
      }
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

async function batchDownload() {
  const files = allFiles.value.filter((file) => selected.value.has(file.path))
  if (!files.length) return
  if (demo.value) {
    showToast(t('demoBatch', { count: files.length }))
    return
  }
  batchBusy.value = true
  batchProgress.value = 0
  try {
    const entries: Record<string, Uint8Array> = {}
    const usedNames = new Set<string>()
    const queue = [...files]
    let done = 0
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift()
        if (!file) break
        const response = await fetch(await resolveUrl(file))
        if (!response.ok) throw new Error(`${file.name}：HTTP ${response.status}`)
        entries[uniqueEntryName(zipEntryName(file.zipPath), usedNames)] = new Uint8Array(
          await response.arrayBuffer(),
        )
        done += 1
        batchProgress.value = Math.round((done / files.length) * 90)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(3, files.length) }, () => worker()),
    )
    const { zip } = await import('fflate')
    const data = await new Promise<Uint8Array>((resolve, reject) => {
      zip(entries, (error, output) => (error ? reject(error) : resolve(output)))
    })
    batchProgress.value = 100
    triggerBlob(
      new Blob([data as unknown as BlobPart], { type: 'application/zip' }),
      `${(props.title || t('defaultZip')).replace(/[\\/:*?"<>|]/g, '_')}.zip`,
    )
    selected.value = new Set()
  } catch (error) {
    showToast(t('batchFailed', { message: errorText(error) }))
  } finally {
    batchBusy.value = false
  }
}

/* ---------------- 展示辅助 ---------------- */

const displayTitle = computed(
  () => props.title || siteTitle.value || (props.path === '/' ? t('allFiles') : props.path),
)

/*
 * In narrow containers the selection bar sticks below the theme's fixed bars.
 * VitePress 1 and 2 pin different bars at different widths, so measure them.
 * `--fl-sticky-top` on the component overrides the measured value.
 */
const stickyTop = ref(0)

function measureStickyTop() {
  if (typeof document === 'undefined') return
  let top = 0
  for (const el of document.querySelectorAll<HTMLElement>('.VPNav, .VPLocalNav')) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || (style.position !== 'fixed' && style.position !== 'sticky')) continue
    top = Math.max(top, (Number.parseFloat(style.top) || 0) + el.offsetHeight)
  }
  stickyTop.value = top
}

onMounted(() => {
  syncRemembered()
  void loadRoot()
  void loadSiteTitle()
  measureStickyTop()
  window.addEventListener('resize', measureStickyTop, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', measureStickyTop)
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
      <div v-if="selected.size" class="fl-selection" role="status">
        <span class="fl-selection-count">{{ t('selected', { count: selected.size }) }}</span>
        <span class="fl-selection-size">{{ t('totalSize', { size: formatTotal(selectedBytes) }) }}</span>
      </div>
      <div v-else class="fl-title">
        <span class="fl-title-text">{{ displayTitle }}</span>
        <span v-if="demo" class="fl-demo-badge">{{ t('demoBadge') }}</span>
      </div>
      <button
        v-if="selected.size"
        class="fl-clear"
        type="button"
        :aria-label="t('clearSelection')"
        :title="t('clearSelection')"
        @click="clearSelection"
      >
        <svg class="fl-clear-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
        <span class="fl-clear-text">{{ t('clear') }}</span>
      </button>
      <div class="fl-tools">
        <label class="fl-search">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input v-model="keyword" type="text" :placeholder="t('filter')" :aria-label="t('filter')" />
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
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
        </button>
      </div>
      <button
        v-if="selected.size"
        class="fl-btn fl-btn-primary"
        type="button"
        :disabled="batchBusy"
        @click="batchDownload"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        {{ batchBusy ? t('batching', { percent: batchProgress }) : t('batch') }}
      </button>
    </div>

    <div class="fl-row fl-head">
      <span v-if="refreshing" class="fl-progress" aria-hidden="true"></span>
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :aria-label="t('selectAll')"
          :checked="allChecked"
          :indeterminate.prop="someChecked"
          @change="toggleCheckAll"
        />
      </label>
      <span class="fl-cell fl-cell-name">
        <button class="fl-sort-btn" type="button" :aria-sort="sortKey === 'name' ? (sortAsc ? 'ascending' : 'descending') : undefined" @click="setSort('name')">
          {{ t('columnName') }}<span class="fl-sort" aria-hidden="true">{{ sortKey === 'name' ? (sortAsc ? '▲' : '▼') : '' }}</span>
        </button>
      </span>
      <span class="fl-cell fl-cell-size">
        <button class="fl-sort-btn" type="button" @click="setSort('size')">
          {{ t('columnSize') }}<span class="fl-sort" aria-hidden="true">{{ sortKey === 'size' ? (sortAsc ? '▲' : '▼') : '' }}</span>
        </button>
      </span>
      <span class="fl-cell fl-cell-date">
        <button class="fl-sort-btn" type="button" @click="setSort('modified')">
          {{ t('columnDate') }}<span class="fl-sort" aria-hidden="true">{{ sortKey === 'modified' ? (sortAsc ? '▲' : '▼') : '' }}</span>
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

    <div v-if="loadingRoot" class="fl-status">{{ t('loading') }}</div>
    <form
      v-else-if="rootLock.active"
      class="fl-unlock-root"
      :class="{ 'fl-unlock-error': rootLock.error }"
      @submit.prevent="submitRootUnlock"
    >
      <svg class="fl-unlock-lock" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      <label class="fl-unlock-label" :for="`fl-root-unlock-${path}`">{{ t('passwordPrompt') }}</label>
      <span v-if="rootLock.error" id="fl-root-unlock-error" class="fl-unlock-message" role="alert">{{ unlockErrorText(rootLock.error) }}</span>
      <span class="fl-unlock">
        <input
          :id="`fl-root-unlock-${path}`"
          v-model="rootLock.input"
          type="password"
          autocomplete="off"
          :data-unlock="path"
          :placeholder="t('passwordPlaceholder')"
          :aria-invalid="!!rootLock.error"
          :aria-describedby="rootLock.error ? 'fl-root-unlock-error' : undefined"
        />
        <button
          v-if="canRemember"
          class="fl-unlock-remember"
          type="button"
          :aria-pressed="rootLock.remember"
          :aria-label="t('rememberPassword')"
          :title="t('rememberPassword')"
          @click="rootLock.remember = !rootLock.remember"
        ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /></svg></button>
        <button class="fl-unlock-submit" type="submit" :disabled="rootLock.busy || !rootLock.input">{{ t('open') }}</button>
      </span>
    </form>
    <div v-else-if="errorMsg" class="fl-status fl-error">
      {{ t('loadFailed', { message: errorMsg }) }}
      <p v-if="/guest/i.test(errorMsg)" class="fl-hint">
        {{ t('guestHint') }}
      </p>
      <p v-if="/failed to fetch|networkerror/i.test(errorMsg)" class="fl-hint">
        {{ t('corsHint') }}
      </p>
      <button class="fl-btn" type="button" @click="loadRoot">{{ t('retry') }}</button>
    </div>
    <div v-else-if="visible.length === 0" class="fl-status">{{ t('empty') }}</div>

    <div
      v-for="node in visible"
      :key="node.path"
      class="fl-row"
      :class="{
        'fl-row-dir': node.is_dir,
        'fl-row-root': node.isRoot,
        'fl-row-selected': !node.is_dir && selected.has(node.path),
        'fl-row-locked': node.locked,
        'fl-row-prompting': node.locked && node.prompting,
        'fl-row-error': node.locked && node.prompting && !!node.unlockError,
      }"
      :style="{ '--fl-depth': node.depth }"
    >
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :disabled="node.locked"
          :aria-label="t('selectItem', { name: node.name })"
          :checked="isChecked(node)"
          :indeterminate.prop="isIndeterminate(node)"
          @change="toggleCheck(node, $event)"
        />
      </label>
      <span class="fl-cell fl-cell-name" :title="node.isRoot ? node.path : undefined">
        <span class="fl-indent" aria-hidden="true"></span>
        <button
          v-if="node.locked"
          class="fl-arrow fl-lock"
          type="button"
          :aria-label="t('unlockFolder', { name: node.name })"
          :title="t('unlockFolder', { name: node.name })"
          @click="toggleExpand(node)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
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
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <span v-else class="fl-arrow-placeholder" aria-hidden="true"></span>
        <svg v-if="node.is_dir" class="fl-folder-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        <span v-else class="fl-type" :data-kind="fileKind(node.name)" aria-hidden="true">{{ extOf(node.name) || 'FILE' }}</span>
        <span class="fl-label">
          <span
            class="fl-name"
            :class="{ 'fl-name-dir': node.is_dir }"
            @click="node.locked || node.is_dir ? toggleExpand(node) : download(node)"
          >{{ node.name }}</span>
          <span class="fl-meta">
            <template v-if="node.is_dir">
              <template v-if="node.loaded">{{ t('folderItems', { count: folderFiles(node).length }) }} · {{ formatTotal(totalSize(folderFiles(node))) }}</template>
            </template>
            <template v-else>{{ formatSize(node.size) }} · {{ formatDate(node.modified) }}</template>
          </span>
        </span>
        <span v-if="node.is_dir && node.loaded" class="fl-count">{{ t('folderItems', { count: folderFiles(node).length }) }}</span>
        <span
          v-if="node.locked && node.prompting && node.unlockError"
          :id="`fl-unlock-error-${node.path}`"
          class="fl-unlock-message"
          role="alert"
        >{{ unlockErrorText(node.unlockError) }}</span>
        <button
          v-if="!node.locked && rememberedPaths.has(node.path)"
          class="fl-remembered"
          type="button"
          :aria-label="`${t('forgetPassword')} ${node.name}`"
          :title="t('forgetPassword')"
          @click="forgetPassword(node)"
        >
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /></svg>
          {{ t('remembered') }} · {{ t('forgetPassword') }}
        </button>
        <span v-if="node.loading" class="fl-loading" aria-hidden="true">…</span>
      </span>
      <form
        v-if="node.locked && node.prompting"
        class="fl-unlock fl-unlock-row"
        @submit.prevent="submitUnlock(node)"
        @keydown.esc.prevent="cancelUnlock(node)"
      >
        <svg class="fl-unlock-lock" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <input
          v-model="node.unlockInput"
          type="password"
          autocomplete="off"
          :data-unlock="node.path"
          :placeholder="node.unlockError ? unlockErrorText(node.unlockError) : t('passwordPlaceholder')"
          :aria-label="t('passwordFor', { name: node.name })"
          :aria-invalid="!!node.unlockError"
          :aria-describedby="node.unlockError ? `fl-unlock-error-${node.path}` : undefined"
        />
        <button
          v-if="canRemember"
          class="fl-unlock-remember"
          type="button"
          :aria-pressed="!!node.unlockRemember"
          :aria-label="t('rememberPassword')"
          :title="t('rememberPassword')"
          @click="node.unlockRemember = !node.unlockRemember"
        ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /></svg></button>
        <button class="fl-unlock-submit" type="submit" :disabled="node.unlockBusy || !node.unlockInput">{{ t('open') }}</button>
        <button class="fl-unlock-cancel" type="button" :aria-label="t('cancel')" :title="t('cancel')" @click="cancelUnlock(node)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
        </button>
      </form>
      <template v-else>
      <span class="fl-cell fl-cell-size">{{ node.is_dir || node.locked ? '—' : formatSize(node.size) }}</span>
      <span class="fl-cell fl-cell-date">{{ formatDate(node.modified) }}</span>
      <span class="fl-cell fl-cell-op">
        <button
          v-if="node.locked"
          class="fl-action fl-arrow-end fl-lock"
          type="button"
          :aria-label="t('unlockFolder', { name: node.name })"
          @click="toggleExpand(node)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
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
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <template v-else-if="!node.locked">
          <button
            v-if="canPreview(node)"
            class="fl-action fl-download"
            type="button"
            :aria-label="`${t('preview')} ${node.name}`"
            :title="t('preview')"
            @click="preview(node)"
          ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg></button>
          <button
            class="fl-action fl-download"
            type="button"
            :aria-label="`${t('download')} ${node.name}`"
            :title="t('download')"
            @click="download(node)"
          ><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg></button>
        </template>
      </span>
      </template>
    </div>

    <div class="fl-foot">
      <span>{{ t('loaded', { count: allFiles.length }) }} · {{ t('totalSize', { size: formatTotal(loadedBytes) }) }}</span>
    </div>

    <div v-if="toast" class="fl-toast" role="status">{{ toast }}</div>

    <PreviewDialog
      :open="!!previewNode"
      :file="previewNode"
      :labels="text"
      :src="previewSrc"
      :viewer="previewViewer"
      :resolving="previewResolving"
      :error="previewError"
      :demo="demo"
      :position="previewPosition"
      :total="previewPosition ? previewList.length : 0"
      @close="closePreview"
      @prev="stepPreview(-1)"
      @next="stepPreview(1)"
      @download="previewNode && download(previewNode)"
    />
  </div>
</template>
