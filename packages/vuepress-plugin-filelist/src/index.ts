import type { PluginObject } from 'vuepress/core'
import { fileURLToPath } from 'node:url'

/** Packages the SSR build must bundle: the client config imports the stylesheet. */
const SSR_BUNDLED = ['vuepress-plugin-filelist', 'vitepress-plugin-filelist']

interface ViteBundlerOptions {
  viteOptions?: { ssr?: { noExternal?: unknown } }
}

/** Add the packages to `ssr.noExternal`, keeping what the site already set. */
export function addSsrNoExternal(options: ViteBundlerOptions): void {
  const vite = (options.viteOptions ??= {})
  const ssr = (vite.ssr ??= {})
  const current = ssr.noExternal
  if (current === true) return
  const list = current === undefined ? [] : Array.isArray(current) ? [...current] : [current]
  for (const name of SSR_BUNDLED) if (!list.includes(name)) list.push(name)
  ssr.noExternal = list
}

/**
 * VuePress 2 plugin: registers `<FileList>` (and `<VPFileList>`) on every page
 * and loads the component styles. Needs `@vuepress/bundler-vite`.
 *
 * @example
 * ```ts
 * // .vuepress/config.ts
 * import { viteBundler } from '@vuepress/bundler-vite'
 * import { defineUserConfig } from 'vuepress'
 * import { fileListPlugin } from 'vuepress-plugin-filelist'
 *
 * export default defineUserConfig({
 *   bundler: viteBundler(),
 *   plugins: [fileListPlugin()],
 * })
 * ```
 */
export function fileListPlugin(): PluginObject {
  return {
    name: 'vuepress-plugin-filelist',
    clientConfigFile: fileURLToPath(new URL('./client.js', import.meta.url)),
    extendsBundlerOptions(options: ViteBundlerOptions) {
      addSsrNoExternal(options)
    },
  }
}

export default fileListPlugin
