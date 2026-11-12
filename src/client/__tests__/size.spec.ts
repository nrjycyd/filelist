import { existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

// Size budget for what sites download, measured on the built package (gzip,
// before the site's own minifier). CI and the release workflow build before
// testing; locally run `pnpm build` first, or these are skipped.
//
// Raise a budget on purpose, in the same change that needs it, and say why.
const dist = new URL('../../../dist/', import.meta.url)
const BUDGET_KB = {
  // 44: the keyboard model of the list (treegrid, 0.11) added about 1 KB.
  // 45: readable primary button in every theme (contrast.ts), about 1.4 KB unminified.
  'client/browser/index.js': 45,
  'client/style.css': 8,
  'node/index.js': 1,
}

const gzipKb = (file: string) => gzipSync(readFileSync(new URL(file, dist)), { level: 9 }).length / 1024

describe.skipIf(!existsSync(new URL('client/browser/index.js', dist)))('package size', () => {
  for (const [file, budget] of Object.entries(BUDGET_KB)) {
    it(`${file} stays within ${budget} KB gzip`, () => {
      const size = gzipKb(file)
      console.log(`${file}: ${size.toFixed(1)} KB gzip (budget ${budget} KB)`)
      expect(size).toBeLessThanOrEqual(budget)
    })
  }

  it('loads markdown-it, DOMPurify and client-zip only when needed', () => {
    const code = readFileSync(new URL('client/browser/index.js', dist), 'utf8')
    for (const name of ['markdown-it', 'dompurify', 'client-zip']) {
      // A static import would put them in every page that shows a list.
      expect(code).not.toMatch(new RegExp(`^import[^;]*["']${name}["']`, 'm'))
      expect(code).toContain(`import("${name}")`)
    }
  })
})
