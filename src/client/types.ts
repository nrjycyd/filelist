export type FileListLocale = 'zh-CN' | 'en-US'

export interface FileListLabels {
  allFiles: string
  demoBadge: string
  filter: string
  refresh: string
  batch: string
  /** @deprecated No longer shown; the selection count lives in the toolbar. */
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
  /** Shown (and appended to toasts) for browser network errors, usually CORS. */
  /** Shown (and appended to toasts) for browser network errors, usually CORS. */
  corsHint: string
  retry: string
  empty: string
  preview: string
  download: string
  loaded: string
  selected: string
  /** @deprecated No longer shown; the footer only shows loaded files and size. */
  unloaded: string
  folderFailed: string
  demoDownload: string
  demoPreview: string
  demoBatch: string
  downloadFailed: string
  /** @deprecated Preview errors are shown in the dialog (`previewUnavailable`). */
  previewFailed: string
  batchFailed: string
  defaultZip: string
  /** Text button that clears the selection (wide layout). */
  clear: string
  /** Accessible name of the clear-selection button. */
  clearSelection: string
  /** `{size}` total, used for the selection and the footer. */
  totalSize: string
  /** `{count}` files inside a loaded folder. */
  folderItems: string
  /** Label of the compact sort select shown in narrow containers. */
  sortBy: string
  selectAll: string
  /** Accessible name of a row checkbox, `{name}`. */
  selectItem: string
  /** Accessible name of the expand button, `{name}`. */
  expand: string
  /** Accessible name of the collapse button, `{name}`. */
  collapse: string
  /** Preview dialog: close button. */
  close: string
  /** Preview dialog: previous / next previewable file. */
  previous: string
  next: string
  /** Preview dialog: rotate image by 90°. */
  rotate: string
  /** Preview dialog: toggle the image between fit-to-window and actual size. */
  actualSize: string
  /** Preview dialog: file type that is not previewed (Office and others). */
  previewUnsupported: string
  /** Preview dialog: preview failed (network, CORS, unsupported codec). */
  previewUnavailable: string
  /** Preview dialog: PDF larger than the in-page limit, `{size}`. */
  previewTooLarge: string
  /** Preview dialog: only the first `{size}` of a text file is shown. */
  textTruncated: string
  /** Refresh button while refreshing. */
  refreshing: string
  /** Refresh failed; the old rows stay. `{message}` */
  refreshFailed: string
  cancel: string
  /** Accessible name of a folder's password input. `{name}` */
  passwordFor: string
  /** OpenList cannot tell a wrong password from missing permission. */
  passwordWrong: string
  /** A password remembered in this tab no longer works. */
  passwordStale: string
  /** The key toggle next to a password input. */
  rememberPassword: string
  /** Tag on a folder whose password is remembered. */
  remembered: string
  forgetPassword: string
  /** Lock button on a folder that needs a password. `{name}` */
  unlockFolder: string
  /** @deprecated Network failures now append `corsHint`. */
  networkHint: string
}

export interface FileListSource {
  /** OpenList path, directory or single file. */
  path: string
  /** Root label. Defaults to the last path segment. */
  title?: string
  /** Per-source folder password. */
  password?: string
  /** Initial expanded state for a directory source. Overrides the global `expanded` prop. */
  expanded?: boolean
}

export interface FileListProps {
  /** OpenList base URL, e.g. `https://pan.example.com`. Empty string enables demo mode. */
  base?: string
  /** Initial directory, defaults to `/`. */
  path?: string
  /** Mount multiple paths as root nodes. When set, `path` is ignored. */
  sources?: FileListSource[]
  /** Expand directory roots initially. Defaults to `false`. */
  expanded?: boolean
  /** Optional read-only token. Guest access is used when omitted. */
  token?: string
  /** Folder password. The component also asks at runtime when OpenList reports one. */
  password?: string
  /** Toolbar title. Falls back to `site_title` from `/api/public/settings`. */
  title?: string
  /**
   * Offer to remember folder passwords in this browser tab (sessionStorage,
   * cleared when the tab closes). Defaults to `true`; `false` hides the option.
   */
  rememberPassword?: boolean
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
