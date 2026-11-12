---
title: Component props
---

# Component props

::: field base
@type string
@default ''
OpenList address. Empty: built-in demo data
:::

::: field path
@type string
@default '/'
Folder to list
:::

::: field sources
@type FileListSource[]
@default []
Several folders or files as roots; `path` is then ignored. Each `{ path, title?, password?, expanded? }`
:::

::: field expanded
@type boolean
@default false
Open the root folders at first
:::

::: field title
@type string
@default ''
Toolbar title. Falls back to OpenList's `site_title`
:::

::: field token
@type string
@default ''
Optional read-only token; guest when omitted. **Public to readers**, see [Security](../guide/security)
:::

::: field password
@type string
@default ''
Folder password; readers can also type it. **Public to readers**, see [Security](../guide/security)
:::

::: field rememberPassword
@type boolean
@default true
Offer “remember in this tab” when a password is typed; `false` never writes to sessionStorage
:::

::: field pageSize
@type number
@default 15
Rows shown per folder before “show more / show all / show less”; `0` shows everything
:::

::: field deepSearch
@type 'manual' | 'auto'
@default 'manual'
`auto`: typing a keyword starts deep search at once (for small mounts)
:::

::: field deepSearchLimit
@type number
@default 500
Folders deep search reads per run before offering “continue”
:::

::: field zipWarnSize
@type number
@default 500 (200 on touch devices)
In MB. Browsers that zip in memory (Firefox, Safari) ask first above this size; `0` never asks
:::

::: field zipMaxSize
@type number
@default 2048 (1024 on touch devices)
In MB. Above this size, those browsers refuse to zip; `0` means no limit. Chrome and Edge stream to disk and skip both checks
:::

::: field locale
@type 'zh-CN' | 'en-US'
@default 'zh-CN'
Built-in labels
:::

::: field labels
@type Partial<FileListLabels>
Per-key label overrides
:::

The component is registered as both `<FileList>` and `<VPFileList>`.

In Markdown, props can be written in kebab-case, such as `page-size` or `deep-search`; prefix non-string values with `:`, as in `:page-size="50"`.
