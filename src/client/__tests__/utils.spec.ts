import { describe, expect, it } from 'vitest'
import {
  compareNodes,
  encodePath,
  extOf,
  formatDate,
  formatSize,
  joinPath,
  type SortableNode,
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
    expect(formatSize(0)).toBe('-')
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
