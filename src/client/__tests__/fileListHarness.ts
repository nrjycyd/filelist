import type { VueWrapper } from '@vue/test-utils'
import type { FileListProps } from '../types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import FileList from '../FileList.vue'

const zipState = vi.hoisted(() => ({ entries: null as Record<string, Uint8Array> | null }))
export const zipMock = zipState

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
        zipState.entries = entries
        controller.enqueue(new Uint8Array([0x50, 0x4b]))
        controller.close()
      },
    }),
}))

export const BASE = 'https://pan.example.com'

export interface MockItem {
  name: string
  is_dir: boolean
}

export type MockTree = Record<string, MockItem[]>

export interface Call {
  path: string
  headers?: Record<string, string>
  body?: { path?: string; password?: string }
}

export const dir = (name: string): MockItem => ({ name, is_dir: true })
export const file = (name: string): MockItem => ({ name, is_dir: false })

/** Minimal OpenList server: `/api/fs/list`, `/api/fs/get`, `/p/...` and folder passwords. */
export interface MockOptions {
  /** Extra public settings, e.g. `iframe_previews`. */
  settings?: Record<string, string>
  /** Override `/p/<path>` responses. */
  files?: Record<string, { status?: number; body?: string }>
}

export function mockOpenList(tree: MockTree, passwords: Record<string, string> = {}, options: MockOptions = {}) {
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

export function mountList(props: FileListProps) {
  return mount(FileList, { props: { base: BASE, ...props }, attachTo: document.body })
}

export function row(wrapper: Pick<VueWrapper, 'findAll'>, name: string) {
  const match = wrapper
    .findAll('.fl-row:not(.fl-head)')
    .find((item) => item.find('.fl-name').exists() && item.find('.fl-name').text().endsWith(name))
  if (!match) throw new Error(`row "${name}" not found`)
  return match
}

export async function check(wrapper: VueWrapper, name: string) {
  await row(wrapper, name).find('.fl-cell-check input').trigger('change')
  await flushPromises()
}

export async function zipSelected(wrapper: VueWrapper): Promise<Record<string, string>> {
  await wrapper.find('.fl-btn-primary').trigger('click')
  await vi.waitFor(() => expect(zipMock.entries).not.toBeNull())
  const decoder = new TextDecoder()
  return Object.fromEntries(
    Object.entries(zipMock.entries ?? {}).map(([key, value]) => [key, decoder.decode(value)]),
  )
}

export function setupFileListHooks() {
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
}
