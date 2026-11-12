---
title: 组件属性
---

# 组件属性

::: field base
@type string
@default ''
OpenList 站点地址；为空时进入演示模式
:::

::: field path
@type string
@default '/'
初始目录
:::

::: field sources
@type FileListSource[]
@default []
多根挂载；设置后忽略 `path`。每项 `{ path, title?, password?, expanded? }`
:::

::: field expanded
@type boolean
@default false
目录根是否默认展开
:::

::: field title
@type string
@default ''
工具栏标题；为空时回退到 OpenList 的 `site_title`
:::

::: field token
@type string
@default ''
可选只读 token；不传则以游客身份请求。**对访客公开**，见[安全与权限](../guide/security)
:::

::: field password
@type string
@default ''
目录密码，也可以在运行时输入。**对访客公开**，见[安全与权限](../guide/security)
:::

::: field rememberPassword
@type boolean
@default true
输入密码时是否提供“在此标签页中记住”开关；`false` 时不写入 sessionStorage
:::

::: field pageSize
@type number
@default 15
每个文件夹先显示的条数，之后显示“再显示 / 全部显示 / 收起”；`0` 全部显示
:::

::: field deepSearch
@type 'manual' | 'auto'
@default 'manual'
`auto`：输入关键词即自动深度搜索（适合挂载目录不大的站点）
:::

::: field deepSearchLimit
@type number
@default 500
深度搜索每次最多读取的文件夹数，之后可“继续”
:::

::: field zipWarnSize
@type number
@default 500（触屏 200）
单位 MB。需在内存中打包的浏览器（Firefox、Safari）超过该大小先确认；`0` 不提示
:::

::: field zipMaxSize
@type number
@default 2048（触屏 1024）
单位 MB。同上，超过该大小不打包；`0` 不限制
:::

::: field locale
@type 'zh-CN' | 'en-US'
@default 'zh-CN'
内置文案预设
:::

::: field labels
@type Partial<FileListLabels>
按 key 覆盖单条文案
:::

同时注册了 `<FileList>` 和 `<VPFileList>` 两个组件名。

在 Markdown 中可以用短横线写法，如 `page-size`、`deep-search`；绑定非字符串值时加 `:`，如 `:page-size="50"`。
