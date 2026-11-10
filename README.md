# vitepress-plugin-filelist

面向 VitePress 的 OpenList 文件浏览组件：树形展开、勾选批量打包、目录密码、token，直接调用 OpenList 接口。

## 功能

- 📁 树形目录，文件夹按需加载
- ✅ 勾选文件；选中文件夹会自动加载并选中其下所有层级的文件
- 📦 批量打包 ZIP（基于 `client-zip`），带进度、可取消；Chrome / Edge 边下载边写入磁盘，不受大小限制；保留目录结构，不同目录的同名文件不会互相覆盖
- 📄 大目录每个文件夹先显示 200 条，可“显示更多 / 全部显示”
- ⬇️ 单文件下载（`fs/get` 的 `raw_url`，回退 `/d/`）：交给浏览器下载；OpenList 自己的 `/p/`、`/d/` 链接在当前页直接下载、不打开新标签页，存储直链在新标签页打开
- 👁️ 弹窗预览（不跳转）：图片、音视频、文本、PDF；Office 等其它类型显示文件信息与下载
- 🔐 目录密码输入，可选只读 token
- 🔎 当前树过滤，按名称 / 大小 / 日期排序
- 🎨 紧凑表格：按文件类型着色的扩展名标签、层级引导线，跟随 VitePress 亮 / 暗主题
- 📱 窄容器（< 560px）自动切换为双行列表与 44px 触控区，勾选后工具栏变为吸顶操作条
- 🌐 使用 `/api/fs/list`、`/api/fs/get`、`/api/public/settings`
- 🧪 `base` 为空时使用内置演示数据
- SSR 安全（网络请求只在客户端执行）

## 安装

```bash
pnpm add -D vitepress-plugin-filelist
# 或：npm i -D vitepress-plugin-filelist
```

## 在 vitepress-tuck 中使用

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress-tuck'
import fileList from 'vitepress-plugin-filelist'

export default defineConfig({
  plugins: [fileList()],
})
```

```ts
// .vitepress/theme/index.ts
import type { Theme } from 'vitepress'
import enhanceApp from 'virtual:enhance-app'
import DefaultTheme from 'vitepress/theme'

export default {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    enhanceApp(ctx)
  },
} satisfies Theme
```

```md
<FileList base="https://pan.example.com" path="/课程资料" />
```

## 在普通 VitePress 中使用

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import { enhanceAppWithFileList } from 'vitepress-plugin-filelist/client'
import 'vitepress-plugin-filelist/style.css'

export default {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    enhanceAppWithFileList(ctx)
  },
}
```

## 组件属性

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
| `zipWarnSize` | `number` | `500`（触屏 `200`） | 需在内存中打包的浏览器（Firefox、Safari）超过该大小（MB）先确认；`0` 不提示 |
| `zipMaxSize` | `number` | `2048`（触屏 `1024`） | 同上，超过该大小（MB）不打包；`0` 不限制 |
| `title` | `string` | `''` | 工具栏标题；为空时回退到 OpenList 的 `site_title` |
| `locale` | `'zh-CN' \| 'en-US'` | `'zh-CN'` | 内置文案预设 |
| `labels` | `Partial<FileListLabels>` | `undefined` | 按 key 覆盖单条文案 |

同时注册了 `<FileList>` 和 `<VPFileList>` 两个组件名。

## 多根挂载

```md
<FileList
  base="https://pan.example.com"
  title="课程资料"
  :sources="[
    { path: '/课程资料/语文' },
    { path: '/课程资料/数学', expanded: true },
    { path: '/课程资料/说明.pdf' }
  ]"
/>
```

- 目录路径挂载为根文件夹，默认折叠；`expanded` 可为全局或单个 source 打开
- 文件路径挂载为一条文件记录，直接预览/下载
- 勾选根目录会加载并选中其下所有文件；ZIP 内以根节点名称（`title` 或路径末段）作为顶层文件夹，文件根保留原文件名
- 每个 source 可单独设置 `title`、`password`；未设置 `password` 的 source 使用组件的 `password` 或运行时输入的密码，遇到需要密码的目录会在该行原地显示密码输入框（见下文）
- 根节点顺序按 `sources` 顺序，子项仍按名称/大小/日期排序

```ts
interface FileListSource {
  path: string
  title?: string
  password?: string
  expanded?: boolean
}
```

## 界面与布局

- 宽容器：表格布局（勾选 / 名称 / 大小 / 修改日期 / 操作），行高 40px；勾选文件后，工具栏原地变为操作条（已选数量、总大小、清除、下载 ZIP）
- 窄容器（组件宽度 < 560px，基于容器查询而非视口宽度，侧边栏挤压时同样生效）：
  - 隐藏“修改日期”列，大小与日期显示在文件名下方
  - 行高 56px，复选框、展开、预览、下载的触控区不小于 44px
  - 表头排序改为下拉选择
  - 勾选后操作条吸附在组件顶部，位于 VitePress 导航栏 / “On this page” 栏下方，只在本组件范围内吸附
