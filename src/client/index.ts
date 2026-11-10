import type { EnhanceAppContext } from 'vitepress/client'
import FileList from './FileList.vue'

export { FileList }
export { default as VPFileList } from './FileList.vue'
export { fileListLocales, formatLabel, resolveLabels } from './locales'
// Explicit list: internal helpers stay private, so they can change freely.
export {
  compareNodes,
  encodePath,
  extOf,
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
  zipSegment,
} from './utils'
export type { FileKind, IframePreview, PreviewKind, SortableNode, SortKey } from './utils'
export type { FileListLabels, FileListLocale, FileListProps, FileListSource, OpenListEntry } from './types'

/**
 * Register `<FileList>` and `<VPFileList>` globally.
 *
 * ```ts
 * // .vitepress/theme/index.ts
 * import DefaultTheme from 'vitepress/theme'
 * import { enhanceAppWithFileList } from 'vitepress-plugin-filelist/client'
 *
 * export default {
 *   extends: DefaultTheme,
 *   enhanceApp(ctx) {
 *     enhanceAppWithFileList(ctx)
 *   },
 * }
 * ```
 */
export function enhanceAppWithFileList({ app }: EnhanceAppContext): void {
  if (!app._context.components.FileList)
    app.component('FileList', FileList)
  if (!app._context.components.VPFileList)
    app.component('VPFileList', FileList)
}
