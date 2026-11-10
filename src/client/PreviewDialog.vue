<script setup lang="ts">
/**
 * PreviewDialog.vue —— 文件预览弹窗（原生 <dialog>，不跳转页面）
 *
 * image / video / audio：原生标签；text：Range 读取前 maxTextBytes；
 * pdf：OpenList `iframe_previews` 中的查看器，未配置时用浏览器自带阅读器（Blob）；
 * 其它类型（含 Office）、失败、过大、演示模式：文件信息 + 下载。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { FileListLabels } from './types'
import { formatLabel } from './locales'
import { extOf, fileKind, formatDate, formatSize, previewKind } from './utils'

export interface PreviewFile {
  name: string
  size: number
  modified: string
}

const props = withDefaults(
  defineProps<{
    open: boolean
    file: PreviewFile | null
    labels: FileListLabels
    /** Resolved file URL; empty while resolving or in demo mode. */
    src?: string
    /** Filled `iframe_previews` viewer URL for PDFs, if OpenList has one. */
    viewer?: string
    resolving?: boolean
    /** Message when the URL could not be resolved. */
    error?: string
    demo?: boolean
    position?: number
    total?: number
    maxTextBytes?: number
    maxPdfBytes?: number
  }>(),
  {
    src: '',
    viewer: '',
    resolving: false,
    error: '',
    demo: false,
    position: 0,
    total: 0,
    maxTextBytes: 1024 * 1024,
    maxPdfBytes: 50 * 1024 * 1024,
  },
)

const emit = defineEmits<{
  close: []
  prev: []
  next: []
  download: []
}>()

function t(key: keyof FileListLabels, values?: Record<string, string | number>): string {
  return formatLabel(props.labels[key], values)
}

const dialog = ref<HTMLDialogElement>()
const kind = computed(() => (props.file ? previewKind(props.file.name) : 'none'))

const loadingBody = ref(false)
const bodyFailed = ref(false)
const textContent = ref('')
const truncated = ref(false)
const blobUrl = ref('')
const rotation = ref(0)
const actualSize = ref(false)
let controller: AbortController | undefined
let loadSeq = 0

const tooLarge = computed(
  () => kind.value === 'pdf' && !props.viewer && (props.file?.size ?? 0) > props.maxPdfBytes,
)

type Mode = PreviewKindMode | 'demo' | 'failed' | 'unsupported' | 'tooLarge'
type PreviewKindMode = 'image' | 'video' | 'audio' | 'text' | 'pdf'

const mode = computed<Mode>(() => {
  if (props.demo) return 'demo'
  if (props.error || bodyFailed.value) return 'failed'
  if (kind.value === 'none') return 'unsupported'
  if (tooLarge.value) return 'tooLarge'
  return kind.value
})

const busy = computed(
  () =>
    !props.demo &&
    kind.value !== 'none' &&
    !props.error &&
    !bodyFailed.value &&
    (props.resolving || loadingBody.value || (!props.src && !tooLarge.value)),
)

const infoMessage = computed(() => {
  const file = props.file
  if (!file) return ''
  if (mode.value === 'demo') return t('demoPreview', { name: file.name })
  if (mode.value === 'tooLarge') return t('previewTooLarge', { size: formatSize(file.size) })
  if (mode.value === 'failed') return t('previewUnavailable')
  return t('previewUnsupported')
})

function revokeBlob() {
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
  blobUrl.value = ''
}

function resetBody() {
  controller?.abort()
  controller = undefined
  loadSeq += 1
  revokeBlob()
  loadingBody.value = false
  bodyFailed.value = false
  textContent.value = ''
  truncated.value = false
  rotation.value = 0
  actualSize.value = false
}

async function readPrefix(response: Response, limit: number): Promise<{ bytes: Uint8Array; more: boolean }> {
  const reader = response.body?.getReader()
  if (!reader) {
    const all = new Uint8Array(await response.arrayBuffer())
    return { bytes: all.slice(0, limit), more: all.length > limit }
  }
  const chunks: Uint8Array[] = []
  let length = 0
  let more = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
    if (length >= limit) {
      more = length > limit
      await reader.cancel().catch(() => {})
      break
    }
  }
  const bytes = new Uint8Array(Math.min(length, limit))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset)
    bytes.set(part, offset)
    offset += part.length
    if (offset >= bytes.length) break
  }
  return { bytes, more }
}

