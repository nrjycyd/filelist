// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils'
import type { MockTree } from './fileListHarness'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { check, dir, file, mockOpenList, mountList, row, setupFileListHooks } from './fileListHarness'

setupFileListHooks()

describe('FileList long folders', () => {
  const many = (count: number) => Array.from({ length: count }, (_, index) => file(`f${String(index + 1).padStart(2, '0')}.txt`))
  const names = (wrapper: VueWrapper) =>
    wrapper.findAll('.fl-row:not(.fl-head):not(.fl-more)').map((item) => item.find('.fl-name').text())
  const buttons = (wrapper: Pick<VueWrapper, 'findAll'>) =>
    wrapper.findAll('.fl-more-link').map((button) => button.attributes('aria-label') ?? button.text())
  const count = (wrapper: Pick<VueWrapper, 'find'>) => wrapper.find('.fl-more-count').text()

  it('shows a page per folder, then more, then the rest; the last row goes once all are shown', async () => {
    mockOpenList({ '/': many(8) })
    const wrapper = mountList({ path: '/', pageSize: 3 })
    await flushPromises()
    expect(names(wrapper)).toEqual(['f01.txt', 'f02.txt', 'f03.txt'])
    expect(count(wrapper)).toBe('还有 5 项')
    expect(wrapper.find('.fl-more-tag').text()).toBe('⋯')
    expect(buttons(wrapper)).toEqual(['再显示 3 项', '全部显示'])

    await wrapper.findAll('.fl-more-link')[0].trigger('click')
    expect(names(wrapper)).toHaveLength(6)
    expect(buttons(wrapper)).toEqual(['显示剩余 2 项'])

    await wrapper.find('.fl-more-link').trigger('click')
    expect(names(wrapper)).toHaveLength(8)
    expect(wrapper.find('.fl-more').exists()).toBe(false)
  })

  it('pins a long folder while scrolling through it, with “show less”', async () => {
    mockOpenList({ '/': [dir('A'), file('z.txt')], '/A': many(5) })
    const wrapper = mountList({ path: '/', pageSize: 2 })
    await flushPromises()
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()
    await wrapper.find('.fl-more-link').trigger('click')
    expect(names(wrapper)).toHaveLength(1 + 4 + 1)

    // Scrolled so that A's own row is above the screen and its files are on it.
    let past = false
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const path = (this as HTMLElement).dataset?.path
      const at = (top: number) => ({ top, bottom: top + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: top, toJSON: () => ({}) })
      if (path === '/A') return at(past ? -400 : -40) as DOMRect
      if (path === '/A/f04.txt') return at(past ? -80 : 300) as DOMRect
      return at(0) as DOMRect
    })
    const scrolled = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    window.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(wrapper.find('.fl-pin').exists()).toBe(true))
    expect(wrapper.find('.fl-pin-name').text()).toBe('A')
    expect(wrapper.find('.fl-pin-count').text()).toBe('已显示 4 / 5 项')

    // Past the folder's last file: no longer pinned.
    past = true
    window.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(wrapper.find('.fl-pin').exists()).toBe(false))
    past = false
    window.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(wrapper.find('.fl-pin').exists()).toBe(true))

    // Named for screen readers also where only the arrow shows (phones).
    expect(wrapper.find('.fl-pin-less').attributes('aria-label')).toBe('收起')
    await wrapper.find('.fl-pin-less').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toHaveLength(1 + 2 + 1)
    expect(wrapper.find('.fl-pin').exists()).toBe(false)
    // Back at the folder's row.
    expect(scrolled.mock.contexts.some((el) => (el as HTMLElement).dataset.path === '/A')).toBe(true)
  })

  it('starts a folder from its first page again once it is closed', async () => {
    mockOpenList({ '/': [dir('A')], '/A': many(5) })
    const wrapper = mountList({ path: '/', pageSize: 2 })
    await flushPromises()
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()
    await wrapper.find('.fl-more-all').trigger('click')
    expect(names(wrapper)).toHaveLength(1 + 5)

    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toHaveLength(1 + 2)
    expect(count(wrapper)).toBe('还有 3 项')
  })

  it('limits each folder on its own and keeps the count across a refresh', async () => {
    mockOpenList({ '/': [dir('A'), ...many(4)], '/A': many(5) })
    const wrapper = mountList({ path: '/', pageSize: 2 })
    await flushPromises()
    await wrapper.findAll('.fl-more-link')[1].trigger('click')
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()
    // Only A's row: the top level shows everything.
    const more = wrapper.findAll('.fl-more')
    expect(more).toHaveLength(1)
    expect(more[0].attributes('style')).toContain('--fl-depth: 1')

    await wrapper.find('.fl-refresh').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toHaveLength(1 + 2 + 4)
  })

  it('selects hidden files with their folder, and filtering shows every match', async () => {
    mockOpenList({ '/': [dir('A')], '/A': many(5) })
    const wrapper = mountList({ path: '/', pageSize: 2 })
    await flushPromises()
    await check(wrapper, 'A')
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 5 项')
    expect(names(wrapper)).toHaveLength(3)

    await wrapper.find('.fl-search input').setValue('f0')
    expect(names(wrapper)).toHaveLength(6)
    expect(wrapper.find('.fl-more').exists()).toBe(false)
  })

  it('shows everything with pageSize 0', async () => {
    mockOpenList({ '/': many(12) })
    const wrapper = mountList({ path: '/', pageSize: 0 })
    await flushPromises()
    expect(names(wrapper)).toHaveLength(12)
    expect(wrapper.find('.fl-more').exists()).toBe(false)
  })
})

