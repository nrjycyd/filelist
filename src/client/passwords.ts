/**
 * Folder passwords remembered for the current browser tab.
 *
 * Stored in `sessionStorage`, so they live only in this tab and are gone when
 * it closes. Keyed by OpenList base URL, then by folder path; a remembered
 * folder also covers its sub-folders. Every access is guarded: private mode
 * or blocked storage simply means nothing is remembered.
 */

const PREFIX = 'vitepress-plugin-filelist:passwords:'

type PasswordMap = Record<string, string>

function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function read(base: string): PasswordMap {
  try {
    const raw = store()?.getItem(PREFIX + base)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as PasswordMap) : {}
  } catch {
    return {}
  }
}

function write(base: string, map: PasswordMap): void {
  try {
    const target = store()
    if (!target) return
    if (Object.keys(map).length) target.setItem(PREFIX + base, JSON.stringify(map))
    else target.removeItem(PREFIX + base)
  } catch {
    // Storage full or blocked: not remembering is fine.
  }
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed || '/'
}

/** Whether `path` is `folder` itself or inside it. */
export function isWithin(path: string, folder: string): boolean {
  const p = normalise(path)
  const f = normalise(folder)
  return f === '/' || p === f || p.startsWith(`${f}/`)
}

/** The closest remembered folder at or above `path`, if any. */
export function findRememberedPassword(
  base: string,
  path: string,
): { path: string; password: string } | null {
  let best: { path: string; password: string } | null = null
  for (const [folder, password] of Object.entries(read(base))) {
    if (typeof password !== 'string' || !isWithin(path, folder)) continue
    if (!best || folder.length > best.path.length) best = { path: folder, password }
  }
  return best
}

export function rememberFolderPassword(base: string, path: string, password: string): void {
  write(base, { ...read(base), [normalise(path)]: password })
}

export function forgetFolderPassword(base: string, path: string): void {
  const map = read(base)
  delete map[normalise(path)]
  write(base, map)
}

/** Folders with a remembered password, for showing the "remembered" tag. */
export function rememberedFolders(base: string): string[] {
  return Object.keys(read(base))
}
