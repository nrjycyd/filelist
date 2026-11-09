import { describe, expect, it } from 'vitest'
import { fileListLocales, formatLabel, resolveLabels } from '../locales'

describe('locales', () => {
  it('ships zh-CN and en-US presets with the same keys', () => {
    const zhKeys = Object.keys(fileListLocales['zh-CN']).sort()
    const enKeys = Object.keys(fileListLocales['en-US']).sort()
    expect(enKeys).toEqual(zhKeys)
  })

  it('resolves the requested locale', () => {
    expect(resolveLabels('en-US').batch).toBe('Download ZIP')
    expect(resolveLabels('zh-CN').batch).toBe('批量下载')
  })

  it('falls back to zh-CN for unknown locales', () => {
    expect(resolveLabels('fr-FR' as never).batch).toBe('批量下载')
  })

  it('applies overrides on top of a preset', () => {
    expect(resolveLabels('en-US', { batch: 'ZIP' }).batch).toBe('ZIP')
    expect(resolveLabels('en-US', { batch: 'ZIP' }).refresh).toBe('Refresh')
  })
})

describe('formatLabel', () => {
  it('replaces placeholders', () => {
    expect(formatLabel('{count} files', { count: 3 })).toBe('3 files')
  })

  it('keeps unknown placeholders untouched', () => {
    expect(formatLabel('{count} / {total}', { count: 3 })).toBe('3 / {total}')
  })
})
