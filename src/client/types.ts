export interface FileListProps {
  /** OpenList base URL, e.g. `https://pan.example.com`. Empty string enables demo mode. */
  base?: string
  /** Initial directory, defaults to `/`. */
  path?: string
  /** Optional read-only token. Guest access is used when omitted. */
  token?: string
  /** Folder password. The component also asks at runtime when OpenList reports one. */
  password?: string
  /** Toolbar title. Falls back to `site_title` from `/api/public/settings`. */
  title?: string
}

/** Shape of one entry returned by `POST /api/fs/list`. */
export interface OpenListEntry {
  name: string
  size: number
  is_dir: boolean
  modified: string
  created?: string
  sign?: string
  thumb?: string
  type?: number
}
