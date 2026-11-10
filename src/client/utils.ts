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

export type FileKind =
  | 'doc'
  | 'sheet'
  | 'slide'
  | 'pdf'
  | 'image'
  | 'media'
  | 'archive'
  | 'code'
  | 'other'

const FILE_KINDS: Record<string, FileKind> = {}
const KIND_EXTS: Record<Exclude<FileKind, 'other'>, string[]> = {
  doc: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages', 'wps'],
  sheet: ['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers', 'et'],
  slide: ['ppt', 'pptx', 'odp', 'key', 'dps'],
  pdf: ['pdf'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic'],
  media: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'mp4', 'webm', 'mov', 'mkv', 'avi'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso'],
  code: ['js', 'ts', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'sh', 'yml', 'yaml', 'xml'],
}
for (const [kind, exts] of Object.entries(KIND_EXTS)) {
  for (const ext of exts) FILE_KINDS[ext] = kind as FileKind
}

/** Rough file family, used to colour the type badge. */
export function fileKind(name: string): FileKind {
  return FILE_KINDS[extOf(name).toLowerCase()] ?? 'other'
}

/** Sum of the `size` of the given entries, ignoring missing or invalid sizes. */
export function totalSize(items: Array<{ size?: number }>): number {
  return items.reduce(
    (sum, item) => sum + (Number.isFinite(item.size) && (item.size ?? 0) > 0 ? (item.size as number) : 0),
    0,
  )
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

/* ---------------- preview ---------------- */

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'none'

const PREVIEW_EXTS: Record<Exclude<PreviewKind, 'none'>, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
  video: ['mp4', 'webm', 'm4v', 'mov', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
  text: [
    'txt', 'md', 'markdown', 'log', 'json', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf',
    'properties', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'css', 'scss', 'less', 'html', 'htm',
    'py', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bat', 'ps1',
    'sql', 'srt', 'vtt', 'ass', 'lrc', 'gitignore', 'env',
  ],
  pdf: ['pdf'],
}

const PREVIEW_KINDS: Record<string, PreviewKind> = {}
for (const [kind, exts] of Object.entries(PREVIEW_EXTS)) {
  for (const ext of exts) PREVIEW_KINDS[ext] = kind as PreviewKind
}

function lowerExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * How a file is shown in the preview dialog. Office documents and anything
 * else the browser cannot render are `none` (info + download).
 */
export function previewKind(name: string): PreviewKind {
  return PREVIEW_KINDS[lowerExt(name)] ?? 'none'
}

export interface IframePreview {
  label: string
  scheme: string
}

/**
 * Viewers from OpenList's public `iframe_previews` setting that match a file,
 * in the order OpenList lists them. Keys are comma-separated extensions or a
 * `/regex/flags` tested against the extension, as in OpenList's frontend.
 */
export function iframePreviewsFor(name: string, setting: string | undefined): IframePreview[] {
  if (!setting) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(setting)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []
  const ext = lowerExt(name)
  const out: IframePreview[] = []
  for (const [key, viewers] of Object.entries(parsed as Record<string, unknown>)) {
    let hit = false
    if (key.startsWith('/')) {
      const end = key.lastIndexOf('/')
      try {
        hit = end > 0 && new RegExp(key.slice(1, end), key.slice(end + 1)).test(ext)
      } catch {
        hit = false
      }
    } else {
      hit = key.split(',').map((item) => item.trim().toLowerCase()).includes(ext)
    }
    if (!hit || !viewers || typeof viewers !== 'object') continue
    for (const [label, scheme] of Object.entries(viewers as Record<string, unknown>)) {
      if (typeof scheme === 'string' && /^https?:\/\//i.test(scheme)) out.push({ label, scheme })
    }
  }
  return out
}

function applyUrlOps(placeholder: string, url: string): string {
  const ops = placeholder.slice(1, placeholder.lastIndexOf('url')).replace(/d$/, '').match(/[eb]/g) ?? []
  let value = url
  for (const op of ops.reverse()) {
    value = op === 'e' ? encodeURIComponent(value) : btoa(String.fromCharCode(...new TextEncoder().encode(value)))
  }
  return value
}

/**
 * Fill an OpenList preview scheme: `$name`, `$url` (raw URL) and `$durl`
 * (signed download URL), each optionally prefixed with `e` (URI-encode) or
 * `b` (base64), e.g. `$e_url`, `$b_url`, `$e_durl`.
 */
export function fillPreviewUrl(
  scheme: string,
  args: { name: string; rawUrl: string; downloadUrl: string },
): string {
  return scheme
    .replace(/\$name/g, args.name)
    .replace(/\$[eb_]*durl/g, (placeholder) => applyUrlOps(placeholder, args.downloadUrl))
    .replace(/\$[eb_]*url/g, (placeholder) => applyUrlOps(placeholder, args.rawUrl))
}
