import type { ComputedRef, Ref } from 'vue'
import type { ListContext } from './context'
import type { FNode } from './tree'
import { computed, ref } from 'vue'
import { errorText } from './api'
import { isDemoFile } from './demo'
import { fillPreviewUrl, iframePreviewsFor, previewKind } from './utils'

/** Only types the dialog can actually render get a preview button. */
export function canPreview(node: FNode): boolean {
  return !node.is_dir && previewKind(node.originalName ?? node.name) !== 'none'
}

/** The preview dialog: which file, its URL (or PDF viewer), and ← / → through the list. */
export function usePreview(
  ctx: ListContext,
  options: {
    /** Rows on screen, in order. */
    visible: ComputedRef<FNode[]>
    fileUrlOf: (node: FNode) => Promise<string>
    /** OpenList's `iframe_previews` setting. */
    iframePreviews: Ref<string>
  },
) {
  const { api, demo } = ctx

  const previewNode = ref<FNode | null>(null)
  const previewSrc = ref('')
  const previewViewer = ref('')
  const previewResolving = ref(false)
  const previewError = ref('')
  let previewSeq = 0

  /** Previewable files in the order they are listed, for ← / →. */
  const previewList = computed(() => options.visible.value.filter(canPreview))
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
      const url = await options.fileUrlOf(node)
      if (seq !== previewSeq) return
      previewSrc.value = url
      const name = node.originalName ?? node.name
      const viewer = previewKind(name) === 'pdf' ? iframePreviewsFor(name, options.iframePreviews.value)[0] : undefined
      if (viewer) {
        previewViewer.value = fillPreviewUrl(viewer.scheme, {
          name,
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

  return {
    previewNode,
    previewSrc,
    previewViewer,
    previewResolving,
    previewError,
    previewList,
    previewPosition,
    preview,
    stepPreview,
    closePreview,
  }
}
