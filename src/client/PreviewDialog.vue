<script setup lang="ts">
/**
 * File preview in a native <dialog>, without leaving the page.
 *
 * image / video / audio: native elements; text: the first `maxTextBytes`,
 * with Markdown and HTML switchable between source (default) and rendered
 * (Markdown sanitised in VitePress' doc style, HTML in a script-less sandbox);
 * through a Range request; pdf: the first matching OpenList `iframe_previews`
 * viewer, else the browser's reader through a Blob. Anything else (Office
 * included), failures, oversized PDFs and demo mode: file info + download.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { FileListLabels } from './types'
import Icon from './Icon.vue'
import { renderMarkdown } from './markdown'
import { formatLabel } from './locales'
import type { PreviewKind } from './utils'
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
/** Markdown / HTML: show the source or render it. Kept while the page is open. */
const view = ref<'source' | 'rendered'>('source')
const renderedHtml = ref('')
let controller: AbortController | undefined
let loadSeq = 0

/** Text files that can also be rendered. */
const renderAs = computed<'markdown' | 'html' | null>(() => {
  const name = props.file?.name ?? ''
  if (/\.(md|markdown)$/i.test(name)) return 'markdown'
  if (/\.html?$/i.test(name)) return 'html'
  return null
})

const tooLarge = computed(
  () => kind.value === 'pdf' && !props.viewer && (props.file?.size ?? 0) > props.maxPdfBytes,
)

type Mode = Exclude<PreviewKind, 'none'> | 'demo' | 'failed' | 'unsupported' | 'tooLarge'

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

const canRender = computed(() => !!renderAs.value && mode.value === 'text' && !busy.value)

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
  renderedHtml.value = ''
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
  () => [view.value, renderAs.value, textContent.value] as const,
  async ([current, as, text]) => {
    if (current !== 'rendered' || as !== 'markdown' || !text) return
    const seq = loadSeq
    try {
      const html = await renderMarkdown(text, (alt) => t('imageOmitted', { alt }))
      if (seq === loadSeq) renderedHtml.value = html
    } catch {
      if (seq === loadSeq) view.value = 'source'
    }
  },
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
        <div v-if="total > 1 || (mode === 'image' && !busy) || canRender" class="fl-preview-tools fl-preview-nav">
          <template v-if="total > 1">
            <button class="fl-preview-tool" type="button" :aria-label="t('previous')" :title="t('previous')" @click="emit('prev')">
              <Icon name="previous" :size="18" />
            </button>
            <span class="fl-preview-count">{{ position }} / {{ total }}</span>
            <button class="fl-preview-tool" type="button" :aria-label="t('next')" :title="t('next')" @click="emit('next')">
              <Icon name="next" :size="18" />
            </button>
          </template>
          <template v-if="mode === 'image' && !busy">
            <button class="fl-preview-tool fl-preview-rotate" type="button" :aria-label="t('rotate')" :title="t('rotate')" @click="rotation = (rotation + 90) % 360">
              <Icon name="refresh" :size="17" />
            </button>
            <button
              class="fl-preview-tool fl-preview-zoom"
              type="button"
              :aria-pressed="actualSize"
              :aria-label="t('actualSize')"
              :title="t('actualSize')"
              @click="actualSize = !actualSize"
            >
              <Icon :name="actualSize ? 'zoomOut' : 'zoomIn'" :size="17" />
            </button>
          </template>
          <span v-if="canRender" class="fl-preview-view" role="group" :aria-label="t('viewMode')">
            <button
              v-for="option in (['source', 'rendered'] as const)"
              :key="option"
              class="fl-preview-view-btn"
              type="button"
              :aria-pressed="view === option"
              @click="view = option"
            >{{ t(option === 'source' ? 'viewSource' : 'viewRendered') }}</button>
          </span>
        </div>
        <div class="fl-preview-tools fl-preview-actions">
          <button v-if="!demo" class="fl-preview-tool fl-preview-download" type="button" :aria-label="t('download')" :title="t('download')" @click="emit('download')">
            <Icon name="download" :size="17" />
          </button>
          <button class="fl-preview-tool fl-preview-close" type="button" autofocus :aria-label="t('close')" :title="t('close')" @click="emit('close')">
            <Icon name="close" :size="18" />
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
        <div v-else-if="mode === 'text'" class="fl-preview-text" :class="{ 'fl-preview-rendered': renderAs && view === 'rendered' }">
          <div v-if="truncated" class="fl-preview-note">{{ t('textTruncated', { size: formatSize(maxTextBytes) }) }}</div>
          <template v-if="renderAs === 'markdown' && view === 'rendered'">
            <!-- sanitised by renderMarkdown (DOMPurify) -->
            <div v-if="renderedHtml" class="vp-doc fl-md" v-html="renderedHtml"></div>
            <div v-else class="fl-preview-status" role="status">{{ t('loading') }}</div>
          </template>
          <template v-else-if="renderAs === 'html' && view === 'rendered'">
            <div class="fl-preview-note">{{ t('htmlSandboxNote') }}</div>
            <!-- empty sandbox: no scripts, no forms, no popups, an opaque origin -->
            <iframe class="fl-preview-html" sandbox="" referrerpolicy="no-referrer" :srcdoc="textContent" :title="file.name"></iframe>
          </template>
          <pre v-else>{{ textContent }}</pre>
        </div>
        <iframe v-else-if="mode === 'pdf'" class="fl-preview-frame" :src="viewer || blobUrl" :title="file.name"></iframe>
        <div v-else class="fl-preview-info">
          <span class="fl-type fl-preview-badge" :data-kind="fileKind(file.name)" aria-hidden="true">{{ extOf(file.name) || 'FILE' }}</span>
          <div class="fl-preview-message">{{ infoMessage }}</div>
          <button v-if="!demo" class="fl-btn fl-btn-primary" type="button" @click="emit('download')">
            <Icon name="download" :size="15" />
            {{ t('download') }}
          </button>
        </div>
      </div>
    </div>
  </dialog>
</template>
