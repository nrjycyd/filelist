# 参与开发

使用说明见[文档站](https://nrjycyd.github.io/vitepress-plugin-filelist/)。本文面向修改插件本身的开发者。

```bash
pnpm install
pnpm run build       # 生成 dist/node、dist/client/ssr、dist/client/browser、style.css
pnpm run typecheck   # vue-tsc，包含 .vue 模板与测试
pnpm test            # Vitest：工具函数、密码、下载、FileList 组件
pnpm run pack:check
```

浏览器测试（Playwright，Chromium 桌面 / 手机、WebKit）：`demo/e2e` 下的测试站点连接本地模拟 OpenList（`e2e/mock-openlist.mjs`），检查行高与位移、密码、刷新、显示更多、单文件下载、ZIP（内存 / 流式 / 取消 / 失败）等。

```bash
pnpm run e2e:site    # 构建插件和测试站点
pnpm run test:e2e    # 自动启动模拟 OpenList 与站点预览
```

CI 每次推送和 PR 都会运行，三种环境均为必过项。

兼容性测试：把打包后的插件装进全新的 VitePress 1.6 和 2.x 站点（普通写法，不用 vitepress-tuck），构建后在 Chromium 中检查渲染、展开、预览、ZIP，以及开发时的公开提醒。需要联网安装依赖，约 1 分钟：

```bash
pnpm test:compat
COMPAT_VITEPRESS=1.6.4 pnpm test:compat   # 只测指定版本，逗号分隔
```

公开接口只有组件、`enhanceAppWithFileList`、文案工具与 `FileList*` 类型（`src/client/__tests__/publicApi.spec.ts` 守着这份清单）。新增导出或文案 key 前先想清楚：1.0 之后删除即是主版本。

源码结构（`src/client`）：

| 文件 | 职责 |
| --- | --- |
| `FileList.vue` | 组件：把下列模块接到界面 |
| `api.ts` | OpenList 接口、文件地址缓存、错误判断 |
| `demo.ts` / `demoSamples.ts` | 演示数据（与 `api.ts` 同一接口）/ 演示用的真实示例文件 |
| `tree.ts` | 树节点、排序、目录统计 |
| `usePasswords.ts` / `passwords.ts` | 目录密码的选择顺序 / 标签页内记住 |
| `download.ts` | 单文件下载、批量 ZIP |
| `PreviewDialog.vue` | 预览弹窗 |
| `Icon.vue` / `icons.ts` | 图标 |
| `utils.ts` | 路径、格式化、文件类型表 |
| `devWarnings.ts` | 开发时提示 `token` / `password` 会公开 |

仓库统一使用 pnpm（`pnpm-lock.yaml`），CI 与发布流程执行 `pnpm install --frozen-lockfile`。

`demo/` 下的文档站通过 `file:..` 安装本地包：

```bash
cd demo
pnpm install
pnpm run build
```

文档站在 `demo/docs`，推送到 main 后由 GitHub Actions 部署到 GitHub Pages：

```bash
cd demo
pnpm run dev         # 本地预览文档站
```

## 发布

通过 GitHub Actions 的 Trusted Publishing（OIDC）发布到 npm，带 provenance。
