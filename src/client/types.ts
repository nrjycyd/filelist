export type FileListLocale = 'zh-CN' | 'en-US'

export interface FileListLabels {
  allFiles: string
  demoBadge: string
  filter: string
  refresh: string
  batch: string
  batchCount: string
  batching: string
  passwordPrompt: string
  passwordPlaceholder: string
  open: string
  columnName: string
  columnSize: string
  columnDate: string
  loading: string
  loadFailed: string
  guestHint: string
  corsHint: string
  retry: string
  empty: string
  preview: string
  download: string
  loaded: string
  selected: string
  unloaded: string
  folderFailed: string
  demoDownload: string
  demoPreview: string
  demoBatch: string
  downloadFailed: string
  previewFailed: string
  batchFailed: string
  defaultZip: string
}

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
  /** Built-in locale. Defaults to `zh-CN`. */
  locale?: FileListLocale
  /** Per-key label overrides on top of the locale preset. */
  labels?: Partial<FileListLabels>
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
