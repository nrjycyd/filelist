// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils'
import type { FileListProps } from '../types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import FileList from '../FileList.vue'

const zipMock = vi.hoisted(() => ({ entries: null as Record<string, Uint8Array> | null }))

vi.mock('client-zip', () => ({
  makeZip: (files: AsyncIterable<{ name: string; input: ReadableStream<Uint8Array> }>) =>
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const entries: Record<string, Uint8Array> = {}
        try {
          for await (const file of files) {
            const reader = file.input.getReader()
            const parts: number[] = []
            for (let part = await reader.read(); !part.done; part = await reader.read()) parts.push(...part.value)
            entries[file.name] = new Uint8Array(parts)
          }
        } catch (error) {
          controller.error(error)
          return
        }
        zipMock.entries = entries
        controller.enqueue(new Uint8Array([0x50, 0x4b]))
        controller.close()
      },
    }),
}))

const BASE = 'https://pan.example.com'

interface MockItem {
  name: string
  is_dir: boolean
}

type MockTree = Record<string, MockItem[]>

interface Call {
  path: string
  headers?: Record<string, string>
  body?: { path?: string; password?: string }
}

const dir = (name: string): MockItem => ({ name, is_dir: true })
const file = (name: string): MockItem => ({ name, is_dir: false })

/** Minimal OpenList server: `/api/fs/list`, `/api/fs/get`, `/p/...` and folder passwords. */
interface MockOptions {
  /** Extra public settings, e.g. `iframe_previews`. */
  settings?: Record<string, string>
  /** Override `/p/<path>` responses. */
  files?: Record<string, { status?: number; body?: string }>
}

