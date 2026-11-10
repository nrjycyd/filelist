# vitepress-plugin-filelist

面向 VitePress 的 OpenList 文件浏览组件：树形展开、勾选批量打包、目录密码、token，直接调用 OpenList 接口。

## 功能

- 📁 树形目录，文件夹按需加载
- ✅ 勾选文件；选中文件夹会自动加载并选中其下所有层级的文件
- 📦 批量打包 ZIP（基于 `fflate`），带进度；保留目录结构，不同目录的同名文件不会互相覆盖
- ⬇️ 单文件下载与预览（`/d/`、`/p/`、`fs/get` 的 `raw_url`）
- 🔐 目录密码输入，可选只读 token
- 🔎 当前树过滤，按名称 / 大小 / 日期排序
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
| `GET /api/public/settings` | 获取 `site_title` |
| `GET /d/...`、`GET /p/...` | OpenList 生成的下载 / 预览链接 |

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
- 表头全选只统计已加载的文件，页脚会显示还有多少文件夹未展开；勾选单个文件夹则会递归加载其全部子目录（目录很深或很多时会逐个请求，可能较慢）
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