describe('FileList deep search', () => {
  it.each([false, true])('shares a pending folder read with expand and selection (locked: %s)', async (locked) => {
    mockOpenList({ '/': [dir('target')], '/target': [file('target.txt')] }, locked ? { '/target': 'pw' } : {})
    const original = globalThis.fetch
    let reads = 0
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/fs/list') && JSON.parse(String(init?.body)).path === '/target') {
        reads += 1
        await pending
      }
      return original(input, init)
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await wrapper.get('.fl-search input').setValue('target')
    await wrapper.get('.fl-deep-link').trigger('click')
    await row(wrapper, 'target').get('.fl-arrow').trigger('click')
    await row(wrapper, 'target').get('.fl-cell-check input').trigger('change')
    await flushPromises()
    finish()
    await flushPromises()

    expect(reads).toBe(1)
    if (locked) {
      expect(row(wrapper, 'target').find('.fl-unlock-row input').exists()).toBe(true)
      expect(wrapper.find('.fl-toast').exists()).toBe(false)
    } else {
      expect(row(wrapper, 'target').attributes('aria-expanded')).toBe('true')
      expect(wrapper.get('.fl-selection-count').text()).toBe('已选 1 项')
    }
  })

  const tree: MockTree = {
    '/': [dir('A'), dir('Locked'), file('readme.txt')],
    '/A': [dir('B'), file('a-notes.txt')],
    '/A/B': [dir('C')],
    '/A/B/C': [file('target-1.pdf')],
    '/Locked': [file('target-2.pdf')],
  }
  const names = (wrapper: VueWrapper) =>
    wrapper.findAll('.fl-row:not(.fl-head):not(.fl-more)').map((item) => item.find('.fl-name').text())
  const status = (wrapper: VueWrapper) => wrapper.find('.fl-deep')
  const filter = (wrapper: VueWrapper, value: string) => wrapper.find('.fl-search input').setValue(value)

  it('offers deep search, then shows matches and locked folders in place', async () => {
    const { calls } = mockOpenList(tree, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'target')
    expect(names(wrapper)).toEqual([])
    expect(status(wrapper).text()).toBe('只筛选了已加载的内容，尝试深度搜索')

    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()
    // Matches in their folders, and the locked folder that could hide more.
    expect(names(wrapper)).toEqual(['A', 'B', 'C', 'target-1.pdf', 'Locked'])
    expect(row(wrapper, 'target-1.pdf').find('.fl-hit').text()).toBe('target')
    expect(row(wrapper, 'Locked').classes()).toContain('fl-row-locked')
    expect(row(wrapper, 'Locked').find('.fl-locked-hint').text()).toBe('未搜索（需要密码）')
    expect(status(wrapper).text()).toBe('已搜索全部 4 个文件夹 · 跳过 1 个加密文件夹')
    expect(wrapper.find('.fl-toast').exists()).toBe(false)
    expect(wrapper.find('.fl-row-prompting').exists()).toBe(false)

    await check(wrapper, 'target-1.pdf')
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 1 项')

    // Clearing the filter returns to the previous state; data kept, mode left.
    const listed = calls.filter((call) => call.path === '/api/fs/list').length
    await filter(wrapper, '')
    expect(names(wrapper)).toEqual(['A', 'Locked', 'readme.txt'])
    expect(status(wrapper).exists()).toBe(false)
    await filter(wrapper, 'target')
    expect(names(wrapper)).toContain('target-1.pdf')
    expect(names(wrapper)).not.toContain('Locked')
    expect(calls.filter((call) => call.path === '/api/fs/list')).toHaveLength(listed)
  })

  it('finishes with partial results and retries a failed folder only on request', async () => {
    const { calls } = mockOpenList(tree)
    const original = globalThis.fetch
    let attempts = 0
    let recovered = false
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/fs/list') && JSON.parse(String(init?.body)).path === '/Locked') {
        attempts += 1
        // Let a regression terminate instead of flooding the test runner.
        if (!recovered && attempts < 3) return new Response(null, { status: 503 })
      }
      return original(input, init)
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'target')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()

    expect(attempts).toBe(1)
    expect(names(wrapper)).toContain('target-1.pdf')
    expect(status(wrapper).text()).toContain('1 个文件夹读取失败')
    expect(status(wrapper).find('.fl-deep-link').text()).toBe('重试')
    const successfulReads = calls.filter((call) => call.path === '/api/fs/list' && call.body?.path === '/A').length

    recovered = true
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()
    expect(attempts).toBe(2)
    expect(names(wrapper)).toContain('target-2.pdf')
    expect(status(wrapper).text()).toBe('已搜索全部 4 个文件夹')
    expect(calls.filter((call) => call.path === '/api/fs/list' && call.body?.path === '/A')).toHaveLength(successfulReads)
  })

  it('unlocking a folder in the results searches it at once', async () => {
    mockOpenList(tree, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'target')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()

    await row(wrapper, 'Locked').find('.fl-lock').trigger('click')
    await row(wrapper, 'Locked').find('.fl-unlock-row input').setValue('pw')
    await row(wrapper, 'Locked').find('.fl-unlock-row input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(names(wrapper)).toContain('target-2.pdf')
    expect(status(wrapper).text()).toBe('已搜索全部 4 个文件夹')
  })

  it('keeps deep search results across a refresh, without asking again', async () => {
    const { calls } = mockOpenList(tree, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'target')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()

    const before = calls.length
    await wrapper.find('.fl-refresh').trigger('click')
    await flushPromises()
    expect(calls.length).toBeGreaterThan(before)
    expect(names(wrapper)).toEqual(['A', 'B', 'C', 'target-1.pdf', 'Locked'])
    expect(status(wrapper).find('.fl-deep-link').exists()).toBe(false)
    expect(status(wrapper).text()).toContain('已搜索全部')
  })

  it('a new keyword in deep search mode needs no second click', async () => {
    mockOpenList({ ...tree, '/A/B/C': [file('target-1.pdf'), dir('D')], '/A/B/C/D': [file('other-x.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'target')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()
    await filter(wrapper, 'other')
    await flushPromises()
    expect(names(wrapper)).toContain('other-x.txt')
    expect(status(wrapper).find('.fl-deep-link').exists()).toBe(false)
  })

  it('stops at deepSearchLimit and continues on request', async () => {
    mockOpenList(tree, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/', deepSearchLimit: 2 })
    await flushPromises()
    await filter(wrapper, 'target')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()
    expect(status(wrapper).text()).toBe('已查找 2 个文件夹，还有未搜索的子目录 · 跳过 1 个加密文件夹 · 继续')
    expect(names(wrapper)).not.toContain('target-1.pdf')

    await status(wrapper).find('.fl-deep-link').trigger('click')
    await flushPromises()
    expect(names(wrapper)).toContain('target-1.pdf')
    expect(status(wrapper).text()).toContain('已搜索全部 4 个文件夹')
  })

  it('can be stopped, and then waits for Continue', async () => {
    mockOpenList(tree)
    const original = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return original(input, init)
    }))
    const wrapper = mountList({ path: '/' })
    await vi.waitFor(() => expect(names(wrapper)).toHaveLength(3))
    await filter(wrapper, 'target')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    expect(status(wrapper).text()).toContain('正在深度搜索')

    await status(wrapper).find('.fl-deep-link').trigger('click')
    expect(status(wrapper).text()).toContain('继续')
    await new Promise((resolve) => setTimeout(resolve, 200))
    await flushPromises()
    expect(names(wrapper)).not.toContain('target-1.pdf')
    expect(status(wrapper).text()).toContain('继续')
  })

  it('searches deep at once with deep-search="auto"', async () => {
    mockOpenList(tree)
    const wrapper = mountList({ path: '/', deepSearch: 'auto' })
    await flushPromises()
    await filter(wrapper, 'target')
    await flushPromises()
    expect(names(wrapper)).toContain('target-1.pdf')
  })

  it('shows no status line when everything is already loaded', async () => {
    mockOpenList({ '/': [file('a.txt'), file('b.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'a')
    expect(status(wrapper).exists()).toBe(false)
  })

  it('clears the filter with the × or Esc', async () => {
    mockOpenList(tree)
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    expect(wrapper.find('.fl-search-clear').exists()).toBe(false)
    await filter(wrapper, 'target')
    await wrapper.find('.fl-search-clear').trigger('click')
    expect((wrapper.find('.fl-search input').element as HTMLInputElement).value).toBe('')
    expect(names(wrapper)).toEqual(['A', 'Locked', 'readme.txt'])

    await filter(wrapper, 'readme')
    await wrapper.find('.fl-search input').trigger('keydown', { key: 'Escape' })
    expect((wrapper.find('.fl-search input').element as HTMLInputElement).value).toBe('')
  })

  it('aborts in-flight deep-search requests on Stop without cancelling a shared manual expand', async () => {
    mockOpenList({ '/': [dir('Solo'), dir('Shared')], '/Solo': [file('s.txt')], '/Shared': [file('m.txt')] })
    const original = globalThis.fetch
    const signals = new Map<string, AbortSignal>()
    const releases = new Map<string, () => void>()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/api/fs/list')) {
        const target = JSON.parse(String(init?.body)).path as string
        if (target === '/Solo' || target === '/Shared') {
          if (init?.signal) signals.set(target, init.signal)
          await new Promise<void>((resolve, reject) => {
            releases.set(target, resolve)
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          })
        }
      }
      return original(input, init)
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await filter(wrapper, 'S')
    await status(wrapper).find('.fl-deep-link').trigger('click')
    await vi.waitFor(() => expect(signals.size).toBe(2))
    // While running, .fl-deep omits role="status" to avoid spamming screen readers.
    expect(status(wrapper).attributes('role')).toBeUndefined()

    // User manually expands /Shared while deep search is also reading it.
    await row(wrapper, 'Shared').find('.fl-arrow').trigger('click')
    // Stopping deep search aborts /Solo (deep-search only) but preserves /Shared (shared with manual expand).
    await status(wrapper).find('.fl-deep-link').trigger('click')
    expect(signals.get('/Solo')?.aborted).toBe(true)
    expect(signals.get('/Shared')?.aborted).toBe(false)
    expect(status(wrapper).attributes('role')).toBe('status')

    releases.get('/Shared')?.()
    await flushPromises()
    expect(row(wrapper, 'Shared').attributes('aria-expanded')).toBe('true')
  })
})
