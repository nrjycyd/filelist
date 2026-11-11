import type { ComputedRef, Ref } from 'vue'
import type { OpenListApi } from './api'
import type { FileListLabels, FileListProps } from './types'
import type { usePasswords } from './usePasswords'

/** Props after `withDefaults`: the ones with a default are always set. */
export type ResolvedProps = Readonly<
  FileListProps &
  Required<
    Pick<
      FileListProps,
      | 'base'
      | 'path'
      | 'sources'
      | 'expanded'
      | 'token'
      | 'password'
      | 'title'
      | 'locale'
      | 'rememberPassword'
      | 'pageSize'
      | 'deepSearchLimit'
      | 'deepSearch'
    >
  >
>

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
  /** A failure message; network errors (usually CORS) say where to look. */
  failureMessage: (key: keyof FileListLabels, error: unknown) => string
  api: ComputedRef<OpenListApi>
  /** Demo data (no `base`). */
  demo: ComputedRef<boolean>
  passwords: ReturnType<typeof usePasswords>
  rootEl: Ref<HTMLElement | undefined>
}
