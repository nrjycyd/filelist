// Readable “Download ZIP”: the theme's button colour, darkened (or lightened,
// for dark text) just enough to reach 4.5:1 when it falls short.

export type Rgb = [number, number, number]

/** WCAG AA for normal-size text. */
const MIN_CONTRAST = 4.5

/** Relative luminance (WCAG 2). */
export function luminance([r, g, b]: Rgb): number {
  const linear = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return from.map((v, i) => Math.round(v + (to[i] - v) * amount)) as Rgb
}

/** Closest readable background behind `text`; null when `background` already is. */
export function readableBackground(background: Rgb, text: Rgb, min = MIN_CONTRAST): Rgb | null {
  if (contrast(background, text) >= min) return null
  const toward: Rgb = luminance(text) > luminance(background) ? [0, 0, 0] : [255, 255, 255]
  for (let step = 1; step <= 100; step++) {
    const candidate = mix(background, toward, step / 100)
    if (contrast(candidate, text) >= min) return candidate
  }
  return toward
}

/** Any CSS colour the browser understands (rgb, hex, oklch…) as sRGB. */
function toRgb(color: string): Rgb | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.fillStyle = '#000'
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
  return a === 0 ? null : [r, g, b]
}

const rgbText = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`

/** Set `--fl-btn-primary-bg` / `-hover-bg` on `root` only when the theme's colours fall short. */
export function fitPrimaryButton(root: HTMLElement) {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden'
  root.appendChild(probe)
  const read = (value: string, property: 'color' | 'backgroundColor') => {
    probe.style[property] = value
    return toRgb(getComputedStyle(probe)[property])
  }
  const text = read('var(--vp-button-brand-text, #fff)', 'color')
  const hoverText = read('var(--vp-button-brand-hover-text, #fff)', 'color')
  const bg = read('var(--vp-button-brand-bg, var(--fl-c-brand-3))', 'backgroundColor')
  const hoverBg = read('var(--vp-button-brand-hover-bg, var(--fl-c-brand-2))', 'backgroundColor')
  probe.remove()

  const set = (name: string, value: Rgb | null) => {
    if (value) root.style.setProperty(name, rgbText(value))
    else root.style.removeProperty(name)
  }
  set('--fl-btn-primary-bg', bg && text ? readableBackground(bg, text) : null)
  set('--fl-btn-primary-hover-bg', hoverBg && hoverText ? readableBackground(hoverBg, hoverText) : null)
}
