import type { UserConfig } from 'tsdown'
import { mergeConfig } from 'tsdown'
import vue from 'unplugin-vue/rolldown'

const baseConfig: UserConfig = {
  clean: true,
  format: 'esm',
  fixedExtension: false,
}

export function build(): UserConfig[] {
  const outDir = 'dist'
  return [
    // Node entry: plugin definition, no Vue code
    mergeConfig({}, baseConfig, {
      entry: 'src/node/index.ts',
      outDir: `${outDir}/node`,
      dts: true,
      target: 'node20.19.0',
      deps: { neverBundle: ['vitepress-tuck'] },
    }),
    // SSR build for the component
    mergeConfig({}, baseConfig, {
      entry: 'src/client/index.ts',
      outDir: `${outDir}/client/ssr`,
      platform: 'node',
      target: 'baseline-widely-available',
      dts: { tsc: { vue: true } },
      plugins: [vue({ isProduction: true, ssr: true })],
      deps: { neverBundle: ['vue', 'vitepress'] },
    }),
    // Browser build: injects the shared CSS file
    mergeConfig({}, baseConfig, {
      entry: 'src/client/index.ts',
      outDir: `${outDir}/client/browser`,
      platform: 'browser',
      target: 'baseline-widely-available',
      dts: { tsc: { vue: true } },
      plugins: [vue({ isProduction: true, ssr: false })],
      deps: { neverBundle: ['vue', 'vitepress'] },
      outputOptions: {
        banner: (chunk) => (chunk.isEntry ? 'import "../style.css"' : ''),
      },
    }),
  ]
}

export default build()
