import { ref } from 'vue'
import {
  findRememberedPassword,
  forgetFolderPassword,
  normalisePath,
  rememberedFolders,
  rememberFolderPassword,
} from './passwords'
import { isWithin } from './utils'

interface ResolvedPassword {
  password: string
  /** Set when the password came from this tab's store, so a failure can drop it. */
  rememberedAt?: string
}

/**
 * The one place that decides which folder password to send.
 *
 * Order: typed on this page for this exact folder → the item's own password
 * (site-configured, or inherited from the folder it was listed with) → typed
 * for an enclosing folder → remembered in this tab → the component default.
 */
export function usePasswords(options: {
  /** Storage scope, normally the OpenList base URL. */
  scope: () => string
  /** Whether remembering in sessionStorage is allowed. */
  enabled: () => boolean
  /** The component's `password` prop. */
  fallback: () => string
}) {
  /** Typed on this page; not necessarily remembered. Survives refreshes. */
  const typed = new Map<string, string>()
  /** Remembered folders, mirrored from sessionStorage so templates react. */
  const remembered = ref<Set<string>>(new Set())

  function sync() {
    remembered.value = new Set(options.enabled() ? rememberedFolders(options.scope()) : [])
  }

  function typedAbove(path: string): { path: string; password: string } | null {
    const target = normalisePath(path)
    let best: { path: string; password: string } | null = null
    for (const [folder, password] of typed) {
      if (isWithin(target, folder) && (!best || folder.length > best.path.length)) best = { path: folder, password }
    }
    return best
  }

  function resolve(path: string, own = '', ownAt = path): ResolvedPassword {
    const target = normalisePath(path)
    const exact = typed.get(target)
    if (exact) return { password: exact }
    const above = typedAbove(target)
    const stored = options.enabled() ? findRememberedPassword(options.scope(), target) : null
    let best: ResolvedPassword = own ? { password: own } : { password: options.fallback() }
    let len = own ? normalisePath(ownAt).length : -1
    if (above && above.path.length > len) {
      best = { password: above.password }
      len = above.path.length
    }
    if (stored && stored.path.length > len) best = { password: stored.password, rememberedAt: stored.path }
    return best
  }

  /** A password worked: keep it for this page, and in this tab when asked. */
  function accept(path: string, password: string, remember: boolean) {
    const target = normalisePath(path)
    typed.set(target, password)
    if (remember && options.enabled()) {
      rememberFolderPassword(options.scope(), target, password)
      sync()
    }
  }

  function forget(path: string) {
    const target = normalisePath(path)
    typed.delete(target)
    forgetFolderPassword(options.scope(), target)
    sync()
  }

  function isRemembered(path: string): boolean {
    return remembered.value.has(normalisePath(path))
  }

  function clearTyped() {
    typed.clear()
  }

  /** A remembered password stopped working: drop it. Returns whether one was dropped. */
  function dropStale(rememberedAt: string | undefined): boolean {
    if (!rememberedAt) return false
    forgetFolderPassword(options.scope(), rememberedAt)
    sync()
    return true
  }

  return { remembered, isRemembered, sync, resolve, accept, forget, clearTyped, dropStale }
}
