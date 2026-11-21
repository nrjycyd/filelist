// @vitest-environment happy-dom
import type { MockTree } from './fileListHarness'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import FileList from '../FileList.vue'
import { BASE, check, dir, file, mockOpenList, mountList, row, setupFileListHooks } from './fileListHarness'

setupFileListHooks()

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

  it('uses a sub-folder remembered password even when the parent had its own remembered password', async () => {
    const tree = { '/': [dir('parent')], '/parent': [dir('child')], '/parent/child': [file('deep.txt')] }
    mockOpenList(tree, { '/parent/child': 'p2', '/parent': 'p1' })
    sessionStorage.setItem(
      `vitepress-plugin-filelist:passwords:${BASE}`,
      JSON.stringify({ '/parent': 'p1', '/parent/child': 'p2' }),
    )
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'parent').find('.fl-arrow').trigger('click')
    await flushPromises()
    await row(wrapper, 'child').find('.fl-arrow').trigger('click')
    await flushPromises()
    expect(row(wrapper, 'deep.txt').exists()).toBe(true)
  })

  it('excludes locked file source roots from select-all and footer counts', async () => {
    mockOpenList(
      { '/Locked': [file('secret.pdf')], '/Public': [file('open.txt')] },
      { '/Locked': 'pw' },
    )
    const wrapper = mountList({
      sources: [{ path: '/Locked/secret.pdf' }, { path: '/Public/open.txt' }],
    })
    await flushPromises()
    expect(row(wrapper, 'secret.pdf').classes()).toContain('fl-row-locked')
    expect(wrapper.find('.fl-foot').text()).toContain('1 个已加载文件')
    await wrapper.find('.fl-head .fl-cell-check input').trigger('change')
    await flushPromises()
    expect(wrapper.find('.fl-selection-count').text()).toBe('已选 1 项')
    expect((row(wrapper, 'secret.pdf').find('.fl-cell-check input').element as HTMLInputElement).checked).toBe(false)
    expect((row(wrapper, 'open.txt').find('.fl-cell-check input').element as HTMLInputElement).checked).toBe(true)
  })

  it('reloads when path changes dynamically and ignores superseded root loads', async () => {
    let finishFirst!: (res: Response) => void
    let listCall = 0
    vi.stubGlobal('fetch', vi.fn((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/api/public/settings') {
        return Promise.resolve(new Response(JSON.stringify({ code: 200, data: {} })))
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      listCall += 1
      if (listCall === 1) {
        return new Promise<Response>((resolve) => {
          finishFirst = resolve
        })
      }
      const items = body.path === '/second' ? [file('new.txt')] : [file('old.txt')]
      return Promise.resolve(new Response(JSON.stringify({ code: 200, data: { content: items } })))
    }))
    const wrapper = mountList({ path: '/first' })
    await flushPromises()
    await wrapper.setProps({ path: '/second' })
    await flushPromises()
    expect(row(wrapper, 'new.txt').exists()).toBe(true)

    // The slower first load finishes afterwards and must not overwrite `/second`.
    finishFirst(new Response(JSON.stringify({ code: 200, data: { content: [file('old.txt')] } })))
    await flushPromises()
    expect(wrapper.findAll('.fl-name').map((el) => el.text())).toEqual(['new.txt'])
  })

  it('does not hang on loading when rendering an empty Markdown file', async () => {
    mockOpenList({ '/': [file('empty.md')] }, {}, { files: { '/empty.md': { body: '' } } })
    const wrapper = mountList({ path: '/' })
    await flushPromises()
    await row(wrapper, 'empty.md').find('.fl-preview-btn').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('dialog.fl-preview')
    await vi.waitFor(() => expect(dialog.find('.fl-preview-text').exists()).toBe(true))
    await dialog.findAll('.fl-preview-view-btn')[1].trigger('click')
    await flushPromises()
    expect(dialog.find('.fl-preview-status').exists()).toBe(false)
    expect(dialog.find('.fl-md').exists()).toBe(true)
  })
})
