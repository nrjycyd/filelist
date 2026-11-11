import { describe, expect, it } from 'vitest'
import { createDemoApi, isDemoFile } from '../demo'

describe('demo data', () => {
  const api = createDemoApi(0)

  it('has a folder of real sample files', async () => {
    const names = (await api.list('/示例文件', '')).map((item) => item.name)
    expect(names).toEqual(['使用说明.md', '网页示例.html', '课程海报.svg', '讲义.pdf', '课程表.txt'])
    for (const item of await api.list('/示例文件', '')) expect(item.size).toBeGreaterThan(0)
  })

  it('gives sample files a blob: URL and other files none', async () => {
    const url = await api.fileUrl({ path: '/示例文件/课程表.txt' }, '')
    expect(url).toMatch(/^blob:/)
    expect(api.isAttachmentUrl(url)).toBe(true)
    expect(await (await fetch(url)).text()).toContain('课程表')
    // Made once, then reused.
    expect(await api.fileUrl({ path: '/示例文件/课程表.txt' }, '')).toBe(url)
    expect(await api.fileUrl({ path: '/exams/2024 期中试题.pdf' }, '')).toBe('')
    expect(isDemoFile('/示例文件/讲义.pdf')).toBe(true)
    expect(isDemoFile('/示例文件')).toBe(false)
    expect(isDemoFile('/exams/2024 期中试题.pdf')).toBe(false)
  })

  it('has a long folder for “show more”', async () => {
    expect(await api.list('/照片（260 张）', '')).toHaveLength(260)
  })
})

describe('English demo data', () => {
  const api = createDemoApi(0, 'en-US')

  it('uses English names, with the same folders, samples and password', async () => {
    const top = (await api.list('/', '')).map((item) => item.name)
    expect(top).toContain('Sample files')
    expect(top).toContain('Photos (260)')
    expect(top.join(' ')).not.toMatch(/\p{Script=Han}/u)
    expect((await api.list('/Sample files', '')).map((item) => item.name)).toEqual(['Read me.md', 'Web page.html', 'Course poster.svg', 'Lecture notes.pdf', 'Timetable.txt'])
    await expect(api.list('/Locked (password 1234)', '')).rejects.toThrow(/password/)
    expect(await api.list('/Locked (password 1234)', '1234')).toHaveLength(2)
  })

  it('serves the English samples for real', async () => {
    const url = await api.fileUrl({ path: '/Sample files/Timetable.txt' }, '')
    expect(await (await fetch(url)).text()).toContain('Timetable')
    expect(isDemoFile('/Sample files/Read me.md')).toBe(true)
    expect(isDemoFile('/exams/2024 midterm.pdf')).toBe(false)
  })
})
