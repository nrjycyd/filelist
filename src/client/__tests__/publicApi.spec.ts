import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as client from '../index'
import { fileListLocales } from '../locales'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

// The 1.0 API. Adding to it is a minor release; removing from it is a major one.
describe('public API', () => {
  it('/client exports only the components, the registrar and the label tools', () => {
    expect(Object.keys(client).sort()).toEqual(
      ['FileList', 'VPFileList', 'enhanceAppWithFileList', 'fileListLocales', 'formatLabel', 'resolveLabels'].sort(),
    )
  })

  it('every label is shown somewhere', () => {
    const source = ['FileList.vue', 'PreviewDialog.vue', 'ConfirmDialog.vue', 'download.ts', 'usePasswords.ts', 'api.ts', 'demo.ts']
      .map(file => read(`../${file}`))
      .join('\n')
    const unused = Object.keys(fileListLocales['zh-CN']).filter(key => !new RegExp(`['"\`]${key}['"\`]`).test(source))
    expect(unused).toEqual([])
  })

  it('vitepress-tuck is an optional peer, so plain VitePress sites do not install it', () => {
    const pkg = JSON.parse(read('../../../package.json'))
    expect(pkg.dependencies['vitepress-tuck']).toBeUndefined()
    expect(pkg.peerDependencies['vitepress-tuck']).toBeTruthy()
    expect(pkg.peerDependenciesMeta['vitepress-tuck'].optional).toBe(true)
    expect(pkg.peerDependencies.vitepress).toBe('^1.6.0 || >=2.0.0-alpha.18')
    expect(pkg.engines.node).toBeTruthy()
  })
})
