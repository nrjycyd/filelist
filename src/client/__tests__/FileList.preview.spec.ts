// @vitest-environment happy-dom
import type { VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FileList from '../FileList.vue'
import PreviewDialog from '../PreviewDialog.vue'
import { BASE, file, mockOpenList, mountList, row, setupFileListHooks } from './fileListHarness'

setupFileListHooks()

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
    await vi.waitFor(
      () => expect(dialog.findAll('.fl-preview-view-btn')[0].attributes('aria-pressed')).toBe('true'),
      { timeout: 3000 },
    )
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

  it('drops an incomplete trailing UTF-8 sequence instead of showing U+FFFD when truncated', async () => {
    // '中文测试' is 12 UTF-8 bytes (3 bytes per char); cutting at 5 bytes splits '文'.
    const full = new TextEncoder().encode('中文测试')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(full.slice(0, 5), { status: 206 })))
    const wrapper = mount(PreviewDialog, {
      props: {
        open: true,
        file: { name: 'zh.txt', size: full.byteLength, modified: '' },
        t: (key) => key,
        src: 'https://example.com/zh.txt',
        maxTextBytes: 5,
      },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(wrapper.find('.fl-preview-text pre').exists()).toBe(true))
    expect(wrapper.find('.fl-preview-text pre').text()).toBe('中')
    expect(wrapper.find('.fl-preview-text pre').text()).not.toContain('\uFFFD')
    wrapper.unmount()
  })
})
