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

  it('deduplicates concurrent fileUrl lookups and skips caching if cleared mid-flight', async () => {
    let release!: (res: Response) => void
    let fetchCount = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      fetchCount += 1
      return new Promise<Response>((resolve) => {
        release = resolve
      })
    }))
    const api = createOpenListApi('https://pan.example.com', '')
    const file = { path: '/docs/a.pdf' }
    const first = api.fileUrl(file, '')
    const second = api.fileUrl(file, '')
    expect(fetchCount).toBe(1)

    release(new Response(JSON.stringify({ code: 200, data: { raw_url: 'https://cdn.example.com/a.pdf?v=1' } })))
    expect(await Promise.all([first, second])).toEqual([
      'https://cdn.example.com/a.pdf?v=1',
      'https://cdn.example.com/a.pdf?v=1',
    ])

    // If clearCache runs while a lookup is in flight, its result must not repopulate the cache.
    api.clearCache()
    const stale = api.fileUrl(file, '')
    api.clearCache('/docs')
    release(new Response(JSON.stringify({ code: 200, data: { raw_url: 'https://cdn.example.com/a.pdf?v=stale' } })))
    expect(await stale).toBe('https://cdn.example.com/a.pdf?v=stale')

    const fresh = api.fileUrl(file, '')
    expect(fetchCount).toBe(3)
    release(new Response(JSON.stringify({ code: 200, data: { raw_url: 'https://cdn.example.com/a.pdf?v=fresh' } })))
    expect(await fresh).toBe('https://cdn.example.com/a.pdf?v=fresh')
  })

  it('propagates external AbortSignal without misreporting a 408 timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const api = createOpenListApi('https://pan.example.com', '', { timeout: 5000 })
    const controller = new AbortController()
    const promise = api.list('/', '', controller.signal)
    controller.abort()
    const error = await promise.catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as DOMException).name).toBe('AbortError')
  })

  it('prunes expired and oldest entries once the fileUrl cache reaches its cap', async () => {
    let clock = 0
    const calls = answer((body) => ({ raw_url: `https://cdn.example.com${body.path}?t=${clock}` }))
    const api = createOpenListApi('https://pan.example.com', '', { now: () => clock })
    for (let i = 0; i < 501; i++) {
      await api.fileUrl({ path: `/f${i}.txt` }, '')
    }
    expect(calls).toHaveLength(501)
    // Entry 0 was evicted when entry 500 inserted; entry 500 is still cached.
    await api.fileUrl({ path: '/f500.txt' }, '')
    expect(calls).toHaveLength(501)
    await api.fileUrl({ path: '/f0.txt' }, '')
    expect(calls).toHaveLength(502)
    clock = FILE_URL_TTL + 1
    await api.fileUrl({ path: '/f500.txt' }, '')
    expect(calls).toHaveLength(503)
  })
})
