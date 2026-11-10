// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob, zipFileName } from '../download'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('download helpers', () => {
  it('keeps the blob URL alive until the download has started', () => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    saveBlob(new Blob(['a']), 'a.zip')
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })

  it('makes a file-system-safe ZIP name', () => {
    expect(zipFileName('a/b:c?')).toBe('a_b_c_.zip')
  })
})
