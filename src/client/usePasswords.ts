import { ref } from 'vue'
import {
  findRememberedPassword,
  forgetFolderPassword,
  rememberedFolders,
  rememberFolderPassword,
} from './passwords'
import { isWithin } from './utils'

export interface ResolvedPassword {
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

  function typedAbove(path: string): string {
    let best = ''
    let bestFolder = ''
    for (const [folder, password] of typed) {
      if (isWithin(path, folder) && folder.length > bestFolder.length) {
        best = password
        bestFolder = folder
      }
    }
    return best
  }

  function resolve(path: string, own = ''): ResolvedPassword {
    const exact = typed.get(path)
    if (exact) return { password: exact }
    if (own) return { password: own }
    const above = typedAbove(path)
    if (above) return { password: above }
    const stored = options.enabled() ? findRememberedPassword(options.scope(), path) : null
    if (stored) return { password: stored.password, rememberedAt: stored.path }
    return { password: options.fallback() }
  }

  /** A password worked: keep it for this page, and in this tab when asked. */
  function accept(path: string, password: string, remember: boolean) {
    typed.set(path, password)
    if (remember && options.enabled()) {
      rememberFolderPassword(options.scope(), path, password)
      sync()
    }
  }

  function forget(path: string) {
    typed.delete(path)
    forgetFolderPassword(options.scope(), path)
    sync()
  }

  /** A remembered password stopped working: drop it. Returns whether one was dropped. */
  function dropStale(rememberedAt: string | undefined): boolean {
    if (!rememberedAt) return false
    forgetFolderPassword(options.scope(), rememberedAt)
    sync()
    return true
  }

  return { remembered, sync, resolve, accept, forget, dropStale }
}
