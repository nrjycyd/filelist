import type { FileListLocale, OpenListEntry } from './types'
import { encodePath, isWithin } from './utils'

/** An entry from `/api/fs/list` or `/api/fs/get` (the latter adds `raw_url`). */
export interface OLItem extends OpenListEntry {
  raw_url?: string
}

interface SiteSettings {
  title: string
  /** OpenList's public `iframe_previews` setting (JSON text). */
  iframePreviews: string
}

/** What the component needs from OpenList; the demo provides the same shape. */
export interface OpenListApi {
  list: (path: string, password: string) => Promise<OLItem[]>
  get: (path: string, password: string) => Promise<OLItem>
  settings: () => Promise<SiteSettings>
  /** Absolute URL to fetch or download a file; `''` when there is none (demo). */
  fileUrl: (file: { path: string; raw_url?: string; sign?: string }, password: string) => Promise<string>
  /** OpenList's signed `/d/` link, used by `$durl` preview schemes. */
  directUrl: (file: { path: string; sign?: string }) => string
  /**
   * Whether a file URL is OpenList's own `/p/` or `/d/` link, which always
   * answers as an attachment (so opening it downloads without leaving the page).
   */
  isAttachmentUrl: (url: string) => boolean
  /** Demo mode only: whether a path is one of the real bundled sample files. */
  isSampleFile?: (path: string) => boolean
  /** Drop cached file URLs, all of them or those under `path`. */
  clearCache: (path?: string) => void
}

export class ApiError extends Error {
  code: number
  seconds?: number

