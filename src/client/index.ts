import type { App } from 'vue'
import FileList from './FileList.vue'

export { FileList }
export { default as VPFileList } from './FileList.vue'
export { fileListLocales, formatLabel, resolveLabels } from './locales'
export type { FileListLabels, FileListLocale, FileListProps, FileListSource } from './types'

// The public API ends here. Everything else (path, size and date helpers, the
// tree, the OpenList client) is internal and can change in any release.

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
 *
 * Takes VitePress' `enhanceApp` context, or anything with the Vue `app`
 * (VuePress uses `fileListPlugin()` from `vitepress-plugin-filelist/vuepress`).
 */
export function enhanceAppWithFileList({ app }: { app: App }): void {
  if (!app._context.components.FileList)
    app.component('FileList', FileList)
  if (!app._context.components.VPFileList)
    app.component('VPFileList', FileList)
}
