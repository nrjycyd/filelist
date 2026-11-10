<script setup lang="ts">
/**
 * FileList.vue —— VitePress 网盘文件列表（界面沿用 FileList，数据来自 OpenList）
 *
 * 用法：
 *   <FileList base="https://pan.example.com" path="/课程资料" />
 *   <FileList />  // 演示模式
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { FileListLabels, FileListProps, FileListSource } from './types'
import { formatLabel, resolveLabels } from './locales'
import {
  compareNodes,
  extOf,
  fileKind,
  formatDate,
  formatSize,
  joinPath,
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
}

const props = withDefaults(defineProps<FileListProps>(), {
  base: '',
  path: '/',
  sources: () => [] as FileListSource[],
  expanded: false,
  token: '',
  password: '',
  title: '',
  locale: 'zh-CN',
})

const text = computed<FileListLabels>(() => resolveLabels(props.locale, props.labels))

function t(key: keyof FileListLabels, values?: Record<string, string | number>): string {
  return formatLabel(text.value[key], values)
}

const demo = computed(() => !props.base)
const baseUrl = computed(() => props.base.replace(/\/+$/, ''))
const activePassword = ref(props.password)

const roots = ref<FNode[]>([])
const loadingRoot = ref(false)
const errorMsg = ref('')
const needsPassword = ref(false)
const passwordInput = ref('')
const keyword = ref('')
const selected = ref<Set<string>>(new Set())
const toast = ref('')
const sortKey = ref<SortKey>('name')
const sortAsc = ref(true)
const siteTitle = ref('')
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

/* ---------------- 演示数据 ---------------- */
const DEMO_TREE: Record<string, OLItem[]> = {
  '/': [
    { name: 'assignments', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'exams', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'materials', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'notes', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'slides', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
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
  '/slides': [
    { name: '第一章 行列式.pptx', size: 3_145_728, is_dir: false, modified: '2026-09-08T13:26:00+08:00' },
    { name: '第二章 矩阵.pptx', size: 4_194_304, is_dir: false, modified: '2026-09-15T13:30:00+08:00' },
  ],
}

/* ---------------- OpenList 接口 ---------------- */
class ApiError extends Error {
  code: number

  constructor(message: string, code: number) {
    super(message)
    this.code = code
  }
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(props.token ? { Authorization: props.token } : {}),
  }
}

async function request<T>(apiPath: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl.value}${apiPath}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: authHeaders(),
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


async function listDir(path: string, password = activePassword.value): Promise<OLItem[]> {
  if (demo.value) {
    await new Promise((resolve) => setTimeout(resolve, 220))
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
      password: node.password || activePassword.value,
    })
    url = absoluteUrl(data?.raw_url ?? '')
  } catch {
    url = ''
  }
  if (!url) {
    const encoded = node.path.split('/').map(encodeURIComponent).join('/')
    url = `${baseUrl.value}/d${encoded}${node.sign ? `?sign=${encodeURIComponent(node.sign)}` : ''}`
  }
  downloadCache.set(node.path, url)
  return url
}