- 颜色全部取自 VitePress 主题变量，暗色模式自动适配

## 批量下载

- Chrome / Edge（含较新的 Android Chrome）：点“下载 ZIP”先弹出系统“另存为”窗口，之后边下载边写入，内存占用很小，不受大小限制
- Firefox、Safari、iPhone：浏览器只能先把文件放进内存再打包。按已选总大小判断：超过 `zipWarnSize` 先确认，超过 `zipMaxSize` 不打包并建议分批
- 打包期间操作条显示进度（大小与文件数），可随时取消；勾选暂时锁定。任一文件失败会整体取消并提示文件名
- 同时取 4 个文件（顺序不变），减少每个文件的网络等待；进度每 100 ms 更新一次
- ZIP 只存储不压缩（网盘文件多为已压缩格式），支持超过 4 GB（Zip64）

## 大目录

- 每个文件夹（以及单路径模式的顶层列表）先显示 `pageSize` 条，末尾一行“还有 X 项 · 显示更多 · 全部显示”；剩余不足一页时只显示“显示剩余 X 项”
- 数据一次全部取回，只减少渲染：排序后再截取，勾选文件夹 / 全选包含未显示的文件，输入筛选词时显示全部匹配
- 刷新后保留已展开的条数

## 刷新与目录密码

- **刷新**：保留当前列表并调暗，表头下方显示进度条；完成后整体替换，已展开的目录和仍存在的勾选会保留。刷新失败时保留旧数据并提示。刷新只重新读取 OpenList 的目录缓存（游客没有写权限，无法强制刷新存储）
- **目录密码**：点击加锁目录（或勾选包含它的目录）时，密码输入框直接出现在该行的大小 / 日期位置，行高不变，下方文件不会移动；勾选在遇到加锁子目录时停下并请求密码
  - Enter 提交，Esc 取消；密码错误时在原位提示“密码不正确或无权访问”（OpenList 无法区分密码错误和无权限）
  - 钥匙按钮可开启“在此标签页中记住（关闭标签页后失效）”，密码存在 sessionStorage，按 OpenList 地址和目录区分，也覆盖子目录；已记住的目录显示“已记住 · 忘记”
  - 保存的密码失效时自动删除，并提示重新输入
  - 本次页面中输入过的密码（即使没有记住）在刷新后仍然有效
- 单一 `path` 本身需要密码时，在列表位置显示密码输入框

吸顶偏移默认根据 `.VPNav`、`.VPLocalNav` 的实际高度自动计算；自定义主题可手动指定：

```css
.fl-root {
  --fl-sticky-top: 56px;
}
```

## 预览

点击预览按钮在当前页面的弹窗（原生 `<dialog>`）中显示，不跳转、不打开新标签页。只有能在页面内显示的类型才有预览按钮；点击文件名仍是下载。

| 类型 | 扩展名（节选） | 方式 |
| --- | --- | --- |
| 图片 | png、jpg、gif、webp、svg、avif | `<img>`，可旋转、切换原始大小 |
| 视频 / 音频 | mp4、webm、mov / mp3、m4a、flac、wav | 原生播放器（格式以浏览器支持为准） |
| 文本 | txt、md、json、csv、yaml、日志与常见代码 | 只读取前 1 MB（Range 请求），纯文本显示 |
| PDF | pdf | 优先使用 OpenList `iframe_previews` 中配置的 PDF 查看器；未配置时用浏览器自带阅读器（下载后以 Blob 显示，上限 50 MB） |
| 其它（含 Office、压缩包） | — | 弹窗内显示文件信息和下载按钮 |

- 弹窗内 ← / → 切换当前列表中的可预览文件，Esc 或点击遮罩关闭
- 读取文本和浏览器 PDF 需要文件地址允许跨域：经 OpenList 代理（`/p/`）时由 OpenList 的 CORS 设置决定；网盘直链由网盘决定。失败时显示“无法在页面内预览”和下载按钮
- `iframe_previews` 来自 `/api/public/settings`，与 OpenList 网页端使用同一配置，占位符 `$url`、`$e_url`、`$b_url`、`$durl`、`$name` 的含义一致

## 国际化

```md
<FileList locale="en-US" base="https://pan.example.com" />
```

在预设基础上覆盖单条文案：

```md
<FileList
  :labels="{ batch: '下载全部', loaded: '共 {count} 个文件' }"
  base="https://pan.example.com"
/>
```

