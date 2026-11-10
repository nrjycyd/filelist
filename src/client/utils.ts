export interface SortableNode {
  name: string
  size: number
  is_dir: boolean
  modified: string
}

export type SortKey = 'name' | 'size' | 'modified'

export function joinPath(parent: string, name: string): string {
  return (parent.endsWith('/') ? parent : `${parent}/`) + name
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/**
 * Make one path segment safe as a ZIP entry segment: no separators,
 * no `.` / `..` traversal, no empty names.
 */
export function zipSegment(name: string): string {
  const cleaned = name.replace(/[\\/]/g, '_').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return '_'
  return cleaned
}

/** Join path segments into a ZIP entry name, sanitising each segment. */
export function zipEntryName(segments: string[]): string {
  return segments.map(zipSegment).join('/')
}

/**
 * Return `name`, or `name (2)`, `name (3)`... when it is already in `used`.
 * The suffix goes before the extension of the last segment. Adds the result to `used`.
 */
export function uniqueEntryName(name: string, used: Set<string>): string {
  let candidate = name
  if (used.has(candidate)) {
    const slash = name.lastIndexOf('/')
    const dir = name.slice(0, slash + 1)
    const base = name.slice(slash + 1)
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ''
    let index = 2
    do {
      candidate = `${dir}${stem} (${index})${ext}`
      index += 1
    } while (used.has(candidate))
  }
  used.add(candidate)
  return candidate
}

export function formatSize(size: number): string {
  if (!size || !Number.isFinite(size)) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let index = 0
  let value = size
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  if (index === 0) return `${Math.round(value)} B`
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

export function formatDate(iso: string): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
}

export function extOf(name: string): string {
  const match = name.match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toUpperCase() : ''
}

export function compareNodes(
  a: SortableNode,
  b: SortableNode,
  key: SortKey,
  ascending = true,
): number {
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
  let result = 0
  if (key === 'size') result = a.size - b.size
  else if (key === 'modified') {
    result = new Date(a.modified).getTime() - new Date(b.modified).getTime()
  } else {
    result = a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })
  }
  return ascending ? result : -result
}
