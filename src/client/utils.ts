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

/** Whether `path` is `folder` itself or inside it (segment-wise, trailing slashes ignored). */
export function isWithin(path: string, folder: string): boolean {
  const p = path.replace(/\/+$/, '') || '/'
  const f = folder.replace(/\/+$/, '') || '/'
  return f === '/' || p === f || p.startsWith(`${f}/`)
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

/** Human-readable size. `0` reads `0 B`; missing, negative or invalid sizes read `-`. */
export function formatSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '-'
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

/** Lower-case extension (letters and digits only), or `''`. */
function extension(name: string): string {
  const match = name.match(/\.([a-z0-9]+)$/i)
  return match ? match[1].toLowerCase() : ''
}

/** Upper-case extension for the type badge, e.g. `PDF`. */
export function extOf(name: string): string {
  return extension(name).toUpperCase()
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

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'none'

/**
 * One table for every known extension: the badge family (`FileKind`) and how
 * the preview dialog shows it (`PreviewKind`; Office and the like are `none`).
 */
const EXTENSIONS: Array<[FileKind, PreviewKind, string]> = [
  ['doc', 'text', 'txt md markdown'],
  ['doc', 'none', 'doc docx odt rtf pages wps'],
  ['sheet', 'text', 'csv tsv'],
  ['sheet', 'none', 'xls xlsx ods numbers et'],
  ['slide', 'none', 'ppt pptx odp key dps'],
  ['pdf', 'pdf', 'pdf'],
  ['image', 'image', 'png jpg jpeg gif webp svg bmp ico avif'],
  ['image', 'none', 'heic'],
  ['media', 'video', 'mp4 webm m4v mov ogv'],
  ['media', 'audio', 'mp3 wav ogg oga m4a aac flac opus'],
  ['media', 'none', 'mkv avi'],
  ['archive', 'none', 'zip rar 7z tar gz tgz bz2 xz iso'],
  [
    'code',
    'text',
    'js mjs cjs ts tsx jsx vue json html htm css scss less py java kt c h cpp hpp cs go rs rb php sh bat ps1 sql yml yaml xml toml ini conf properties',
  ],
  ['other', 'text', 'log srt vtt ass lrc gitignore env'],
]

const BY_EXTENSION = new Map<string, { kind: FileKind; preview: PreviewKind }>()
for (const [kind, preview, list] of EXTENSIONS) {
  for (const ext of list.split(' ')) BY_EXTENSION.set(ext, { kind, preview })
}

/** Rough file family, used to colour the type badge. */
export function fileKind(name: string): FileKind {
  return BY_EXTENSION.get(extension(name))?.kind ?? 'other'
}

/**
 * How a file is shown in the preview dialog. Office documents and anything
 * else the browser cannot render are `none` (info + download).
 */
export function previewKind(name: string): PreviewKind {
  return BY_EXTENSION.get(extension(name))?.preview ?? 'none'
}

/** Sum of the `size` of the given entries, ignoring missing or invalid sizes. */
export function totalSize(items: Array<{ size?: number }>): number {
  return items.reduce(
    (sum, item) => sum + (Number.isFinite(item.size) && (item.size ?? 0) > 0 ? (item.size as number) : 0),
    0,
  )
}

const collators = new Map<string, Intl.Collator>()

/**
 * Name order for a UI locale: pinyin for Chinese, alphabetical for English,
 * with numbers in natural order (“2” before “10”) either way.
 */
function collatorFor(locale: string): Intl.Collator {
  const tag = locale.toLowerCase().startsWith('zh') ? 'zh-Hans-CN' : 'en'
  let collator = collators.get(tag)
  if (!collator) {
    collator = new Intl.Collator(tag, { numeric: true, sensitivity: 'base' })
    collators.set(tag, collator)
  }
  return collator
}

export function compareNodes(
  a: SortableNode,
  b: SortableNode,
  key: SortKey,
  ascending = true,
  locale = 'zh-CN',
): number {
  if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
  let result = 0
  if (key === 'size') result = a.size - b.size
  else if (key === 'modified') {
    result = new Date(a.modified).getTime() - new Date(b.modified).getTime()
  } else {
    // Names equal for the collator (e.g. only case differs) still get a stable order.
    result = collatorFor(locale).compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  }
  return ascending ? result : -result
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
  const ext = extension(name)
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