function mockOpenList(tree: MockTree, passwords: Record<string, string> = {}, options: MockOptions = {}) {
  const calls: Call[] = []
  const json = (data: unknown, code = 200, message = 'success') =>
    new Response(JSON.stringify({ code, message, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const pathname = decodeURIComponent(url.pathname)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ path: pathname, body, headers: { ...((init?.headers as Record<string, string>) ?? {}) } })

    if (pathname === '/api/public/settings') return json({ site_title: 'Pan', ...options.settings })

    if (pathname === '/api/fs/list' || pathname === '/api/fs/get') {
      const target: string = body.path
      const guard = Object.entries(passwords).find(
        ([prefix]) => target === prefix || target.startsWith(`${prefix}/`),
      )
      if (guard && body.password !== guard[1]) {
        return json(null, 403, 'password is incorrect or you have no permission')
      }
      if (pathname === '/api/fs/list') {
        return json({
          content: (tree[target] ?? []).map((item) => ({
            ...item,
            size: item.is_dir ? 0 : target.length,
            modified: '2026-01-01T00:00:00Z',
          })),
        })
      }
      const isDir = target in tree
      return json({
        name: target.split('/').pop(),
        is_dir: isDir,
        size: isDir ? 0 : 1,
        modified: '2026-01-01T00:00:00Z',
        raw_url: `${BASE}/p${target}`,
      })
    }

    if (pathname.startsWith('/p/')) {
      const custom = options.files?.[pathname.slice(2)]
      if (custom) return new Response(custom.body ?? '', { status: custom.status ?? 200 })
      return new Response(new TextEncoder().encode(pathname))
    }
    return new Response('not found', { status: 404 })
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

function mountList(props: FileListProps) {
  return mount(FileList, { props: { base: BASE, ...props }, attachTo: document.body })
}

function row(wrapper: Pick<VueWrapper, 'findAll'>, name: string) {
  const match = wrapper
    .findAll('.fl-row:not(.fl-head)')
    .find((item) => item.find('.fl-name').exists() && item.find('.fl-name').text().endsWith(name))
  if (!match) throw new Error(`row "${name}" not found`)
  return match
}

async function check(wrapper: VueWrapper, name: string) {
  await row(wrapper, name).find('.fl-cell-check input').trigger('change')
  await flushPromises()
}

async function zipSelected(wrapper: VueWrapper): Promise<Record<string, string>> {
  await wrapper.find('.fl-btn-primary').trigger('click')
  await vi.waitFor(() => expect(zipMock.entries).not.toBeNull())
  const decoder = new TextDecoder()
  return Object.fromEntries(
    Object.entries(zipMock.entries ?? {}).map(([key, value]) => [key, decoder.decode(value)]),
  )
}

beforeEach(() => {
  sessionStorage.clear()
  zipMock.entries = null
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

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

describe('FileList passwords with sources', () => {
  it('asks for a password in the same row and uses it afterwards', async () => {
    const { calls } = mockOpenList({ '/secret': [file('s.txt')] }, { '/secret': 'pw' })
    const wrapper = mountList({ sources: [{ path: '/secret' }] })
    await flushPromises()
    expect(row(wrapper, 'secret').classes()).toContain('fl-row-locked')
    expect(wrapper.find('.fl-unlock-row').exists()).toBe(false)

    await row(wrapper, 'secret').find('.fl-lock').trigger('click')
    await flushPromises()
    const lockedRow = row(wrapper, 'secret')
    expect(lockedRow.classes()).toContain('fl-row-prompting')
    expect(wrapper.findAll('.fl-row:not(.fl-head)')).toHaveLength(1)

    await lockedRow.find('.fl-unlock-row input').setValue('pw')
    await lockedRow.find('.fl-unlock-row input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(row(wrapper, 'secret').classes()).not.toContain('fl-row-locked')
    expect(row(wrapper, 's.txt').exists()).toBe(true)
    const lastList = calls.filter((call) => call.path === '/api/fs/list').at(-1)
    expect(lastList?.body).toMatchObject({ path: '/secret', password: 'pw' })

    await check(wrapper, 's.txt')
    const entries = await zipSelected(wrapper)
    expect(Object.keys(entries)).toEqual(['secret/s.txt'])
    const get = calls.find((call) => call.path === '/api/fs/get' && call.body?.path === '/secret/s.txt')
    expect(get?.body?.password).toBe('pw')
  })

  it('keeps a per-source password ahead of the runtime one', async () => {
    const { calls } = mockOpenList(
      { '/x': [file('x.txt')], '/y': [file('y.txt')] },
      { '/x': 'px', '/y': 'py' },
    )
    const wrapper = mountList({
      password: 'py',
      sources: [{ path: '/x', password: 'px', expanded: true }, { path: '/y', expanded: true }],
    })
    await flushPromises()

    expect(row(wrapper, 'x.txt').exists()).toBe(true)
    expect(row(wrapper, 'y.txt').exists()).toBe(true)
    const lists = calls.filter((call) => call.path === '/api/fs/list').map((call) => call.body)
    expect(lists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/x', password: 'px' }),
        expect.objectContaining({ path: '/y', password: 'py' }),
      ]),
    )
  })
})

describe('FileList toolbar and rows', () => {
  it('turns the toolbar into a selection bar and back', async () => {
    mockOpenList({ '/': [file('a.pdf'), file('b.docx')] })
    const wrapper = mountList({ path: '/', title: '资料' })
    await flushPromises()

    expect(wrapper.find('.fl-title').text()).toContain('资料')
    expect(wrapper.find('.fl-btn-primary').exists()).toBe(false)

    await check(wrapper, 'a.pdf')
    await check(wrapper, 'b.docx')
    expect(wrapper.find('.fl-root').classes()).toContain('fl-selecting')
    expect(wrapper.find('.fl-title').exists()).toBe(false)
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 2 项')
    // sizes from the mock: each file's size is the length of its parent path ('/')
    expect(wrapper.find('.fl-selection-size').text()).toBe('共 2 B')
    expect(wrapper.find('.fl-btn-primary').text()).toContain('下载 ZIP')

    await wrapper.find('.fl-clear').trigger('click')
    expect(wrapper.find('.fl-root').classes()).not.toContain('fl-selecting')
    expect(wrapper.find('.fl-title').exists()).toBe(true)
    expect(wrapper.findAll('.fl-row-selected')).toHaveLength(0)
  })

  it('colours type badges by file family and labels them with the extension', async () => {
    mockOpenList({ '/': [file('a.pdf'), file('b.xlsx'), file('c.pptx'), file('d.bin')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    const badge = (name: string) => row(wrapper, name).find('.fl-type')
    expect(badge('a.pdf').attributes('data-kind')).toBe('pdf')
    expect(badge('b.xlsx').attributes('data-kind')).toBe('sheet')
    expect(badge('c.pptx').attributes('data-kind')).toBe('slide')
    expect(badge('d.bin').attributes('data-kind')).toBe('other')
    expect(badge('b.xlsx').text()).toBe('XLSX')
  })

  it('shows a file count for loaded folders and keeps names free of extra text', async () => {
    mockOpenList({ '/': [dir('A')], '/A': [file('x.txt'), file('y.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    expect(row(wrapper, 'A').find('.fl-count').exists()).toBe(false)
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()

    expect(row(wrapper, 'A').find('.fl-count').text()).toBe('2 项')
    expect(row(wrapper, 'A').find('.fl-name').text()).toBe('A')
    expect(row(wrapper, 'x.txt').find('.fl-meta').text()).toContain('2 B')
    expect(row(wrapper, 'A').find('.fl-arrow').attributes('aria-expanded')).toBe('true')
  })

  it('sorts from the sort menu: a field keeps the order, the switch sets it', async () => {
    mockOpenList({ '/': [file('b.txt'), file('a.txt'), file('c.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    const names = () => wrapper.findAll('.fl-row:not(.fl-head) .fl-name').map((item) => item.text())
    const trigger = wrapper.find('.fl-sort-trigger')
    expect(names()).toEqual(['a.txt', 'b.txt', 'c.txt'])
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-label')).toBe('排序 文件名，升序')
    expect(wrapper.find('.fl-menu').exists()).toBe(false)

    await trigger.trigger('click')
    await flushPromises()
    const menu = wrapper.find('.fl-menu')
    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(menu.attributes('role')).toBe('menu')
    expect(trigger.attributes('aria-controls')).toBe(menu.attributes('id'))
    const fields = menu.findAll('.fl-menu-item')
    expect(fields.map((item) => [item.text(), item.attributes('aria-checked')])).toEqual([
      ['文件名', 'true'],
      ['文件大小', 'false'],
      ['修改日期', 'false'],
    ])
    const order = () =>
      wrapper.findAll('.fl-menu-order-btn').map((item) => [item.text(), item.attributes('aria-label'), item.attributes('aria-checked')])
    expect(order()).toEqual([
      ['升序', '文件名，升序', 'true'],
      ['降序', '文件名，降序', 'false'],
    ])
    // The checked row has focus, so a screen reader starts there.
    expect(document.activeElement).toBe(fields[0].element)

    await menu.findAll('.fl-menu-order-btn')[1].trigger('click')
    expect(names()).toEqual(['c.txt', 'b.txt', 'a.txt'])
    expect(wrapper.find('.fl-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    expect(trigger.text()).toContain('文件名 ↓')
    expect(wrapper.find('.fl-head .fl-cell-name .fl-sort').text()).toBe('▼')

    // Another field keeps the order (descending); the switch names the field for screen readers.
    await trigger.trigger('click')
    await flushPromises()
    await wrapper.findAll('.fl-menu-item')[2].trigger('click')
    expect(trigger.text()).toContain('修改日期 ↓')
    await trigger.trigger('click')
    await flushPromises()
    expect(order()).toEqual([
      ['升序', '修改日期，升序', 'false'],
      ['降序', '修改日期，降序', 'true'],
    ])
    wrapper.unmount()
  })

  it('moves through the sort menu with the keyboard and closes it from outside', async () => {
    mockOpenList({ '/': [file('b.txt'), file('a.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    const trigger = wrapper.find('.fl-sort-trigger')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    const items = () => wrapper.findAll('[role="menuitemradio"]').map((item) => item.element)
    expect(items()).toHaveLength(5)
    expect(document.activeElement).toBe(items()[0])
    const key = (k: string) => wrapper.find('.fl-menu').trigger('keydown', { key: k })
    await key('ArrowDown')
    expect(document.activeElement).toBe(items()[1])
    await key('End')
    expect(document.activeElement).toBe(items()[4])
    await key('ArrowDown')
    expect(document.activeElement).toBe(items()[0])
    await key('ArrowUp')
    expect(document.activeElement).toBe(items()[4])
    await key('Escape')
    expect(wrapper.find('.fl-menu').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    // ↑ on the button starts from the last item.
    await trigger.trigger('keydown', { key: 'ArrowUp' })
    await flushPromises()
    expect(document.activeElement).toBe(items()[4])

    // A tap outside closes it without moving focus back.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('.fl-menu').exists()).toBe(false)
    expect(trigger.attributes('aria-expanded')).toBe('false')

    // Tapping the button again closes it too.
    await trigger.trigger('click')
    await flushPromises()
    await trigger.trigger('click')
    expect(wrapper.find('.fl-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not show an unexpanded-folders hint in the footer', async () => {
    mockOpenList({ '/': [dir('A'), dir('B'), file('x.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    const foot = wrapper.find('.fl-foot').text()
    expect(foot).toContain('1 个已加载文件')
    expect(foot).not.toContain('未展开')
    expect(wrapper.find('.fl-foot-hint').exists()).toBe(false)
  })

  it('indents rows by depth', async () => {
    mockOpenList({ '/': [dir('A')], '/A': [file('x.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()

    expect(row(wrapper, 'A').attributes('style')).toContain('--fl-depth: 0')
    expect(row(wrapper, 'x.txt').attributes('style')).toContain('--fl-depth: 1')
  })
})

describe('FileList preview dialog', () => {
  it.each(['课程报告', '课程报告.pdf'])('keeps PDF preview for the source title %s', async (title) => {
    mockOpenList({})
    const wrapper = mountList({ sources: [{ path: '/report.pdf', title }] })
    await flushPromises()

    const file = row(wrapper, '课程报告.pdf')
    expect(file.get('.fl-type').text()).toBe('PDF')
    await file.get('.fl-preview-btn').trigger('click')
    await flushPromises()
    expect(wrapper.get('.fl-preview-name').text()).toBe('课程报告.pdf')
    expect(wrapper.get('.fl-preview-frame').attributes('title')).toBe('课程报告.pdf')
  })

  const dialogOf = (wrapper: VueWrapper) => wrapper.find('dialog.fl-preview')
  const openPreview = async (wrapper: VueWrapper, name: string) => {
    await row(wrapper, name).find(`[aria-label="预览 ${name}"]`).trigger('click')
    await flushPromises()
  }

  it('shows the preview button only for types the dialog can render', async () => {
    mockOpenList({ '/': [file('a.pdf'), file('b.png'), file('c.docx'), file('d.txt'), file('e.zip')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    const hasPreview = (name: string) => row(wrapper, name).find(`[aria-label="预览 ${name}"]`).exists()
    expect(hasPreview('a.pdf')).toBe(true)
    expect(hasPreview('b.png')).toBe(true)
    expect(hasPreview('d.txt')).toBe(true)
    expect(hasPreview('c.docx')).toBe(false)
    expect(hasPreview('e.zip')).toBe(false)
  })

  it('opens images in the dialog without navigating or downloading', async () => {
    mockOpenList({ '/': [file('b.png')] })
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await openPreview(wrapper, 'b.png')
    const dialog = dialogOf(wrapper)
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.find('.fl-preview-name').text()).toBe('b.png')
    expect(dialog.find('img.fl-preview-image').attributes('src')).toBe(`${BASE}/p/b.png`)
    expect(open).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()

    await dialog.find('.fl-preview-rotate').trigger('click')
    expect(dialog.find('img.fl-preview-image').attributes('style')).toContain('rotate(90deg)')
  })

  it('reads text with a Range request and shows it as plain text', async () => {
    const { calls } = mockOpenList({ '/': [file('notes.md')] }, {}, { files: { '/notes.md': { body: '# 标题\n正文' } } })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await openPreview(wrapper, 'notes.md')
    await vi.waitFor(() => expect(dialogOf(wrapper).find('.fl-preview-text pre').exists()).toBe(true))
    expect(dialogOf(wrapper).find('.fl-preview-text pre').text()).toBe('# 标题\n正文')
    const fileCall = calls.find((call) => call.path === '/p/notes.md')
    expect(fileCall?.headers?.Range).toBe(`bytes=0-${1024 * 1024 - 1}`)
  })

  it('uses the PDF viewer configured in OpenList when there is one', async () => {
    const iframePreviews = JSON.stringify({
      'doc,docx': { Microsoft: 'https://view.officeapps.live.com/op/view.aspx?src=$e_url' },
      pdf: { 'PDF.js': 'https://res.oplist.org/pdf.js/web/viewer.html?file=$e_url' },
    })
    mockOpenList({ '/': [file('a.pdf')] }, {}, { settings: { iframe_previews: iframePreviews } })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await openPreview(wrapper, 'a.pdf')
    expect(dialogOf(wrapper).find('iframe.fl-preview-frame').attributes('src')).toBe(
      `https://res.oplist.org/pdf.js/web/viewer.html?file=${encodeURIComponent(`${BASE}/p/a.pdf`)}`,
    )
  })

  it('falls back to the browser PDF reader through a Blob when no viewer is configured', async () => {
    mockOpenList({ '/': [file('a.pdf')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await openPreview(wrapper, 'a.pdf')
    await vi.waitFor(() => expect(dialogOf(wrapper).find('iframe.fl-preview-frame').exists()).toBe(true))
    expect(dialogOf(wrapper).find('iframe.fl-preview-frame').attributes('src')).toBe('blob:zip')
  })

  it('shows info and a download button when the preview fails', async () => {
    mockOpenList({ '/': [file('broken.txt')] }, {}, { files: { '/broken.txt': { status: 404 } } })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await openPreview(wrapper, 'broken.txt')
    await vi.waitFor(() => expect(dialogOf(wrapper).find('.fl-preview-info').exists()).toBe(true))
    expect(dialogOf(wrapper).find('.fl-preview-message').text()).toContain('无法在页面内预览')

    await dialogOf(wrapper).find('.fl-preview-info .fl-btn-primary').trigger('click')
    await flushPromises()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })

  it('steps through previewable files with the buttons and arrow keys, then closes', async () => {
    mockOpenList({ '/': [file('a.png'), file('b.docx'), file('c.txt'), file('d.mp4')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await openPreview(wrapper, 'a.png')
    const dialog = dialogOf(wrapper)
    expect(dialog.find('.fl-preview-count').text()).toBe('1 / 3')

    await dialog.find('[aria-label="下一个"]').trigger('click')
    await flushPromises()
    expect(dialog.find('.fl-preview-name').text()).toBe('c.txt')

    await dialog.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(dialog.find('.fl-preview-name').text()).toBe('d.mp4')
    expect(dialog.find('video.fl-preview-video').attributes('src')).toBe(`${BASE}/p/d.mp4`)

    await dialog.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(dialog.find('.fl-preview-name').text()).toBe('a.png')

    await dialog.find('[aria-label="关闭"]').trigger('click')
    await flushPromises()
    expect(dialog.attributes('open')).toBeUndefined()
    expect(dialog.find('.fl-preview-panel').exists()).toBe(false)
  })

  it('shows a demo message in demo mode', async () => {
    const wrapper = mount(FileList, { props: {}, attachTo: document.body })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.findAll('.fl-row:not(.fl-head)').length).toBeGreaterThan(0))

    await row(wrapper, 'assignments').find('.fl-arrow').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('作业提交说明.pdf'))
    await openPreview(wrapper, '作业提交说明.pdf')

    const dialog = dialogOf(wrapper)
    expect(dialog.find('.fl-preview-message').text()).toContain('演示模式')
    expect(dialog.find('.fl-preview-download').exists()).toBe(false)
  })

  it('previews and downloads the demo sample files for real', async () => {
    const wrapper = mount(FileList, { props: {}, attachTo: document.body })
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.findAll('.fl-row:not(.fl-head)').length).toBeGreaterThan(0))

    await row(wrapper, '示例文件').find('.fl-arrow').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('课程表.txt'))
    await openPreview(wrapper, '课程海报.svg')
    const dialog = dialogOf(wrapper)
    await vi.waitFor(() => expect(dialog.find('img').attributes('src')).toMatch(/^blob:/))
    expect(dialog.text()).not.toContain('演示模式')
    expect(dialog.find('.fl-preview-download').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('FileList folder passwords (same row)', () => {
  const unlock = async (wrapper: VueWrapper, name: string, password: string, remember = false) => {
    const target = row(wrapper, name)
    if (remember) await target.find('.fl-unlock-remember').trigger('click')
    await target.find('.fl-unlock-row input').setValue(password)
    await target.find('.fl-unlock-row input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
  }

  it('keeps the row count and shows the error in place for a wrong password', async () => {
    mockOpenList({ '/': [dir('Locked'), dir('Open')], '/Locked': [file('a.txt')], '/Open': [] }, { '/Locked': 'right' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await row(wrapper, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()
    const rows = () => wrapper.findAll('.fl-row:not(.fl-head)').length
    expect(rows()).toBe(2)
    expect(wrapper.find('.fl-toast').exists()).toBe(false)

    await unlock(wrapper, 'Locked', 'nope')
    expect(rows()).toBe(2)
    const locked = row(wrapper, 'Locked')
    expect(locked.classes()).toContain('fl-row-error')
    expect(locked.find('.fl-unlock-message').text()).toBe('密码不正确或无权访问')
    expect((locked.find('.fl-unlock-row input').element as HTMLInputElement).value).toBe('')

    await unlock(wrapper, 'Locked', 'right')
    expect(row(wrapper, 'a.txt').exists()).toBe(true)
  })

  it('cancels with Esc and asks again on the next click without a request', async () => {
    const { calls } = mockOpenList({ '/': [dir('Locked')], '/Locked': [] }, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()

    await row(wrapper, 'Locked').find('.fl-unlock-row').trigger('keydown', { key: 'Escape' })
    expect(row(wrapper, 'Locked').classes()).not.toContain('fl-row-prompting')
    const listed = calls.filter((call) => call.path === '/api/fs/list').length

    await row(wrapper, 'Locked').find('.fl-lock').trigger('click')
    expect(row(wrapper, 'Locked').classes()).toContain('fl-row-prompting')
    expect(calls.filter((call) => call.path === '/api/fs/list')).toHaveLength(listed)
  })

  it('remembers a password in this tab only when asked, and can forget it', async () => {
    const tree = { '/': [dir('Locked')], '/Locked': [file('a.txt')] }
    mockOpenList(tree, { '/Locked': 'pw' })
    const first = mountList({ path: '/' })
    await flushPromises()
    await row(first, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()
    await unlock(first, 'Locked', 'pw', true)
    expect(row(first, 'Locked').find('.fl-remembered').exists()).toBe(true)
    first.unmount()

    const { calls } = mockOpenList(tree, { '/Locked': 'pw' })
    const second = mountList({ path: '/' })
    await flushPromises()
    await row(second, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()
    expect(row(second, 'a.txt').exists()).toBe(true)
    expect(calls.filter((call) => call.path === '/api/fs/list').at(-1)?.body?.password).toBe('pw')

    await row(second, 'Locked').find('.fl-remembered').trigger('click')
    expect(second.findAll('.fl-row:not(.fl-head)')).toHaveLength(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('does not remember when the key toggle is off or the site disables it', async () => {
    const tree = { '/': [dir('Locked')], '/Locked': [] }
    mockOpenList(tree, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()
    await unlock(wrapper, 'Locked', 'pw')
    expect(sessionStorage.length).toBe(0)
    wrapper.unmount()

    mockOpenList(tree, { '/Locked': 'pw' })
    const off = mountList({ path: '/', rememberPassword: false })
    await flushPromises()
    await row(off, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()
    expect(row(off, 'Locked').find('.fl-unlock-remember').exists()).toBe(false)
  })

  it('drops a remembered password that no longer works and says so', async () => {
    sessionStorage.setItem(
      'vitepress-plugin-filelist:passwords:https://pan.example.com',
      JSON.stringify({ '/Locked': 'old' }),
    )
    mockOpenList({ '/': [dir('Locked')], '/Locked': [] }, { '/Locked': 'new' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()

    expect(row(wrapper, 'Locked').find('.fl-unlock-message').text()).toBe('已保存的密码已失效，请重新输入')
    expect(sessionStorage.length).toBe(0)
  })

  it('asks for the listed folder password in place of the loading row', async () => {
    mockOpenList({ '/vault': [file('v.txt')] }, { '/vault': 'pw' })
    const wrapper = mountList({ path: '/vault' })
    await flushPromises()

    const form = wrapper.find('.fl-unlock-root')
    expect(form.exists()).toBe(true)
    await form.find('input').setValue('pw')
    await form.trigger('submit')
    await flushPromises()

    expect(wrapper.find('.fl-unlock-root').exists()).toBe(false)
    expect(row(wrapper, 'v.txt').exists()).toBe(true)
  })

  it('stops a folder check at a locked sub-folder and asks for its password', async () => {
    mockOpenList(
      { '/': [dir('A')], '/A': [file('a1.txt'), dir('Locked')], '/A/Locked': [file('x.txt')] },
      { '/A/Locked': 'pw' },
    )
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    await check(wrapper, 'A')
    expect(wrapper.find('.fl-selection').exists()).toBe(false)
    expect(row(wrapper, 'Locked').classes()).toContain('fl-row-prompting')

    await unlock(wrapper, 'Locked', 'pw')
    await check(wrapper, 'A')
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 2 项')
  })
})

describe('FileList refresh', () => {
  it('keeps old rows dimmed while refreshing, then keeps open folders and surviving selection', async () => {
    const tree: MockTree = { '/': [dir('A'), file('b.txt'), file('gone.txt')], '/A': [file('a1.txt')] }
    mockOpenList(tree)
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'A').find('.fl-arrow').trigger('click')
    await flushPromises()
    await check(wrapper, 'b.txt')
    await check(wrapper, 'gone.txt')

    tree['/'] = [dir('A'), file('b.txt'), file('new.txt')]
    tree['/A'] = [file('a1.txt'), file('a2.txt')]
    await wrapper.find('.fl-refresh').trigger('click')
    expect(wrapper.find('.fl-root').classes()).toContain('fl-refreshing')
    expect(wrapper.find('.fl-progress').exists()).toBe(true)
    expect(wrapper.find('.fl-status').exists()).toBe(false)
    expect(row(wrapper, 'gone.txt').exists()).toBe(true)

    await flushPromises()
    expect(wrapper.find('.fl-root').classes()).not.toContain('fl-refreshing')
    expect(row(wrapper, 'a2.txt').exists()).toBe(true)
    expect(row(wrapper, 'new.txt').exists()).toBe(true)
    expect(wrapper.findAll('.fl-row-selected').map((item) => item.find('.fl-name').text())).toEqual(['b.txt'])
  })

  it('keeps the old rows and toasts when a refresh fails', async () => {
    mockOpenList({ '/': [file('b.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    await wrapper.find('.fl-refresh').trigger('click')
    await flushPromises()

    expect(row(wrapper, 'b.txt').exists()).toBe(true)
    expect(wrapper.find('.fl-toast').text()).toContain('刷新失败')
    expect(wrapper.find('.fl-toast').text()).toContain('ALLOW_URLS')
  })

  it('keeps typed passwords across a refresh', async () => {
    const { calls } = mockOpenList({ '/': [dir('Locked')], '/Locked': [file('a.txt')] }, { '/Locked': 'pw' })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'Locked').find('.fl-arrow').trigger('click')
    await flushPromises()
    await row(wrapper, 'Locked').find('.fl-unlock-row input').setValue('pw')
    await row(wrapper, 'Locked').find('.fl-unlock-row input').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    await wrapper.find('.fl-refresh').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'a.txt').exists()).toBe(true)
    expect(calls.filter((call) => call.path === '/api/fs/list').at(-1)?.body?.password).toBe('pw')
  })
})

describe('FileList small fixes', () => {
  it('shows 0 B for an empty total', async () => {
    mockOpenList({ '/': [dir('A')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    expect(wrapper.find('.fl-foot').text()).toContain('共 0 B')
  })

  it('sends GET requests without a JSON content type', async () => {
    const { calls } = mockOpenList({ '/': [] })
    mountList({ path: '/' })
    await flushPromises()
    const settings = calls.find((call) => call.path === '/api/public/settings')
    expect(settings?.headers?.['Content-Type']).toBeUndefined()
    const list = calls.find((call) => call.path === '/api/fs/list')
    expect(list?.headers?.['Content-Type']).toBe('application/json')
  })
})

describe('FileList audit regressions', () => {
  it('keeps a typed (not remembered) source-root password across a refresh', async () => {
    const { calls } = mockOpenList({ '/s': [file('a.txt')] }, { '/s': 'pw' })
    const wrapper = mountList({ sources: [{ path: '/s' }] })
    await flushPromises()
    await row(wrapper, 's').find('.fl-lock').trigger('click')
    await row(wrapper, 's').find('.fl-unlock-row input').setValue('pw')
    await row(wrapper, 's').find('.fl-unlock-row input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(row(wrapper, 'a.txt').exists()).toBe(true)

    await wrapper.find('.fl-refresh').trigger('click')
    await flushPromises()
    expect(row(wrapper, 's').classes()).not.toContain('fl-row-locked')
    expect(row(wrapper, 'a.txt').exists()).toBe(true)
    expect(calls.filter((call) => call.path === '/api/fs/get' && call.body?.path === '/s').at(-1)?.body?.password).toBe('pw')
    expect(sessionStorage.length).toBe(0)
  })

  it('links the error to the input for paths with spaces, with ids unique per instance', async () => {
    mockOpenList({ '/': [dir('my folder')], '/my folder': [] }, { '/my folder': 'x' })
    // Two lists on one page share one app, as in VitePress.
    const page = mount(
      defineComponent(() => () => [h(FileList, { base: BASE, path: '/' }), h(FileList, { base: BASE, path: '/' })]),
      { attachTo: document.body },
    )
    await flushPromises()
    const [first, second] = page.findAllComponents(FileList)
    for (const wrapper of [first, second]) {
      await row(wrapper, 'my folder').find('.fl-arrow').trigger('click')
      await flushPromises()
      await row(wrapper, 'my folder').find('.fl-unlock-row input').setValue('bad')
      await row(wrapper, 'my folder').find('.fl-unlock-row input').trigger('keydown', { key: 'Enter' })
      await flushPromises()
    }
    const ids = [first, second].map((wrapper) => {
      const input = row(wrapper, 'my folder').find('.fl-unlock-row input').element
      const id = input.getAttribute('aria-describedby') ?? ''
      expect(id).not.toMatch(/\s/)
      expect(document.getElementById(id)?.textContent).toBe('密码不正确或无权访问')
      return id
    })
    expect(new Set(ids).size).toBe(2)
  })

  it('shows the CORS hint for Safari-style network errors on first load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Load failed')
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    expect(wrapper.find('.fl-error').text()).toContain('ALLOW_URLS')
  })

  it('shows 0 B for an empty file', async () => {
    mockOpenList({ '/': [] })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const path = new URL(String(input)).pathname
      const data = path === '/api/fs/list'
        ? { content: [{ name: 'empty.txt', is_dir: false, size: 0, modified: '2026-01-01T00:00:00Z' }] }
        : {}
      return new Response(JSON.stringify({ code: 200, message: 'success', data }))
    }))
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    expect(row(wrapper, 'empty.txt').find('.fl-cell-size').text()).toBe('0 B')
  })

  it('locks a demo source folder until its password is entered', async () => {
    const wrapper = mount(FileList, {
      props: { sources: [{ path: '/加密示例（密码 1234）' }, { path: '/notes' }] },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(row(wrapper, '加密示例（密码 1234）').classes()).toContain('fl-row-locked'))
    expect(row(wrapper, 'notes').classes()).not.toContain('fl-row-locked')
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
})

describe('FileList preview: Markdown and HTML rendering', () => {
  const openText = async (wrapper: VueWrapper, name: string) => {
    await row(wrapper, name).find('.fl-preview-btn').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('dialog.fl-preview')
    await vi.waitFor(() => expect(dialog.find('.fl-preview-text').exists()).toBe(true))
    return dialog
  }

  it('shows Markdown source by default and never renders without a working sanitiser', async () => {
    // happy-dom has no DOMPurify support, so this also proves the safety net:
    // rendering is refused and the source stays. Real rendering runs in e2e.
    const body = '# 标题\n\n<script>window.__pwned = 1</script>'
    mockOpenList({ '/': [file('guide.md')] }, {}, { files: { '/guide.md': { body } } })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    const dialog = await openText(wrapper, 'guide.md')

    expect(dialog.find('.fl-preview-text pre').text()).toContain('# 标题')
    const buttons = dialog.findAll('.fl-preview-view-btn')
    expect(buttons.map((button) => button.text())).toEqual(['源码', '渲染'])
    expect(buttons[0].attributes('aria-pressed')).toBe('true')

    await buttons[1].trigger('click')
    await vi.waitFor(() => expect(dialog.findAll('.fl-preview-view-btn')[0].attributes('aria-pressed')).toBe('true'))
    expect(dialog.find('.fl-md').exists()).toBe(false)
    expect(dialog.find('.fl-preview-text pre').text()).toContain('<script>')
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('renders HTML only inside an empty sandbox and remembers the choice', async () => {
    mockOpenList(
      { '/': [file('page.html'), file('notes.txt')] },
      {},
      { files: { '/page.html': { body: '<h1>Hi</h1><script>alert(1)</script>' } } },
    )
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    let dialog = await openText(wrapper, 'page.html')
    expect(dialog.find('.fl-preview-text pre').text()).toContain('<h1>Hi</h1>')

    await dialog.findAll('.fl-preview-view-btn')[1].trigger('click')
    const frame = dialog.find('iframe.fl-preview-html')
    expect(frame.attributes('sandbox')).toBe('')
    expect(frame.attributes('srcdoc')).toContain('<h1>Hi</h1>')
    expect(dialog.find('.fl-preview-note').text()).toBe('已禁用脚本；网页引用的相对路径资源不会加载')

    // Plain text files get no switch.
    await dialog.find('.fl-preview-close').trigger('click')
    dialog = await openText(wrapper, 'notes.txt')
    expect(dialog.find('.fl-preview-view').exists()).toBe(false)
    await dialog.find('.fl-preview-close').trigger('click')

    // Reopening an HTML file keeps “rendered”.
    dialog = await openText(wrapper, 'page.html')
    expect(dialog.find('iframe.fl-preview-html').exists()).toBe(true)
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
})
