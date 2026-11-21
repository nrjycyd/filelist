// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { BASE, check, dir, file, mockOpenList, mountList, row, setupFileListHooks, zipMock, zipSelected } from './fileListHarness'

setupFileListHooks()

describe('FileList batch ZIP', () => {
  it('shares selection and adds one ZIP entry for a file mounted twice', async () => {
    mockOpenList({ '/docs': [file('report.pdf')] })
    const wrapper = mountList({
      sources: [{ path: '/docs', expanded: true }, { path: '/docs/report.pdf', title: 'Report alias' }],
    })
    await flushPromises()

    const nested = row(wrapper, 'report.pdf')
    const alias = row(wrapper, 'Report alias.pdf')
    expect(nested.attributes('data-key')).not.toBe(alias.attributes('data-key'))
    await check(wrapper, 'Report alias.pdf')
    expect(nested.get<HTMLInputElement>('input[type="checkbox"]').element.checked).toBe(true)
    expect(wrapper.get('.fl-selection-count').text()).toBe('已选 1 项')
    expect(Object.keys(await zipSelected(wrapper))).toEqual(['docs/report.pdf'])
  })

  it('preserves separate expansion states for duplicate folder mounts on refresh', async () => {
    mockOpenList({ '/docs': [file('report.pdf')] })
    const wrapper = mountList({
      sources: [{ path: '/docs', title: 'Expanded', expanded: true }, { path: '/docs', title: 'Collapsed' }],
    })
    await flushPromises()
    await wrapper.get('.fl-refresh').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'Expanded').attributes('aria-expanded')).toBe('true')
    expect(row(wrapper, 'Collapsed').attributes('aria-expanded')).toBe('false')
  })

  it('keeps same-named files from different folders as separate entries', async () => {
    mockOpenList({
      '/课程/语文': [file('第1章.pdf')],
      '/课程/数学': [file('第1章.pdf'), dir('习题')],
      '/课程/数学/习题': [file('第1章.pdf')],
    })
    const wrapper = mountList({ sources: [{ path: '/课程/语文' }, { path: '/课程/数学' }] })
    await flushPromises()

    await check(wrapper, '语文')
    await check(wrapper, '数学')
    const entries = await zipSelected(wrapper)

    expect(Object.keys(entries).sort()).toEqual([
      '数学/习题/第1章.pdf',
      '数学/第1章.pdf',
      '语文/第1章.pdf',
    ])
    expect(entries['语文/第1章.pdf']).toBe('/p/课程/语文/第1章.pdf')
    expect(entries['数学/习题/第1章.pdf']).toBe('/p/课程/数学/习题/第1章.pdf')
  })

  it('uses the source title as the ZIP folder and keeps a file root\'s real name', async () => {
    mockOpenList({ '/a/docs': [file('readme.txt')] })
    const wrapper = mountList({
      sources: [
        { path: '/a/docs', title: '文档' },
        { path: '/a/说明.pdf', title: '说明' },
      ],
    })
    await flushPromises()

    await check(wrapper, '文档')
    await check(wrapper, '说明.pdf')
    const entries = await zipSelected(wrapper)

    expect(Object.keys(entries).sort()).toEqual(['文档/readme.txt', '说明.pdf'])
  })
})

