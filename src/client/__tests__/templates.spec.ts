import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// VitePress styles these tags inside `.vp-doc` (margins, colours, borders) and
// its selectors beat the component's own classes, so the component's markup
// avoids them. Rendered Markdown is inserted with v-html and is not affected.
const STYLED_BY_VITEPRESS = /<(p|ul|ol|li|h[1-6]|table|blockquote|a)[\s>]/

describe('component templates', () => {
  for (const file of ['FileList.vue', 'PreviewDialog.vue', 'ConfirmDialog.vue']) {
    it(`${file} uses no tags that VitePress' doc styles reach`, () => {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      const template = source.slice(source.indexOf('<template'), source.lastIndexOf('</template>'))
      expect(template).not.toMatch(STYLED_BY_VITEPRESS)
    })
  }
})
