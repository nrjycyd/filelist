import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addSsrNoExternal, fileListPlugin } from '../index'

const pkg = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

describe('fileListPlugin', () => {
  it('points VuePress at the built client config', () => {
    const plugin = fileListPlugin()
    expect(plugin.name).toBe('vuepress-plugin-filelist')
    expect(plugin.clientConfigFile).toMatch(/[/\\]client\.js$/)
  })

  it('bundles both packages in the SSR build, keeping the site\'s own entries', () => {
    const empty: Parameters<typeof addSsrNoExternal>[0] = {}
    addSsrNoExternal(empty)
    expect(empty.viteOptions?.ssr?.noExternal).toEqual(['vuepress-plugin-filelist', 'vitepress-plugin-filelist'])

    const one = { viteOptions: { ssr: { noExternal: 'some-lib' as unknown } } }
    addSsrNoExternal(one)
    expect(one.viteOptions.ssr.noExternal).toEqual(['some-lib', 'vuepress-plugin-filelist', 'vitepress-plugin-filelist'])

    const all = { viteOptions: { ssr: { noExternal: true as unknown } } }
    addSsrNoExternal(all)
    expect(all.viteOptions.ssr.noExternal).toBe(true)

    const twice: Parameters<typeof addSsrNoExternal>[0] = {}
    addSsrNoExternal(twice)
    addSsrNoExternal(twice)
    expect(twice.viteOptions?.ssr?.noExternal).toHaveLength(2)
  })
})

describe('released together with vitepress-plugin-filelist', () => {
  const self = pkg('../../package.json')
  const main = pkg('../../../../package.json')

  it('has the same version', () => {
    expect(self.version).toBe(main.version)
  })

  it('depends on exactly that version (pnpm pack turns workspace:* into it)', () => {
    expect(self.dependencies['vitepress-plugin-filelist']).toBe('workspace:*')
  })

  it('does not pull VitePress into a VuePress site', () => {
    expect(main.peerDependenciesMeta.vitepress.optional).toBe(true)
  })
})