async function loadSiteTitle() {
  if (demo.value) return
  try {
    const data = await request<{ site_title?: string; title?: string }>('/api/public/settings')
    siteTitle.value = data?.site_title || data?.title || ''
  } catch {
    siteTitle.value = ''
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

async function loadChildren(node: FNode): Promise<boolean> {
  if (node.loaded) return true
  node.loading = true
  try {
    const items = await listDir(node.path, node.password || activePassword.value)
    node.children = toNodes(items, node.path, node.depth + 1, node.password, node.zipPath)
    sortTree(node.children)
    node.loaded = true
    return true
  } catch (error) {
    if (isPasswordError(error)) needsPassword.value = true
    showToast(t('folderFailed', { message: errorText(error) }))
    return false
  } finally {
    node.loading = false
  }
}

async function loadSourceRoot(source: FileListSource): Promise<FNode> {
  const path = source.path
  const password = source.password ?? ''
  let item: OLItem = { name: sourceName(path), size: 0, is_dir: true, modified: '' }
  if (demo.value) {
    if (/\/[^/]+\.[^/]+$/.test(path)) {
      item = { ...item, is_dir: false, modified: '2026-09-01T08:00:00+08:00' }
    }
  } else {
    try {
      const data = await request<OLItem>('/api/fs/get', {
        path,
        password: password || activePassword.value,
      })
      item = { ...item, ...data }
    } catch {
      // Keep it as a directory; expanding will surface the real error.
    }
  }
  const name = source.title || item.name || sourceName(path)
  return {
    ...item,
    name,
    path,
    depth: 0,
    expanded: source.expanded ?? props.expanded,
    loaded: false,
    loading: false,
    children: [],
    password,
    isRoot: true,
    // A file root keeps its real file name (and extension) inside the ZIP.
    zipPath: [item.is_dir ? name : item.name || sourceName(path)],
  }
}

async function loadRoot() {
  loadingRoot.value = true
  errorMsg.value = ''
  needsPassword.value = false
  try {
    if (props.sources.length) {
      const nodes = await Promise.all(props.sources.map((source) => loadSourceRoot(source)))
      roots.value = nodes
      for (const node of roots.value) {
        if (node.is_dir && node.expanded) node.expanded = await loadChildren(node)
      }
      selected.value = new Set()
      downloadCache.clear()
      return
    }
    const items = await listDir(props.path)
    roots.value = toNodes(items, props.path, 0, activePassword.value)
    sortTree(roots.value)
    selected.value = new Set()
    downloadCache.clear()
  } catch (error) {
    const message = errorText(error)
    if (isPasswordError(error)) needsPassword.value = true
    else errorMsg.value = message
  } finally {
    loadingRoot.value = false
  }
}

async function toggleExpand(node: FNode) {
  if (!node.is_dir) return
  if (node.expanded) {
    node.expanded = false
    return
  }
  if (!(await loadChildren(node))) return
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

/** Load a directory and all of its sub-directories. */
async function loadTree(node: FNode): Promise<boolean> {
  if (!node.is_dir) return true
  if (!(await loadChildren(node))) return false
  for (const child of node.children) {
    if (child.is_dir && !(await loadTree(child))) return false
  }
  return true
}

async function toggleCheck(node: FNode, event?: Event) {
  const input = event?.target as HTMLInputElement | null
  // Selecting a folder includes every nested file, so load the whole subtree first.
  if (node.is_dir && !isChecked(node)) {
    const ok = await loadTree(node)
    if (ok) node.expanded = true
    else {
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

const unloadedFolders = computed(() => {
  let count = 0
  const walk = (nodes: FNode[]) => {
    for (const node of nodes) {
      if (node.is_dir && !node.loaded) count += 1
      if (node.children.length) walk(node.children)
    }
  }
  walk(roots.value)
  return count
})

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

const previewable =
  /\.(?:pdf|png|jpe?g|gif|webp|svg|txt|md|json|mp3|wav|mp4|webm|mov)$/i

function canPreview(node: FNode): boolean {
  return !node.is_dir && previewable.test(node.name)
}

async function preview(node: FNode) {
  if (demo.value) {
    showToast(t('demoPreview', { name: node.name }))
    return
  }
  try {
    window.open(await resolveUrl(node), '_blank', 'noopener')
  } catch (error) {
    showToast(t('previewFailed', { message: errorText(error) }))
  }
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

function submitPassword() {
  activePassword.value = passwordInput.value
  downloadCache.clear()
  void loadRoot()
}

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
    class="fl-root"
    :class="{ 'fl-selecting': selected.size > 0 }"
    :style="{ '--fl-sticky-top-auto': `${stickyTop}px` }"
  >
    <div class="fl-bar">
      <div v-if="selected.size" class="fl-selection" role="status">
        <span class="fl-selection-count">{{ t('selected', { count: selected.size }) }}</span>
        <span class="fl-selection-size">{{ t('totalSize', { size: formatSize(selectedBytes) }) }}</span>
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
        <button class="fl-icon-btn" type="button" :aria-label="t('refresh')" :title="t('refresh')" @click="loadRoot">
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

    <div v-if="needsPassword" class="fl-password">
      <span>{{ t('passwordPrompt') }}</span>
      <input
        v-model="passwordInput"
        type="password"
        :placeholder="t('passwordPlaceholder')"
        :aria-label="t('passwordPlaceholder')"
        @keyup.enter="submitPassword"
      />
      <button class="fl-btn fl-btn-primary" type="button" @click="submitPassword">{{ t('open') }}</button>
    </div>

    <div class="fl-row fl-head">
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
      }"
      :style="{ '--fl-depth': node.depth }"
    >
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :aria-label="t('selectItem', { name: node.name })"
          :checked="isChecked(node)"
          :indeterminate.prop="isIndeterminate(node)"
          @change="toggleCheck(node, $event)"
        />
      </label>
      <span class="fl-cell fl-cell-name" :title="node.isRoot ? node.path : undefined">
        <span class="fl-indent" aria-hidden="true"></span>
        <button
          v-if="node.is_dir"
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
            @click="node.is_dir ? toggleExpand(node) : download(node)"
          >{{ node.name }}</span>
          <span class="fl-meta">
            <template v-if="node.is_dir">
              <template v-if="node.loaded">{{ t('folderItems', { count: folderFiles(node).length }) }} · {{ formatSize(totalSize(folderFiles(node))) }}</template>
            </template>
            <template v-else>{{ formatSize(node.size) }} · {{ formatDate(node.modified) }}</template>
          </span>
        </span>
        <span v-if="node.is_dir && node.loaded" class="fl-count">{{ t('folderItems', { count: folderFiles(node).length }) }}</span>
        <span v-if="node.loading" class="fl-loading" aria-hidden="true">…</span>
      </span>
      <span class="fl-cell fl-cell-size">{{ node.is_dir ? '—' : formatSize(node.size) }}</span>
      <span class="fl-cell fl-cell-date">{{ formatDate(node.modified) }}</span>
      <span class="fl-cell fl-cell-op">
        <button
          v-if="node.is_dir"
          class="fl-action fl-arrow-end"
          type="button"
          :class="{ 'fl-arrow-open': node.expanded }"
          :aria-label="t(node.expanded ? 'collapse' : 'expand', { name: node.name })"
          :aria-expanded="node.expanded"
          @click="toggleExpand(node)"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <template v-else>
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
    </div>

    <div class="fl-foot">
      <span>{{ t('loaded', { count: allFiles.length }) }} · {{ t('totalSize', { size: formatSize(loadedBytes) }) }}</span>
      <span v-if="unloadedFolders" class="fl-foot-hint">{{ t('unloaded', { count: unloadedFolders }) }}</span>
    </div>

    <div v-if="toast" class="fl-toast" role="status">{{ toast }}</div>
  </div>
</template>