describe('FileList folder selection', () => {
  it.each([true, false])('shows a partially loaded folder as mixed after selecting all (empty child: %s)', async (empty) => {
    const { calls } = mockOpenList({
      '/': [dir('A')],
      '/A': [file('a.txt'), dir('B')],
      '/A/B': empty ? [] : [file('b.txt')],
    })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()

    const parent = row(wrapper, 'A').get<HTMLInputElement>('.fl-cell-check input')
    const all = wrapper.get<HTMLInputElement>('.fl-head .fl-cell-check input')
    await all.setValue(true)
    expect(all.element.checked).toBe(true)
    expect(parent.element.checked).toBe(false)
    expect(parent.element.indeterminate).toBe(true)
    expect(calls.some((call) => call.body?.path === '/A/B')).toBe(false)

    await parent.setValue(true)
    await flushPromises()
    expect(calls.some((call) => call.body?.path === '/A/B')).toBe(true)
    expect(parent.element.checked).toBe(true)
    expect(parent.element.indeterminate).toBe(false)
    expect(wrapper.find('.fl-selection').text()).toContain(empty ? '已选 1 项' : '已选 2 项')
  })

  it('loads and selects every nested file when a folder is checked', async () => {
    const { calls } = mockOpenList({
      '/': [dir('A')],
      '/A': [file('a1.txt'), dir('B')],
      '/A/B': [dir('C')],
      '/A/B/C': [file('c1.txt')],
    })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await check(wrapper, 'A')

    const listed = calls.filter((call) => call.path === '/api/fs/list').map((call) => call.body?.path)
    expect(listed).toEqual(expect.arrayContaining(['/A', '/A/B', '/A/B/C']))
    expect(wrapper.find('.fl-selection').text()).toContain('已选 2 项')

    const entries = await zipSelected(wrapper)
    expect(Object.keys(entries).sort()).toEqual(['A/B/C/c1.txt', 'A/a1.txt'])
  })

  it('unchecks a fully selected folder without reloading it', async () => {
    const { calls } = mockOpenList({ '/': [dir('A')], '/A': [file('a1.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await check(wrapper, 'A')
    const listCount = calls.filter((call) => call.path === '/api/fs/list').length
    await check(wrapper, 'A')

    expect(wrapper.find('.fl-selection').exists()).toBe(false)
    expect(calls.filter((call) => call.path === '/api/fs/list')).toHaveLength(listCount)
  })
})

describe('FileList batch ZIP limits and streaming', () => {
  const pick = async (wrapper: VueWrapper, ...names: string[]) => {
    for (const name of names) await check(wrapper, name)
  }

  it('asks before an in-memory ZIP above zipWarnSize, and zips on confirm', async () => {
    mockOpenList({ '/': [file('a.pdf'), file('b.pdf')] })
    const wrapper = mountList({ path: '/', zipWarnSize: 1e-9 })
    await flushPromises()
    await pick(wrapper, 'a.pdf', 'b.pdf')

    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.fl-confirm-title').text()).toBe('文件较大（2 B）')
    expect(zipMock.entries).toBeNull()

    await wrapper.findAll('.fl-confirm-actions button').at(-1)!.trigger('click')
    await vi.waitFor(() => expect(Object.keys(zipMock.entries ?? {})).toEqual(['a.pdf', 'b.pdf']))
    await flushPromises()
    expect(wrapper.find('.fl-confirm-panel').exists()).toBe(false)
    expect(wrapper.find('.fl-toast').text()).toContain('已打包')
  })

  it('cancelling the warning zips nothing', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    const wrapper = mountList({ path: '/', zipWarnSize: 1e-9 })
    await flushPromises()
    await pick(wrapper, 'a.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await flushPromises()
    await wrapper.findAll('.fl-confirm-actions button')[0].trigger('click')
    await flushPromises()
    expect(wrapper.find('.fl-confirm-panel').exists()).toBe(false)
    expect(zipMock.entries).toBeNull()
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 1 项')
  })

  it('refuses above zipMaxSize with a single button', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    const wrapper = mountList({ path: '/', zipMaxSize: 1e-9 })
    await flushPromises()
    await pick(wrapper, 'a.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.fl-confirm-title').text()).toBe('无法打包 1 B')
    const buttons = wrapper.findAll('.fl-confirm-actions button')
    expect(buttons.map((button) => button.text())).toEqual(['知道了'])
    await buttons[0].trigger('click')
    expect(zipMock.entries).toBeNull()
  })

  it('streams into a picked file when the browser supports it', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    const written: number[] = []
    const picker = vi.fn(async () => ({
      name: 'mine.zip',
      createWritable: async () =>
        new WritableStream<Uint8Array>({
          write(chunk) {
            written.push(...chunk)
          },
        }),
    }))
    vi.stubGlobal('showSaveFilePicker', picker)
    vi.stubGlobal('isSecureContext', true)
    const wrapper = mountList({ path: '/', title: '资料', zipMaxSize: 1e-9 })
    await flushPromises()
    await pick(wrapper, 'a.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await vi.waitFor(() => expect(written).toEqual([0x50, 0x4b]))
    await flushPromises()

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: '资料.zip' }))
    expect(wrapper.find('.fl-confirm-panel').exists()).toBe(false)
    expect(wrapper.find('.fl-toast').text()).toContain('mine.zip')
    expect(wrapper.find('.fl-selection').exists()).toBe(false)
  })

  it('does nothing when the save dialog is dismissed', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    vi.stubGlobal('showSaveFilePicker', vi.fn(async () => {
      throw new DOMException('dismissed', 'AbortError')
    }))
    vi.stubGlobal('isSecureContext', true)
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await pick(wrapper, 'a.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.fl-toast').exists()).toBe(false)
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 1 项')
  })

  it('shows progress, locks selection, and can be cancelled', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    const original = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).includes('/p/')) return original(input, init)
      // A download that never finishes until aborted.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason))
        },
      })
      return new Response(body)
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await pick(wrapper, 'a.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.fl-zip-cancel').exists()).toBe(true))

    expect(wrapper.find('.fl-selection-count').text()).toMatch(/^打包中 \d+%$/)
    expect(wrapper.find('.fl-clear').exists()).toBe(false)
    expect((row(wrapper, 'a.pdf').find('.fl-cell-check input').element as HTMLInputElement).disabled).toBe(true)

    await wrapper.find('.fl-zip-cancel').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.fl-toast').text()).toBe('已取消下载'))
    expect(wrapper.find('.fl-zip-cancel').exists()).toBe(false)
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 1 项')
  })
})

