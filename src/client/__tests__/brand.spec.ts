import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The logo files live in the docs site's public folder; the README links to
// them on GitHub and the site config links to them by path. A rename on one
// side breaks the other silently, so check that every link has its file.
const root = new URL('../../../', import.meta.url)
const publicDir = new URL('demo/docs/public/', root)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('brand assets', () => {
  it('every logo file the docs config and home page use exists', () => {
    const used = [read('demo/docs/.vitepress/config.ts'), read('demo/docs/index.md')]
      .flatMap((text) => [...text.matchAll(/(?:\$\{base\}|['"\s]\/)([\w-]+\.(?:svg|ico|png))/g)].map((m) => m[1]))
    expect(used).toEqual(expect.arrayContaining(['logo.svg', 'logo-dark.svg', 'favicon.svg', 'favicon.ico']))
    for (const file of used) expect(existsSync(new URL(file, publicDir)), file).toBe(true)
  })

  it('every image the README takes from demo/docs/public exists', () => {
    const used = [...read('README.md').matchAll(/demo\/docs\/public\/([\w-]+\.(?:svg|png))/g)].map((m) => m[1])
    expect(used).toEqual(expect.arrayContaining(['wordmark.svg', 'wordmark-dark.svg']))
    for (const file of used) expect(existsSync(new URL(file, publicDir)), file).toBe(true)
  })
})

describe('README', () => {
  // npm uses the first root file named README or README.* as the package page,
  // in no particular order, so README.md must be the only one. The Chinese
  // README is README-zh-CN.md for that reason.
  it('README.md is the only root file npm can take as the package README', () => {
    const readmes = readdirSync(root).filter((name) => /^readme(?:\..*)?$/i.test(name))
    expect(readmes).toEqual(['README.md'])
  })
})
