import type { OpenListEntry } from './types'
import { encodePath, isWithin } from './utils'

/** An entry from `/api/fs/list` or `/api/fs/get` (the latter adds `raw_url`). */
export interface OLItem extends OpenListEntry {
  raw_url?: string
}

export interface SiteSettings {
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
  /** Drop cached file URLs, all of them or those under `path`. */
  clearCache: (path?: string) => void
}

export class ApiError extends Error {
  code: number

  constructor(message: string, code: number) {
    super(message)
    this.code = code
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

export function createOpenListApi(base: string, token: string): OpenListApi {
  const root = base.replace(/\/+$/, '')
  const urls = new Map<string, string>()

  async function request<T>(apiPath: string, body?: unknown): Promise<T> {
    const response = await fetch(`${root}${apiPath}`, {
      method: body === undefined ? 'GET' : 'POST',
      // JSON content type only with a body: a bare GET then needs no CORS preflight.
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => null)) as
      | { code?: number; message?: string; data?: T }
      | null
    if (!payload) throw new ApiError(`HTTP ${response.status}`, response.status)
    if (payload.code !== 200) {
      throw new ApiError(payload.message || `HTTP ${response.status}`, payload.code ?? response.status)
    }
    return payload.data as T
  }

  function absoluteUrl(raw: string): string {
    if (!raw) return ''
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw
    const origin = root || (typeof window !== 'undefined' ? window.location.origin : '')
    try {
      return new URL(raw, `${origin}/`).href
    } catch {
      return raw
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
      if (file.raw_url) return absoluteUrl(file.raw_url)
      const cached = urls.get(file.path)
      if (cached) return cached
      let url = ''
      try {
        url = absoluteUrl((await request<{ raw_url?: string }>('/api/fs/get', { path: file.path, password }))?.raw_url ?? '')
      } catch {
        // Fall back to the signed download link below.
      }
      url ||= directUrl(file)
      urls.set(file.path, url)
      return url
    },
    directUrl,
    clearCache(path) {
      if (!path) urls.clear()
      else for (const key of [...urls.keys()]) if (isWithin(key, path)) urls.delete(key)
    },
  }
}
