# 导出与兼容性

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
