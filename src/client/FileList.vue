<script setup lang="ts">
/**
 * FileList.vue —— VitePress 网盘文件列表（界面沿用 FileList，数据来自 OpenList）
 *
 * 用法：
 *   <FileList base="https://pan.example.com" path="/课程资料" />
 *   <FileList />  // 演示模式
 */
import { computed, onMounted, ref } from 'vue'
import type { FileListLabels, FileListProps } from './types'
import { formatLabel, resolveLabels } from './locales'
import { compareNodes, encodePath, extOf, formatDate, formatSize, joinPath } from './utils'
import type { SortKey } from './utils'

interface OLItem {
  name: string
  size: number
  is_dir: boolean
  modified: string
  sign?: string
}

interface FNode extends OLItem {
  path: string
  depth: number
  expanded: boolean
  loaded: boolean
  loading: boolean
  children: FNode[]
}

const props = withDefaults(defineProps<FileListProps>(), {
  base: '',
  path: '/',
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


async function listDir(path: string): Promise<OLItem[]> {
  if (demo.value) {
    await new Promise((resolve) => setTimeout(resolve, 220))
    return DEMO_TREE[path] ?? []
  }
  const data = await request<{ content?: OLItem[] }>('/api/fs/list', {
    path,
    password: activePassword.value,
    page: 1,
    per_page: 0,
    refresh: false,
  })
  return data?.content ?? []
}

async function resolveUrl(node: FNode): Promise<string> {
  if (demo.value) return ''
  const cached = downloadCache.get(node.path)
  if (cached) return cached
  let url = ''
  try {
    const data = await request<{ raw_url?: string }>('/api/fs/get', {
      path: node.path,
      password: activePassword.value,
    })
    url = data?.raw_url ?? ''
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

function toNodes(items: OLItem[], parent: string, depth: number): FNode[] {
  return items.map((item) => ({
    ...item,
    path: joinPath(parent, item.name),
    depth,
    expanded: false,
    loaded: false,
    loading: false,
    children: [],
  }))
}

function setSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = true
  }
  sortTree(roots.value)
}

async function loadRoot() {
  loadingRoot.value = true
  errorMsg.value = ''
  needsPassword.value = false
  try {
    const items = await listDir(props.path)
    roots.value = toNodes(items, props.path, 0)
    sortTree(roots.value)
    selected.value = new Set()
    downloadCache.clear()
  } catch (error) {
    const message = errorText(error)
    if (/password|密码/i.test(message)) needsPassword.value = true
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
  if (!node.loaded) {
    node.loading = true
    try {
      const items = await listDir(node.path)
      node.children = toNodes(items, node.path, node.depth + 1)
      sortTree(node.children)
      node.loaded = true
    } catch (error) {
      showToast(t('folderFailed', { message: errorText(error) }))
      return
    } finally {
      node.loading = false
    }
  }
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

async function toggleCheck(node: FNode) {
  if (node.is_dir && !node.loaded) await toggleExpand(node)
  const files = descendantFiles(node)
  if (!files.length) return
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
    const queue = [...files]
    let done = 0
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift()
        if (!file) break
        const response = await fetch(await resolveUrl(file))
        if (!response.ok) throw new Error(`${file.name}：HTTP ${response.status}`)
        entries[file.name] = new Uint8Array(await response.arrayBuffer())
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

onMounted(() => {
  void loadRoot()
  void loadSiteTitle()
})
</script>

<template>
  <div class="fl-root">
    <div class="fl-bar">
      <div class="fl-title">
        <span class="fl-title-icon">🗂️</span>
        <span class="fl-title-text">{{ displayTitle }}</span>
        <span v-if="demo" class="fl-demo-badge">{{ t('demoBadge') }}</span>
      </div>
      <div class="fl-tools">
        <input v-model="keyword" class="fl-search" type="text" :placeholder="t('filter')" />
        <button class="fl-btn" type="button" @click="loadRoot">{{ t('refresh') }}</button>
        <button
          class="fl-btn fl-btn-primary"
          type="button"
          :disabled="selected.size === 0 || batchBusy"
          @click="batchDownload"
        >
          {{ batchBusy ? t('batching', { percent: batchProgress }) : selected.size ? t('batchCount', { count: selected.size }) : t('batch') }}
        </button>
      </div>
    </div>

    <div v-if="needsPassword" class="fl-password">
      <span>{{ t('passwordPrompt') }}</span>
      <input
        v-model="passwordInput"
        type="password"
        :placeholder="t('passwordPlaceholder')"
        @keyup.enter="submitPassword"
      />
      <button class="fl-btn fl-btn-primary" type="button" @click="submitPassword">{{ t('open') }}</button>
    </div>

    <div class="fl-row fl-head">
      <span class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :checked="allChecked"
          :indeterminate.prop="someChecked"
          @change="toggleCheckAll"
        />
      </span>
      <span class="fl-cell fl-cell-name" @click="setSort('name')">
        {{ t('columnName') }}<span class="fl-sort">{{ sortKey === 'name' ? (sortAsc ? '▲' : '▼') : '' }}</span>
      </span>
      <span class="fl-cell fl-cell-size" @click="setSort('size')">
        {{ t('columnSize') }}<span class="fl-sort">{{ sortKey === 'size' ? (sortAsc ? '▲' : '▼') : '' }}</span>
      </span>
      <span class="fl-cell fl-cell-date" @click="setSort('modified')">
        {{ t('columnDate') }}<span class="fl-sort">{{ sortKey === 'modified' ? (sortAsc ? '▲' : '▼') : '' }}</span>
      </span>
      <span class="fl-cell fl-cell-op"></span>
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
      :class="{ 'fl-row-dir': node.is_dir, 'fl-row-selected': selected.has(node.path) }"
    >
      <span class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :checked="isChecked(node)"
          :indeterminate.prop="isIndeterminate(node)"
          @change="toggleCheck(node)"
        />
      </span>
      <span class="fl-cell fl-cell-name" :style="{ paddingLeft: `${node.depth * 22}px` }">
        <button
          v-if="node.is_dir"
          class="fl-arrow"
          type="button"
          :class="{ 'fl-arrow-open': node.expanded }"
          @click="toggleExpand(node)"
        >▸</button>
        <span v-else class="fl-arrow-placeholder"></span>
        <span
          class="fl-name"
          :class="{ 'fl-name-link': node.is_dir }"
          @click="node.is_dir ? toggleExpand(node) : download(node)"
        >
          <span v-if="node.is_dir" class="fl-folder-icon">📁</span>
          <span v-else class="fl-ext-badge">{{ extOf(node.name) || 'FILE' }}</span>
          {{ node.name }}
          <span v-if="node.loading" class="fl-loading">…</span>
        </span>
      </span>
      <span class="fl-cell fl-cell-size">{{ node.is_dir ? '-' : formatSize(node.size) }}</span>
      <span class="fl-cell fl-cell-date">{{ formatDate(node.modified) }}</span>
      <span class="fl-cell fl-cell-op">
        <template v-if="!node.is_dir">
          <button
            v-if="canPreview(node)"
            class="fl-download"
            type="button"
            :title="t('preview')"
            @click="preview(node)"
          ><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="fl-download" type="button" :title="t('download')" @click="download(node)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg></button>
        </template>
      </span>
    </div>

    <div class="fl-foot">
      <span>{{ t('loaded', { count: allFiles.length }) }} · {{ t('selected', { count: selected.size }) }}</span>
      <span v-if="unloadedFolders"> · {{ t('unloaded', { count: unloadedFolders }) }}</span>
    </div>

    <div v-if="toast" class="fl-toast">{{ toast }}</div>
  </div>
</template>