内置预设：`zh-CN`、`en-US`。占位符支持 `{count}`、`{percent}`、`{message}`、`{name}`，由 `formatLabel()` 替换。完整 key 列表通过 `FileListLabels` 导出：

```ts
import type { FileListLabels } from 'vitepress-plugin-filelist/client'
import { fileListLocales, formatLabel, resolveLabels } from 'vitepress-plugin-filelist/client'
```

## OpenList 要求

1. **游客只读权限**：开启游客用户，或传入只读 `token`
2. **CORS**：OpenList 的 `cors.allow_origins` 必须包含站点来源（默认 `*`）；使用 OpenList-Worker 时设置 `ALLOW_URLS`（逗号分隔，完整来源，如 `https://docs.example.com,http://localhost:5173`，不支持通配符）。出现“Failed to fetch”时组件会提示检查这两项。GET 请求不带 `Content-Type`，避免多余的预检
3. **同协议**：HTTPS 页面不能请求 HTTP 的 OpenList（混合内容）
4. **token 是公开的**：只放可撤销的只读 token，不要放管理 token

组件会调用：

| 接口 | 用途 |
| --- | --- |
| `POST /api/fs/list` | 目录列表（`per_page: 0`） |
| `POST /api/fs/get` | 获取下载 / 预览 / 打包用的 `raw_url`；失败时回退到 `/d/...?sign=` |
| `GET /api/public/settings` | 获取 `site_title`、`iframe_previews` |
| `GET /d/...`、`GET /p/...` | 下载与预览读取的文件地址 |

## 导出

| 入口 | 内容 |
| --- | --- |
| `vitepress-plugin-filelist` | `fileList` 插件（默认导出） |
| `vitepress-plugin-filelist/client` | `FileList`、`VPFileList`、`enhanceAppWithFileList`、文案工具（`fileListLocales`、`formatLabel`、`resolveLabels`）、格式与文件类型工具（`formatSize`、`formatDate`、`fileKind`、`previewKind` 等）、类型 |
| `vitepress-plugin-filelist/style.css` | 组件样式 |

## 兼容性

peerDependencies 同时支持 VitePress 1.x 与 2.0 alpha：`^1.0.0 || ^2.0.0-alpha.0`。

在 Node 22 下针对 VitePress `2.0.0-alpha.21` 本地实测：

| 包管理器 | 安装 | 构建 |
| --- | --- | --- |
| npm 10 | ✅ | ✅ |
| pnpm 11.25 | ✅ | ✅ |
| yarn 1.22（classic） | ✅ | ✅ |
| bun 1.4 | ✅ | ✅ |
| deno 2.9 | ✅ `deno install` | ❌ Vite/rolldown 加载配置时失败 |

Deno 可以安装 npm 依赖，但目前用 Deno 构建 VitePress 会在 rolldown 里报 `stream did not contain valid UTF-8`；构建请使用 Node。

## 发布

通过 GitHub Actions 的 Trusted Publishing（OIDC）发布到 npm，带 provenance。

## 说明

- 批量 ZIP 通过 `raw_url`（OpenList `/p/` 代理）下载，CORS 保持在 OpenList 源上
- 表头全选只统计已加载的文件；勾选单个文件夹则会递归加载其全部子目录（目录很深或很多时会逐个请求，可能较慢）
- 目录以 `per_page: 0` 请求全部条目；超大目录可能较慢，暂未实现分页

## 开发

```bash
pnpm install
pnpm run build       # 生成 dist/node、dist/client/ssr、dist/client/browser、style.css
pnpm run typecheck   # vue-tsc，包含 .vue 模板与测试
pnpm test            # Vitest：工具函数、密码、下载、FileList 组件
pnpm run pack:check
```

源码结构（`src/client`）：

| 文件 | 职责 |
| --- | --- |
| `FileList.vue` | 组件：把下列模块接到界面 |
| `api.ts` | OpenList 接口、文件地址缓存、错误判断 |
| `demo.ts` | 演示数据（与 `api.ts` 同一接口） |
| `tree.ts` | 树节点、排序、目录统计 |
| `usePasswords.ts` / `passwords.ts` | 目录密码的选择顺序 / 标签页内记住 |
| `download.ts` | 单文件下载、批量 ZIP |
| `PreviewDialog.vue` | 预览弹窗 |
| `Icon.vue` / `icons.ts` | 图标 |
| `utils.ts` | 路径、格式化、文件类型表 |

仓库统一使用 pnpm（`pnpm-lock.yaml`），CI 与发布流程执行 `pnpm install --frozen-lockfile`。

`demo/` 下的演示站通过 `file:..` 安装本地包：

```bash
cd demo
pnpm install
pnpm run build
```

## License

MIT
