# vitepress-plugin-filelist

面向 VitePress 的 OpenList 文件浏览组件：树形展开、勾选批量打包、目录密码、token，直接调用 OpenList 接口。

## 功能

- 📁 树形目录，文件夹按需加载
- ✅ 勾选文件；选中文件夹会自动加载并选中其下所有层级的文件
- 📦 批量打包 ZIP（基于 `fflate`），带进度；保留目录结构，不同目录的同名文件不会互相覆盖
- ⬇️ 单文件下载（`fs/get` 的 `raw_url`，回退 `/d/`）
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
- 每个 source 可单独设置 `title`、`password`；未设置 `password` 的 source 使用组件的 `password` 或运行时输入的密码，遇到需要密码的目录会弹出密码输入框
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
2. **CORS**：OpenList 的 `cors.allow_origins` 必须包含站点来源（默认 `*`）
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
| `vitepress-plugin-filelist/client` | `FileList`、`VPFileList`、`enhanceAppWithFileList`、类型 |
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
pnpm run typecheck
pnpm test            # Vitest：utils、locale helpers、FileList 组件
pnpm run pack:check
```

仓库统一使用 pnpm（`pnpm-lock.yaml`），CI 与发布流程执行 `pnpm install --frozen-lockfile`。

`demo/` 下的演示站通过 `file:..` 安装本地包：

```bash
cd demo
pnpm install
pnpm run build
```

## License

MIT
