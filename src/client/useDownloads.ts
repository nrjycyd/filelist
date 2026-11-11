import type { ComputedRef, Ref } from 'vue'
import type { ListContext } from './context'
import type { ZipProgress } from './download'
import type { FNode } from './tree'
import { computed, ref } from 'vue'
import { errorText } from './api'
import { isDemoFile } from './demo'
import { canStreamToDisk, openUrl, pickZipFile, saveBlob, zipFileName, zipToBlob, zipToFile } from './download'
import { formatSize, totalSize } from './utils'

const MB = 1024 * 1024

/** A ZIP question or notice: over the warning size, over the limit, or failed. */
type ZipNotice =
  | { kind: 'warn' | 'block'; size: number; limit: number; files: FNode[] }
  | { kind: 'failed'; message: string }

/**
 * Single-file downloads and the batch ZIP. Chrome / Edge stream the ZIP into a
 * file the user picks (no size limit); other browsers build it in memory, so
 * large selections ask first or are refused.
 */
export function useDownloads(
  ctx: ListContext,
  options: {
    selected: Ref<Set<string>>
    selectedFiles: ComputedRef<FNode[]>
    /** A file's download / preview URL, with its folder's password. */
    fileUrlOf: (node: FNode) => Promise<string>
  },
) {
  const { props, api, demo, t, showToast } = ctx
  const { selected, selectedFiles, fileUrlOf } = options

  const batchBusy = ref(false)
  const zipProgress = ref<ZipProgress | null>(null)
  let zipAbort: AbortController | null = null

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

  /** In-memory ZIP limits in bytes (Infinity = none); phones get lower defaults. */
  function zipLimits(): { warn: number; max: number } {
    const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
    const bytes = (value: number | undefined, fallback: number) => {
      const mb = value ?? fallback
      return mb > 0 ? mb * MB : Number.POSITIVE_INFINITY
    }
    return { warn: bytes(props.zipWarnSize, touch ? 200 : 500), max: bytes(props.zipMaxSize, touch ? 1024 : 2048) }
  }

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
      if (handle) await runZip(files, (zipOptions) => zipToFile(handle, files, zipOptions), handle.name)
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
      async (zipOptions) => saveBlob(await zipToBlob(files, zipOptions), name),
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
    run: (zipOptions: Parameters<typeof zipToBlob<FNode>>[1]) => Promise<void>,
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

  return {
    download,
    batchBusy,
    zipProgress,
    zipNotice,
    zipDialog,
    batchDownload,
    confirmZip,
    cancelZip,
    zipPercent,
  }
}
