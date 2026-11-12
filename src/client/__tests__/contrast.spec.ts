import type { Rgb } from '../contrast'
import { describe, expect, it } from 'vitest'
import { contrast, readableBackground } from '../contrast'

const white: Rgb = [255, 255, 255]
const hex = (h: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb

describe('readable primary button', () => {
  it('measures contrast like WCAG', () => {
    expect(contrast(white, [0, 0, 0])).toBeCloseTo(21, 1)
    expect(contrast(white, hex('#5672cd'))).toBeCloseTo(4.48, 2)
  })

  it('keeps a theme colour that is already readable', () => {
    expect(readableBackground(hex('#3e63dd'), white)).toBeNull() // VitePress dark
    expect(readableBackground(hex('#3f7189'), white)).toBeNull() // plume light
  })

  it('darkens just enough behind white text', () => {
    for (const theme of ['#5672cd', '#3eaf7c', '#3aa675', '#8cccd5', '#3ca978', '#3fb37f']) {
      const fixed = readableBackground(hex(theme), white)!
      expect(contrast(fixed, white)).toBeGreaterThanOrEqual(4.5)
      // One step less would not be enough: no darker than needed.
      const lighter = fixed.map((v, i) => Math.min(255, Math.round(v + (hex(theme)[i] - v) * 0.02))) as Rgb
      expect(contrast(lighter, white)).toBeLessThan(4.6)
    }
    // VitePress light only needs a touch.
    const vitepress = readableBackground(hex('#5672cd'), white)!
    expect(Math.max(...vitepress.map((v, i) => Math.abs(v - hex('#5672cd')[i])))).toBeLessThanOrEqual(3)
  })

  it('lightens instead when the text is dark', () => {
    const fixed = readableBackground(hex('#3f7189'), [27, 27, 31])!
    expect(contrast(fixed, [27, 27, 31])).toBeGreaterThanOrEqual(4.5)
    expect(fixed[0]).toBeGreaterThan(0x3f)
  })
})
