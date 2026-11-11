# 导出与兼容性

## 导出

| 入口 | 内容 |
| --- | --- |
| `vitepress-plugin-filelist` | `fileList`：vitepress-tuck 插件（也是默认导出） |
| `vitepress-plugin-filelist/client` | 组件 `FileList`、`VPFileList`；注册函数 `enhanceAppWithFileList`；文案工具 `fileListLocales`、`formatLabel`、`resolveLabels`；类型 `FileListProps`、`FileListSource`、`FileListLabels`、`FileListLocale` |
| `vitepress-plugin-filelist/style.css` | 组件样式（普通写法需要手动引入） |

以上就是全部公开接口，1.0 之后按语义化版本维护：新增属性、文案 key 属于次版本，删除或改名属于主版本。其它内部模块（路径与格式化工具、目录树、OpenList 请求）随时可能调整，请不要从 `dist` 里直接引用。

## 兼容性

| 组合 | 支持 | 验证方式 |
| --- | --- | --- |
| VitePress 2（`^2.0.0-alpha.18`）+ vitepress-tuck | ✅ | 文档站与浏览器测试（Chromium 桌面 / 手机、WebKit） |
| VitePress 2，普通写法 | ✅ | `pnpm test:compat`（2.0.0-alpha.21） |
| VitePress 1.6，普通写法 | ✅ | `pnpm test:compat`（1.6.4） |
| VitePress 1.6 + vitepress-tuck | ❌ | vitepress-tuck 本身需要 VitePress 2 |
| VitePress 1.5 及更早 | ❌ | 未测试，不在 `peerDependencies` 范围内 |

`pnpm test:compat` 把打包后的插件装进全新的 VitePress 站点，构建后在浏览器里检查渲染、展开、预览、打包 ZIP，并确认开发时的公开提醒只在 `vitepress dev` 中出现。

| 依赖 | 范围 |
| --- | --- |
| `vitepress`（peer） | `^1.6.0 \|\| ^2.0.0-alpha.18` |
| `vue`（peer） | `^3.5.0` |
| `vitepress-tuck`（可选 peer） | `>=0.12.2 <1`；只有用 vitepress-tuck 注册时才需要安装 |
| Node | `^20.19.0 \|\| >=22.12.0` |

在 Node 22 下针对 VitePress `2.0.0-alpha.21` 本地实测包管理器：

| 包管理器 | 安装 | 构建 |
| --- | --- | --- |
| npm 10 | ✅ | ✅ |
| pnpm 11.25 | ✅ | ✅ |
| yarn 1.22（classic） | ✅ | ✅ |
| bun 1.4 | ✅ | ✅ |
| deno 2.9 | ✅ `deno install` | ❌ Vite/rolldown 加载配置时失败 |

Deno 可以安装 npm 依赖，但目前用 Deno 构建 VitePress 会在 rolldown 里报 `stream did not contain valid UTF-8`；构建请使用 Node。
