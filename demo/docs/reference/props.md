# 组件属性

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `base` | `string` | `''` | OpenList 站点地址；为空时进入演示模式 |
| `path` | `string` | `'/'` | 初始目录 |
| `sources` | `FileListSource[]` | `[]` | 多根挂载；设置后忽略 `path` |
| `expanded` | `boolean` | `false` | 目录根是否默认展开 |
| `token` | `string` | `''` | 可选只读 token；不传则以游客身份请求 |
| `password` | `string` | `''` | 目录密码，也可以在运行时输入 |
| `rememberPassword` | `boolean` | `true` | 输入密码时是否提供“在此标签页中记住”开关；`false` 时不写入 sessionStorage |
| `pageSize` | `number` | `200` | 每个文件夹先显示的条数，之后显示“显示更多 / 全部显示”；`0` 全部显示 |
| `deepSearchLimit` | `number` | `500` | 深度搜索每次最多读取的文件夹数，之后可“继续” |
| `deepSearch` | `'manual' \| 'auto'` | `'manual'` | `auto`：输入关键词即自动深度搜索（适合挂载目录不大的站点） |
| `zipWarnSize` | `number` | `500`（触屏 `200`） | 需在内存中打包的浏览器（Firefox、Safari）超过该大小（MB）先确认；`0` 不提示 |
| `zipMaxSize` | `number` | `2048`（触屏 `1024`） | 同上，超过该大小（MB）不打包；`0` 不限制 |
| `title` | `string` | `''` | 工具栏标题；为空时回退到 OpenList 的 `site_title` |
| `locale` | `'zh-CN' \| 'en-US'` | `'zh-CN'` | 内置文案预设 |
| `labels` | `Partial<FileListLabels>` | `undefined` | 按 key 覆盖单条文案 |

同时注册了 `<FileList>` 和 `<VPFileList>` 两个组件名。

在 Markdown 中可以用短横线写法，如 `page-size`、`deep-search`；绑定非字符串值时加 `:`，如 `:page-size="50"`。
