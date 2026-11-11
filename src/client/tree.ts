import type { OLItem } from './api'
import type { SortKey } from './utils'
import { compareNodes, joinPath, totalSize } from './utils'

export type UnlockError = '' | 'wrong' | 'stale'

/** A password prompt: a locked folder's same-row input, or the single-path root's. */
export interface LockState {
  /** The input is showing (locked folders stay locked while it is hidden). */
  prompting: boolean
  input: string
  error: UnlockError
  remember: boolean
  busy: boolean
}

export function newLock(prompting = false, error: UnlockError = ''): LockState {
  return { prompting, input: '', error, remember: false, busy: false }
}

export interface FNode extends OLItem {
  path: string
  depth: number
  expanded: boolean
  loaded: boolean
  loading: boolean
  children: FNode[]
  /** Password this item was listed with (site-configured or typed for a parent). */
  password: string
  isRoot?: boolean
  /** Path segments of this node inside a batch ZIP. */
  zipPath: string[]
  /** Set while OpenList says this folder needs a password. */
  lock?: LockState
  /** A locked source root whose real type could not be read yet. */
  unresolved?: boolean
}

export function toNodes(items: OLItem[], parent: FNode | { path: string; depth: number; zipPath: string[] }, password: string): FNode[] {
  return items.map((item) => ({
    ...item,
    path: joinPath(parent.path, item.name),
    depth: parent.depth + 1,
    expanded: false,
    loaded: false,
    loading: false,
    children: [],
    password,
    zipPath: [...parent.zipPath, item.name],
  }))
}

export function sortTree(nodes: FNode[], key: SortKey, ascending: boolean, locale?: string): void {
  nodes.sort((a, b) => compareNodes(a, b, key, ascending, locale))
  for (const node of nodes) if (node.children.length) sortTree(node.children, key, ascending, locale)
}

/** Loaded files at or under a node. */
export function descendantFiles(node: FNode): FNode[] {
  return node.is_dir ? node.children.flatMap(descendantFiles) : [node]
}

/** Every loaded folder (expanded or not), e.g. what a deep search has read. */
export function loadedPathsOf(nodes: FNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.is_dir && node.loaded) {
      out.add(node.path)
      loadedPathsOf(node.children, out)
    }
  }
  return out
}

export function expandedPathsOf(nodes: FNode[], out = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.is_dir && node.expanded) {
      out.add(node.path)
      expandedPathsOf(node.children, out)
    }
  }
  return out
}

/** Last path segment, for labels. */
export function sourceName(path: string): string {
  return path.split('/').filter(Boolean).pop() || path
}

export interface FolderStats {
  files: number
  bytes: number
  selected: number
}

/** Loaded file count, size and selected count for every folder, in one pass. */
export function folderStats(roots: FNode[], selected: Set<string>): Map<string, FolderStats> {
  const stats = new Map<string, FolderStats>()
  const walk = (node: FNode): FolderStats => {
    if (!node.is_dir) {
      return { files: 1, bytes: totalSize([node]), selected: selected.has(node.path) ? 1 : 0 }
    }
    const total: FolderStats = { files: 0, bytes: 0, selected: 0 }
    for (const child of node.children) {
      const part = walk(child)
      total.files += part.files
      total.bytes += part.bytes
      total.selected += part.selected
    }
    stats.set(node.path, total)
    return total
  }
  roots.forEach(walk)
  return stats
}