  constructor(message: string, code: number, seconds?: number) {
    super(message)
    this.code = code
    this.seconds = seconds
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * OpenList has no dedicated code for a missing / wrong folder password; its
 * message says "password is incorrect or you have no permission".
 */
export function isPasswordError(error: unknown): boolean {
  return /password|密码/i.test(errorText(error))
}

/** Browser-level fetch failures (Chrome, Firefox, Safari wording), usually CORS. */
export function isNetworkError(error: unknown): boolean {
  return /failed to fetch|networkerror|load failed|network request failed/i.test(errorText(error))
}

/** An API call that has not answered after this long fails (the list offers “retry”). */
const REQUEST_TIMEOUT = 30_000
/**
 * Many storage drivers hand out direct links that expire; reuse a file's link
 * for this long, then ask OpenList again.
 */
export const FILE_URL_TTL = 10 * 60_000
/** Cap cached direct links so long-lived sessions do not grow without bound. */
const FILE_URL_CACHE_MAX = 500

/** Only these may be opened, previewed or zipped; anything else (`javascript:`) is dropped. */
const SAFE_URL = /^(?:https?:|blob:)/i

export function createOpenListApi(
  base: string,
  token: string,
  // Tests only.
  options: { now?: () => number; timeout?: number } = {},
): OpenListApi {
  const root = base.replace(/\/+$/, '')
  const now = options.now ?? Date.now
  const timeout = options.timeout ?? REQUEST_TIMEOUT
  const urls = new Map<string, { url: string; at: number }>()
  const pendingUrls = new Map<string, { id: symbol; promise: Promise<string> }>()

  async function request<T>(apiPath: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    let response: Response
    try {
      response = await fetch(`${root}${apiPath}`, {
        method: body === undefined ? 'GET' : 'POST',
        // JSON content type only with a body: a bare GET then needs no CORS preflight.
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        const seconds = timeout / 1000
        throw new ApiError(`No answer from OpenList after ${seconds} s`, 408, seconds)
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
    const payload = (await response.json().catch(() => null)) as
      | { code?: number; message?: string; data?: T }
      | null
    if (!payload) throw new ApiError(`HTTP ${response.status}`, response.status)
    if (payload.code !== 200) {
      throw new ApiError(payload.message || `HTTP ${response.status}`, payload.code ?? response.status)
    }
    return payload.data as T
  }

  /** An absolute http(s) / blob URL, or `''` for anything else. */
  function absoluteUrl(raw: string): string {
    if (!raw) return ''
    // Absolute links are kept exactly as given (signed links can be picky).
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return SAFE_URL.test(raw) ? raw : ''
    const origin = root || (typeof window !== 'undefined' ? window.location.origin : '')
    try {
      const url = new URL(raw, `${origin}/`).href
      return SAFE_URL.test(url) ? url : ''
    } catch {
      return ''
    }
  }

  const directUrl: OpenListApi['directUrl'] = (file) =>
    `${root}/d${encodePath(file.path)}${file.sign ? `?sign=${encodeURIComponent(file.sign)}` : ''}`

  return {
    async list(path, password) {
      const data = await request<{ content?: OLItem[] }>('/api/fs/list', {
        path,
        password,
        page: 1,
        per_page: 0,
        refresh: false,
      })
      return data?.content ?? []
    },
    get: (path, password) => request<OLItem>('/api/fs/get', { path, password }),
    async settings() {
      try {
        const data = await request<{ site_title?: string; title?: string; iframe_previews?: string }>(
          '/api/public/settings',
        )
        return { title: data?.site_title || data?.title || '', iframePreviews: data?.iframe_previews || '' }
      } catch {
        return { title: '', iframePreviews: '' }
      }
    },
    async fileUrl(file, password) {
      const given = file.raw_url ? absoluteUrl(file.raw_url) : ''
      if (given) return given
      const cached = urls.get(file.path)
      if (cached && now() - cached.at < FILE_URL_TTL) return cached.url
      const inflightKey = `${file.path}\0${password}`
      const inflight = pendingUrls.get(inflightKey)
      if (inflight) return inflight.promise
      const id = Symbol('fileUrl')
      const promise = (async () => {
        let url = ''
        try {
          url = absoluteUrl((await request<{ raw_url?: string }>('/api/fs/get', { path: file.path, password }))?.raw_url ?? '')
        } catch {
          // Fall back to the signed download link below.
        }
        url ||= directUrl(file)
        if (pendingUrls.get(inflightKey)?.id === id) {
          const timestamp = now()
          if (urls.size >= FILE_URL_CACHE_MAX) {
            for (const [key, entry] of urls) {
              if (timestamp - entry.at >= FILE_URL_TTL) urls.delete(key)
            }
            if (urls.size >= FILE_URL_CACHE_MAX) {
              const oldest = urls.keys().next().value
              if (oldest !== undefined) urls.delete(oldest)
            }
          }
          urls.set(file.path, { url, at: timestamp })
        }
        return url
      })().finally(() => {
        if (pendingUrls.get(inflightKey)?.id === id) pendingUrls.delete(inflightKey)
      })
      pendingUrls.set(inflightKey, { id, promise })
      return promise
    },
    directUrl,
    isAttachmentUrl: (url) => !!root && (url.startsWith(`${root}/p/`) || url.startsWith(`${root}/d/`)),
    clearCache(path) {
      if (!path) {
        urls.clear()
        pendingUrls.clear()
      } else {
        for (const key of [...urls.keys()]) if (isWithin(key, path)) urls.delete(key)
        for (const key of [...pendingUrls.keys()]) {
          if (isWithin(key.slice(0, key.indexOf('\0')), path)) pendingUrls.delete(key)
        }
      }
    },
  }
}

/**
 * Lazy proxy for the built-in demo data: production sites with `base` set never
 * download `demo.ts` or its bundled sample files.
 */
export function createLazyDemoApi(delay = 220, locale: FileListLocale = 'zh-CN'): OpenListApi {
  let resolved: OpenListApi | undefined
  let pending: Promise<OpenListApi> | undefined
  const load = (): Promise<OpenListApi> => {
    if (resolved) return Promise.resolve(resolved)
    pending ??= import('./demo')
      .then(({ createDemoApi }) => (resolved = createDemoApi(delay, locale, (message, code) => new ApiError(message, code))))
      .catch((error) => {
        pending = undefined
        throw error
      })
    return pending
  }
  return {
    list: (path, password) => load().then((client) => client.list(path, password)),
    get: (path, password) => load().then((client) => client.get(path, password)),
    settings: async () => ({ title: '', iframePreviews: '' }),
    fileUrl: (file, password) => load().then((client) => client.fileUrl(file, password)),
    directUrl: () => '',
    isAttachmentUrl: (url) => url.startsWith('blob:'),
    isSampleFile: (path) => resolved?.isSampleFile?.(path) ?? false,
    clearCache: () => {},
  }
}
