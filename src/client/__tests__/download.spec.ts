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

describe('zipToBlob', () => {
  it('stops and rejects when aborted', async () => {
    vi.doMock('client-zip', () => ({
      makeZip: () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])) } }),
    }))
    const { zipToBlob } = await import('../download')
    const controller = new AbortController()
    const promise = zipToBlob([], { urlOf: async () => '', signal: controller.signal, onProgress: () => {} })
    controller.abort()
    await expect(promise).rejects.toBeTruthy()
    vi.doUnmock('client-zip')
  })
})

describe('openUrl', () => {
  it('opens other links in a new tab so the page is never replaced', async () => {
    const { openUrl } = await import('../download')
    const anchors: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push(this)
    })
    openUrl('https://s3.example.com/a.png?sig=1', { sameTab: false, name: 'a.png' })
    openUrl('https://pan.example.com/p/a.png', { sameTab: true, name: 'a.png' })
    expect(anchors.map((anchor) => anchor.target)).toEqual(['_blank', ''])
    expect(document.querySelector('a')).toBeNull()
  })
})
