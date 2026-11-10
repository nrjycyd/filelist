import { describe, expect, it } from 'vitest'
import {
  compareNodes,
  encodePath,
  extOf,
  formatDate,
  fileKind,
  fillPreviewUrl,
  iframePreviewsFor,
  previewKind,
  formatSize,
  joinPath,
  totalSize,
  type SortableNode,
  uniqueEntryName,
  zipEntryName,
  zipSegment,
} from '../utils'

const file = (name: string, size = 0): SortableNode => ({
  name,
  size,
  is_dir: false,
  modified: '2026-01-01T00:00:00Z',
})

const dir = (name: string): SortableNode => ({
  name,
  size: 0,
  is_dir: true,
  modified: '2026-01-01T00:00:00Z',
})

describe('formatSize', () => {
  it('handles empty and invalid values', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(-1)).toBe('-')
    expect(formatSize(Number.NaN)).toBe('-')
  })

  it('keeps bytes as integers', () => {
    expect(formatSize(512)).toBe('512 B')
  })

  it('formats kilobytes and megabytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatSize(2.2 * 1024)).toBe('2.2 KB')
  })

  it('rounds values of 100 and above', () => {
    expect(formatSize(150 * 1024)).toBe('150 KB')
  })
})

describe('formatDate', () => {
  it('returns a dash for empty input', () => {
    expect(formatDate('')).toBe('-')
  })

  it('formats a valid ISO date', () => {
    expect(formatDate('2026-11-09T00:00:00Z')).toBe('2026/11/09')
  })

  it('falls back to the first 10 characters for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('extOf', () => {
  it('returns the upper-cased extension', () => {
    expect(extOf('试卷.PDF')).toBe('PDF')
  })

  it('returns an empty string without an extension', () => {
    expect(extOf('README')).toBe('')
  })
})

describe('joinPath / encodePath', () => {
  it('joins with a single slash', () => {
    expect(joinPath('/课程', '资料')).toBe('/课程/资料')
    expect(joinPath('/课程/', '资料')).toBe('/课程/资料')
  })

  it('encodes each path segment but keeps slashes', () => {
    expect(encodePath('/课程 资料/a.pdf')).toBe('/%E8%AF%BE%E7%A8%8B%20%E8%B5%84%E6%96%99/a.pdf')
  })
})

describe('compareNodes', () => {
  it('always puts folders before files', () => {
    expect(compareNodes(dir('z'), file('a'), 'name', true)).toBeLessThan(0)
  })

  it('sorts by name with numeric awareness', () => {
    expect(compareNodes(file('第2章'), file('第10章'), 'name', true)).toBeLessThan(0)
  })

  it('reverses on descending order', () => {
    expect(compareNodes(file('a', 1), file('b', 2), 'size', false)).toBeGreaterThan(0)
  })

  it('sorts by modified date', () => {
    const older = { ...file('a'), modified: '2025-01-01T00:00:00Z' }
    const newer = { ...file('b'), modified: '2026-01-01T00:00:00Z' }
    expect(compareNodes(older, newer, 'modified', true)).toBeLessThan(0)
  })
})

describe('zip entry names', () => {
  it('joins segments and neutralises separators and traversal', () => {
    expect(zipEntryName(['课程', '第1章.pdf'])).toBe('课程/第1章.pdf')
    expect(zipEntryName(['a/b', 'c\\d.txt'])).toBe('a_b/c_d.txt')
    expect(zipEntryName(['..', '.', ' ', 'ok.txt'])).toBe('_/_/_/ok.txt')
    expect(zipSegment('  name  ')).toBe('name')
  })

  it('suffixes duplicates before the extension', () => {
    const used = new Set<string>()
    expect(uniqueEntryName('资料/a.txt', used)).toBe('资料/a.txt')
    expect(uniqueEntryName('资料/a.txt', used)).toBe('资料/a (2).txt')
    expect(uniqueEntryName('资料/a.txt', used)).toBe('资料/a (3).txt')
    expect(uniqueEntryName('README', used)).toBe('README')
    expect(uniqueEntryName('README', used)).toBe('README (2)')
    expect(uniqueEntryName('.env', used)).toBe('.env')
    expect(uniqueEntryName('.env', used)).toBe('.env (2)')
  })
})

describe('fileKind', () => {
  it('groups extensions into families, case-insensitively', () => {
    expect(fileKind('a.DOCX')).toBe('doc')
    expect(fileKind('a.ods')).toBe('sheet')
    expect(fileKind('a.key')).toBe('slide')
    expect(fileKind('a.pdf')).toBe('pdf')
    expect(fileKind('a.webp')).toBe('image')
    expect(fileKind('a.mp4')).toBe('media')
    expect(fileKind('a.7z')).toBe('archive')
    expect(fileKind('a.ts')).toBe('code')
    expect(fileKind('a.bin')).toBe('other')
    expect(fileKind('README')).toBe('other')
  })
})

describe('totalSize', () => {
  it('sums valid sizes only', () => {
    expect(totalSize([{ size: 10 }, { size: 5 }])).toBe(15)
    expect(totalSize([{ size: Number.NaN }, { size: -1 }, {}, { size: 3 }])).toBe(3)
    expect(totalSize([])).toBe(0)
  })
})

describe('previewKind', () => {
  it('maps extensions to what the dialog can render', () => {
    expect(previewKind('a.PNG')).toBe('image')
    expect(previewKind('a.mp4')).toBe('video')
    expect(previewKind('a.flac')).toBe('audio')
    expect(previewKind('README.md')).toBe('text')
    expect(previewKind('a.pdf')).toBe('pdf')
    expect(previewKind('a.docx')).toBe('none')
    expect(previewKind('a.mkv')).toBe('none')
    expect(previewKind('Makefile')).toBe('none')
  })
})

describe('iframePreviewsFor', () => {
  const setting = JSON.stringify({
    'doc,docx': { Microsoft: 'https://office/view?src=$e_url', Google: 'https://google/gview?url=$e_url' },
    '/^pdf$/i': { 'PDF.js': 'https://pdfjs/viewer.html?file=$e_url' },
    epub: { Local: 'javascript:alert(1)' },
  })

  it('matches extension lists and regex keys in order', () => {
    expect(iframePreviewsFor('a.DOCX', setting).map((item) => item.label)).toEqual(['Microsoft', 'Google'])
    expect(iframePreviewsFor('a.pdf', setting)).toEqual([{ label: 'PDF.js', scheme: 'https://pdfjs/viewer.html?file=$e_url' }])
    expect(iframePreviewsFor('a.txt', setting)).toEqual([])
  })

  it('ignores non-http viewers and invalid settings', () => {
    expect(iframePreviewsFor('a.epub', setting)).toEqual([])
    expect(iframePreviewsFor('a.pdf', 'not json')).toEqual([])
    expect(iframePreviewsFor('a.pdf', undefined)).toEqual([])
  })
})

describe('fillPreviewUrl', () => {
  const args = { name: '说明.pdf', rawUrl: 'https://pan/p/说明.pdf?sign=a', downloadUrl: 'https://pan/d/x.pdf?sign=b' }

  it('fills OpenList placeholders', () => {
    expect(fillPreviewUrl('v?file=$e_url', args)).toBe(`v?file=${encodeURIComponent(args.rawUrl)}`)
    expect(fillPreviewUrl('v?file=$url', args)).toBe(`v?file=${args.rawUrl}`)
    expect(fillPreviewUrl('v?d=$e_durl&n=$name', args)).toBe(`v?d=${encodeURIComponent(args.downloadUrl)}&n=${args.name}`)
    expect(fillPreviewUrl('v?b=$b_url', { ...args, rawUrl: 'https://pan/p/a.pdf' })).toBe(`v?b=${btoa('https://pan/p/a.pdf')}`)
  })
})

describe('compareNodes locale', () => {
  const named = (name: string) => ({ name, size: 0, is_dir: false, modified: '' })
  const order = (names: string[], locale?: string) =>
    [...names].map(named).sort((a, b) => compareNodes(a, b, 'name', true, locale)).map((item) => item.name)

  it('sorts Chinese names by pinyin for zh-CN', () => {
    expect(order(['张三', '李四', '王五', '安'], 'zh-CN')).toEqual(['安', '李四', '王五', '张三'])
  })

  it('sorts English names alphabetically, ignoring case, for en-US', () => {
    expect(order(['banana', 'Apple', 'cherry', 'apple2'], 'en-US')).toEqual(['Apple', 'apple2', 'banana', 'cherry'])
  })

  it('keeps numbers in natural order in both locales', () => {
    expect(order(['file10', 'file2', 'file1'], 'en-US')).toEqual(['file1', 'file2', 'file10'])
    expect(order(['第10章', '第2章', '第1章'], 'zh-CN')).toEqual(['第1章', '第2章', '第10章'])
  })

  it('defaults to the Chinese order', () => {
    expect(order(['张三', '安'])).toEqual(['安', '张三'])
  })
})
