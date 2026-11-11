import type { FileListLocale, FileListProps } from './types'

const SECURITY_DOC = 'https://nrjycyd.github.io/vitepress-plugin-filelist/guide/security'

/** Props a page wrote that end up, readable by anyone, in the built site. */
export function publicSecrets(props: Pick<FileListProps, 'token' | 'password' | 'sources'>): string[] {
  const found: string[] = []
  if (props.token)
    found.push('token')
  if (props.password || props.sources?.some(source => source.password))
    found.push('password')
  return found
}

/**
 * Development builds only. The site's Vite replaces `import.meta.env` in
 * dependencies too (`DEV` is true under `vitepress dev`, false in a build);
 * without a bundler there is no `env` and this is not a development build.
 */
export function isDevBuild(): boolean {
  return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true
}

let warned = false

/**
 * While the site runs in development, say once per page load that `token` and
 * `password` written in Markdown are public. Production builds stay silent.
 * Returns whether it warned.
 */
export function warnPublicSecrets(
  props: Pick<FileListProps, 'token' | 'password' | 'sources'>,
  locale: FileListLocale | undefined,
  dev = isDevBuild(),
): boolean {
  if (warned || !dev)
    return false
  const found = publicSecrets(props)
  if (!found.length)
    return false
  warned = true
  const names = found.join(' / ')
  console.warn(locale === 'en-US'
    ? `[vitepress-plugin-filelist] This page sets ${names} on <FileList>. It is copied as is into the built site, where every visitor can read it. Prefer a guest account limited to a base path. ${SECURITY_DOC} (shown in development only)`
    : `[vitepress-plugin-filelist] 本页的 <FileList> 写了 ${names}：它会原样进入构建后的网页，所有访客都能看到。建议改用限定基础路径的 guest 账户。${SECURITY_DOC}（仅开发时提示）`)
  return true
}

/** Tests only: allow the next call to warn again. */
export function resetPublicSecretsWarning(): void {
  warned = false
}
