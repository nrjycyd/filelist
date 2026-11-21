import type { ComputedRef, Ref } from 'vue'
import type { OpenListApi } from './api'
import type { FileListLabels, FileListProps, FileListSource } from './types'
import type { usePasswords } from './usePasswords'

/** Defaults shared between `FileList.vue`'s `withDefaults` and `ResolvedProps`. */
export const DEFAULT_PROPS = {
  base: '',
  path: '/',
  sources: () => [] as FileListSource[],
  expanded: false,
  token: '',
  password: '',
  title: '',
  locale: 'zh-CN' as const,
  rememberPassword: true,
  pageSize: 15,
  deepSearchLimit: 500,
  deepSearch: 'manual' as const,
}

/** Props after `withDefaults`: every key in `DEFAULT_PROPS` is always set. */
type ResolvedProps = Readonly<FileListProps & Required<Pick<FileListProps, keyof typeof DEFAULT_PROPS>>>

export type Translate = (key: keyof FileListLabels, values?: Record<string, string | number>) => string

/**
 * What every part of one `<FileList>` shares: its props, labels, toast, the
 * OpenList client, folder passwords and its root element. Created once in
 * FileList.vue and handed to the `use*` modules.
 */
export interface ListContext {
  props: ResolvedProps
  t: Translate
  showToast: (message: string) => void
  /** Localised message for an error (formats API timeouts via `t`). */
  errorMessage: (error: unknown) => string
  /** A failure message; network errors (usually CORS) say where to look. */
  failureMessage: (key: keyof FileListLabels, error: unknown) => string
  api: ComputedRef<OpenListApi>
  /** Demo data (no `base`). */
  demo: ComputedRef<boolean>
  passwords: ReturnType<typeof usePasswords>
  rootEl: Ref<HTMLElement | undefined>
}