describe('FileList single download', () => {
  it('downloads OpenList links in place, without a new tab, and says so', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    const anchors: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push(this)
    })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'a.pdf').find('.fl-download').trigger('click')
    await flushPromises()

    expect(anchors).toHaveLength(1)
    expect(anchors[0].href).toBe(`${BASE}/p/a.pdf`)
    expect(anchors[0].target).toBe('')
    expect(anchors[0].getAttribute('download')).toBe('a.pdf')
    expect(wrapper.find('.fl-toast').text()).toBe('已交给浏览器下载：a.pdf')
  })
})

describe('FileList batch ZIP concurrency', () => {
  it('fetches at most four files at once and keeps their order in the ZIP', async () => {
    const names = Array.from({ length: 9 }, (_, index) => `f${index + 1}.txt`)
    mockOpenList({ '/': names.map(file) })
    const original = globalThis.fetch
    let inFlight = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).includes('/p/')) return original(input, init)
      inFlight += 1
      peak = Math.max(peak, inFlight)
      // Later files answer faster, so order only holds if the ZIP keeps it.
      const index = Number(String(input).match(/f(\d+)/)?.[1] ?? 0)
      await new Promise((resolve) => setTimeout(resolve, 40 - index * 4))
      inFlight -= 1
      return new Response(new TextEncoder().encode(String(input)))
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await wrapper.find('.fl-head .fl-cell-check input').trigger('change')
    const entries = await zipSelected(wrapper)

    expect(Object.keys(entries)).toEqual(names)
    expect(peak).toBe(4)
  })
})

describe('FileList batch ZIP failure', () => {
  it('explains a failed ZIP in a dialog and keeps the selection', async () => {
    mockOpenList({ '/': [file('a.pdf'), file('b.pdf')] }, {}, { files: { '/b.pdf': { status: 500 } } })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await check(wrapper, 'a.pdf')
    await check(wrapper, 'b.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.fl-confirm-title').exists()).toBe(true))

    expect(wrapper.find('.fl-confirm-title').text()).toBe('打包失败')
    expect(wrapper.find('.fl-confirm-text').text()).toBe('b.pdf：HTTP 500')
    expect(wrapper.findAll('.fl-confirm-actions button').map((button) => button.text())).toEqual(['知道了'])
    expect(wrapper.find('.fl-toast').exists()).toBe(false)
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 2 项')

    await wrapper.find('.fl-confirm-actions button').trigger('click')
    expect(wrapper.find('.fl-confirm-panel').exists()).toBe(false)
  })

  it('uses locale-appropriate punctuation for ZIP HTTP errors in en-US', async () => {
    mockOpenList({ '/': [file('b.pdf')] }, {}, { files: { '/b.pdf': { status: 500 } } })
    const wrapper = mountList({ path: '/', locale: 'en-US' })
    await flushPromises()
    await check(wrapper, 'b.pdf')
    await wrapper.find('.fl-bar .fl-btn-primary').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.fl-confirm-title').exists()).toBe(true))

    expect(wrapper.find('.fl-confirm-title').text()).toBe('Could not create the ZIP')
    expect(wrapper.find('.fl-confirm-text').text()).toBe('b.pdf: HTTP 500')
  })
})
