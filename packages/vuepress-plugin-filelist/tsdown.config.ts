import { defineConfig } from 'tsdown'

// The component itself comes from vitepress-plugin-filelist; this package only
// holds the VuePress plugin and its client config.
export default defineConfig({
  entry: { index: 'src/index.ts', client: 'src/client.ts' },
  outDir: 'dist',
  clean: true,
  format: 'esm',
  fixedExtension: false,
  platform: 'neutral',
  target: 'node20.19.0',
  dts: true,
  external: [/^vitepress-plugin-filelist(\/|$)/, /^vuepress(\/|$)/, 'vue', /^node:/],
})
