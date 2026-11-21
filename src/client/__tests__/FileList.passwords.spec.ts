// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { check, dir, file, mockOpenList, mountList, row, setupFileListHooks, zipSelected } from './fileListHarness'

setupFileListHooks()

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