async function loadBody() {
  resetBody()
  const file = props.file
  if (!props.open || !file || props.demo || !props.src || props.error) return
  if (kind.value !== 'text' && !(kind.value === 'pdf' && !props.viewer && !tooLarge.value)) return

  const seq = loadSeq
  controller = new AbortController()
  loadingBody.value = true
  try {
    if (kind.value === 'text') {
      const limit = props.maxTextBytes
      const response = await fetch(props.src, {
        headers: { Range: `bytes=0-${limit - 1}` },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const { bytes, more } = await readPrefix(response, limit)
      if (seq !== loadSeq) return
      textContent.value = new TextDecoder('utf-8').decode(bytes)
      truncated.value = more || file.size > limit
    } else {
      const response = await fetch(props.src, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = await response.arrayBuffer()
      if (seq !== loadSeq) return
      blobUrl.value = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
    }
  } catch {
    if (seq === loadSeq && !controller?.signal.aborted) bodyFailed.value = true
  } finally {
    if (seq === loadSeq) loadingBody.value = false
  }
}

watch(
  () => [props.open, props.file?.name, props.src, props.viewer, props.error, props.demo] as const,
  () => void loadBody(),
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    const el = dialog.value
    if (!el) return
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(resetBody)

function onNativeClose() {
  // Esc or form close: keep the parent in sync.
  if (props.open) emit('close')
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (props.total < 2) return
  const target = event.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName)) return
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    emit('prev')
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    emit('next')
  }
}

function markFailed() {
  bodyFailed.value = true
}
</script>

<template>
  <dialog
    ref="dialog"
    class="fl-preview"
    :aria-label="file?.name"
    @close="onNativeClose"
    @click="onBackdrop"
    @keydown="onKeydown"
  >
    <div v-if="open && file" class="fl-preview-panel">
      <header class="fl-preview-head">
        <span class="fl-type" :data-kind="fileKind(file.name)" aria-hidden="true">{{ extOf(file.name) || 'FILE' }}</span>
        <div class="fl-preview-title">
          <span class="fl-preview-name">{{ file.name }}</span>
          <span class="fl-preview-meta">{{ formatSize(file.size) }} · {{ formatDate(file.modified) }}</span>
        </div>
        <div v-if="total > 1 || (mode === 'image' && !busy)" class="fl-preview-tools fl-preview-nav">
          <template v-if="total > 1">
            <button class="fl-preview-tool" type="button" :aria-label="t('previous')" :title="t('previous')" @click="emit('prev')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
            </button>
            <span class="fl-preview-count">{{ position }} / {{ total }}</span>
            <button class="fl-preview-tool" type="button" :aria-label="t('next')" :title="t('next')" @click="emit('next')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </template>
          <template v-if="mode === 'image' && !busy">
            <button class="fl-preview-tool fl-preview-rotate" type="button" :aria-label="t('rotate')" :title="t('rotate')" @click="rotation = (rotation + 90) % 360">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
            </button>
            <button
              class="fl-preview-tool fl-preview-zoom"
              type="button"
              :aria-pressed="actualSize"
              :aria-label="t('actualSize')"
              :title="t('actualSize')"
              @click="actualSize = !actualSize"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /><path v-if="!actualSize" d="M11 8v6M8 11h6" /><path v-else d="M8 11h6" /></svg>
            </button>
          </template>
        </div>
        <div class="fl-preview-tools fl-preview-actions">
          <button v-if="!demo" class="fl-preview-tool fl-preview-download" type="button" :aria-label="t('download')" :title="t('download')" @click="emit('download')">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
          </button>
          <button class="fl-preview-tool fl-preview-close" type="button" autofocus :aria-label="t('close')" :title="t('close')" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
          </button>
        </div>
      </header>

      <div class="fl-preview-body" :data-mode="busy ? 'loading' : mode">
        <div v-if="busy" class="fl-preview-status" role="status">{{ t('loading') }}</div>
        <img
          v-else-if="mode === 'image'"
          class="fl-preview-image"
          :class="{ 'fl-preview-actual': actualSize }"
          :src="src"
          :alt="file.name"
          :style="{ transform: rotation ? `rotate(${rotation}deg)` : undefined }"
          @error="markFailed"
        />
        <video
          v-else-if="mode === 'video'"
          class="fl-preview-video"
          :src="src"
          controls
          playsinline
          preload="metadata"
          @error="markFailed"
        ></video>
        <audio v-else-if="mode === 'audio'" class="fl-preview-audio" :src="src" controls preload="metadata" @error="markFailed"></audio>
        <div v-else-if="mode === 'text'" class="fl-preview-text">
          <p v-if="truncated" class="fl-preview-note">{{ t('textTruncated', { size: formatSize(maxTextBytes) }) }}</p>
          <pre>{{ textContent }}</pre>
        </div>
        <iframe v-else-if="mode === 'pdf'" class="fl-preview-frame" :src="viewer || blobUrl" :title="file.name"></iframe>
        <div v-else class="fl-preview-info">
          <span class="fl-type fl-preview-badge" :data-kind="fileKind(file.name)" aria-hidden="true">{{ extOf(file.name) || 'FILE' }}</span>
          <p class="fl-preview-message">{{ infoMessage }}</p>
          <button v-if="!demo" class="fl-btn fl-btn-primary" type="button" @click="emit('download')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
            {{ t('download') }}
          </button>
        </div>
      </div>
    </div>
  </dialog>
</template>
