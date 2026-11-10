// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileList from '../FileList.vue'
import type { FileListProps } from '../types'

const zipMock = vi.hoisted(() => ({ entries: null as Record<string, Uint8Array> | null }))

vi.mock('fflate', () => ({
  zip: (
    entries: Record<string, Uint8Array>,
    callback: (error: Error | null, data: Uint8Array) => void,
  ) => {
    zipMock.entries = entries
    callback(null, new Uint8Array([0x50, 0x4b]))
  },
}))

const BASE = 'https://pan.example.com'

interface MockItem {
  name: string
  is_dir: boolean
}

type MockTree = Record<string, MockItem[]>

interface Call {
  path: string
  body?: { path?: string; password?: string }
}

const dir = (name: string): MockItem => ({ name, is_dir: true })
const file = (name: string): MockItem => ({ name, is_dir: false })

/** Minimal OpenList server: `/api/fs/list`, `/api/fs/get`, `/p/...` and folder passwords. */
function mockOpenList(tree: MockTree, passwords: Record<string, string> = {}) {
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
    calls.push({ path: pathname, body })

    if (pathname === '/api/public/settings') return json({ site_title: 'Pan' })

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

    if (pathname.startsWith('/p/')) return new Response(new TextEncoder().encode(pathname))
    return new Response('not found', { status: 404 })
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

function mountList(props: FileListProps) {
  return mount(FileList, { props: { base: BASE, ...props }, attachTo: document.body })
}

function row(wrapper: VueWrapper, name: string) {
  const match = wrapper
    .findAll('.fl-row:not(.fl-head)')
    .find((item) => item.find('.fl-name').text().endsWith(name))
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
    await check(wrapper, '说明')
    const entries = await zipSelected(wrapper)

    expect(Object.keys(entries).sort()).toEqual(['文档/readme.txt', '说明.pdf'])
  })
})

describe('FileList folder selection', () => {
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
  it('asks for a password when a source folder needs one and uses it afterwards', async () => {
    const { calls } = mockOpenList({ '/secret': [file('s.txt')] }, { '/secret': 'pw' })
    const wrapper = mountList({ sources: [{ path: '/secret' }] })
    await flushPromises()
    expect(wrapper.find('.fl-password').exists()).toBe(false)

    await row(wrapper, 'secret').find('.fl-arrow').trigger('click')
    await flushPromises()
    expect(wrapper.find('.fl-password').exists()).toBe(true)

    await wrapper.find('.fl-password input').setValue('pw')
    await wrapper.find('.fl-password button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.fl-password').exists()).toBe(false)

    await row(wrapper, 'secret').find('.fl-arrow').trigger('click')
    await flushPromises()
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

  it('sorts from the compact sort select', async () => {
    mockOpenList({ '/': [file('b.txt'), file('a.txt'), file('c.txt')] })
    const wrapper = mountList({ path: '/' })
    await flushPromises()

    const names = () => wrapper.findAll('.fl-row:not(.fl-head) .fl-name').map((item) => item.text())
    expect(names()).toEqual(['a.txt', 'b.txt', 'c.txt'])

    await wrapper.find('.fl-sort-select select').setValue('name:desc')
    expect(names()).toEqual(['c.txt', 'b.txt', 'a.txt'])
    expect(wrapper.find('.fl-head .fl-cell-name .fl-sort').text()).toBe('▼')
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
