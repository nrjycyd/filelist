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
      external: ['vitepress-tuck'],
    }),
    // SSR build for the component
    mergeConfig({}, baseConfig, {
      entry: 'src/client/index.ts',
      outDir: `${outDir}/client/ssr`,
      platform: 'node',
      target: 'baseline-widely-available',
      dts: { vue: true },
      plugins: [vue({ isProduction: true, ssr: true })],
      external: ['vue', 'vitepress', 'fflate'],
    }),
    // Browser build: injects the shared CSS file
    mergeConfig({}, baseConfig, {
      entry: 'src/client/index.ts',
      outDir: `${outDir}/client/browser`,
      platform: 'browser',
      target: 'baseline-widely-available',
      dts: { vue: true },
      plugins: [vue({ isProduction: true, ssr: false })],
      external: ['vue', 'vitepress', 'fflate'],
      outputOptions: {
        banner: 'import "../style.css"',
      },
      copy: [{ from: 'src/client/style.css', to: `${outDir}/client` }],
    }),
  ]
}

export default build()
