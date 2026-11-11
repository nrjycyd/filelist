import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createOpenListApi, FILE_URL_TTL } from '../api'

/** A fetch that answers OpenList's JSON with `data` for every call, counting the calls. */
function answer(data: (body: { path?: string }) => unknown) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(url)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    return new Response(JSON.stringify({ code: 200, data: data(body) }))
  }))
  return calls
}

describe('OpenList client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reuses a file link for a while, then asks again (direct links expire)', async () => {
    let clock = 0
    let n = 0
    const calls = answer(() => ({ raw_url: `https://cdn.example.com/a.pdf?sig=${++n}` }))
    const api = createOpenListApi('https://pan.example.com', '', { now: () => clock })
    const file = { path: '/a.pdf' }
    expect(await api.fileUrl(file, '')).toBe('https://cdn.example.com/a.pdf?sig=1')
    clock = FILE_URL_TTL - 1
    expect(await api.fileUrl(file, '')).toBe('https://cdn.example.com/a.pdf?sig=1')
    clock = FILE_URL_TTL
    expect(await api.fileUrl(file, '')).toBe('https://cdn.example.com/a.pdf?sig=2')
    expect(calls).toHaveLength(2)
  })

  it('keeps absolute links exactly as given and resolves relative ones', async () => {
    const api = createOpenListApi('https://pan.example.com/', '')
    expect(await api.fileUrl({ path: '/a', raw_url: 'https://x.example.com/a%2Bb?s=1+2' }, '')).toBe('https://x.example.com/a%2Bb?s=1+2')
    expect(await api.fileUrl({ path: '/b', raw_url: '/p/b?sign=1' }, '')).toBe('https://pan.example.com/p/b?sign=1')
  })

  it('drops links that are not http(s) or blob and falls back to the signed /d/ link', async () => {
    answer(() => ({ raw_url: 'javascript:alert(1)' }))
    const api = createOpenListApi('https://pan.example.com', '')
    expect(await api.fileUrl({ path: '/x.txt', sign: 's' }, '')).toBe('https://pan.example.com/d/x.txt?sign=s')
    expect(await api.fileUrl({ path: '/y.txt', raw_url: 'data:text/html,hi' }, '')).toBe('https://pan.example.com/d/y.txt')
  })

  it('gives up on a request that does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const api = createOpenListApi('https://pan.example.com', '', { timeout: 20 })
    const error = await api.list('/', '').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(408)
  })
})
