import { definePlugin } from 'vitepress-tuck'

/**
 * VitePress plugin for `vitepress-plugin-filelist`.
 *
 * Registers `<FileList>` / `<VPFileList>` through `vitepress-tuck`'s
 * `virtual:enhance-app`, so the component can be used directly in Markdown.
 *
 * ```ts
 * // .vitepress/config.ts
 * import { defineConfig } from 'vitepress-tuck'
 * import fileList from 'vitepress-plugin-filelist'
 *
 * export default defineConfig({
 *   plugins: [fileList()],
 * })
 * ```
 */
export const fileList = definePlugin(() => ({
  name: 'vitepress-plugin-filelist',
  componentResolver: ['FileList', 'VPFileList'],
  vite: {
    ssr: {
      noExternal: ['vitepress-plugin-filelist'],
    },
  },
}))
