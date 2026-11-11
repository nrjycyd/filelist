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
COMPAT_VITEPRESS=latest,next pnpm test:compat   # 也可以用 npm dist-tag
```

跟进 VitePress 新版本：

- `.github/dependabot.yml`：每天检查文档站（`demo/`）、每周检查根目录的 vitepress / vitepress-tuck / vue，有新版本就开 PR，CI 全部通过后合并，文档站随之用上新版本
- `VitePress canary` 工作流：每天查一次 npm 上 `latest`、`next` 两个 dist-tag 对应的 VitePress 和最新 Vue 的版本号；这组版本已经测过就直接结束（几秒，不安装），有新版本才跑 `test:compat`，失败时发邮件。手动运行时勾选 force 可强制重测

包体积：`src/client/__tests__/size.spec.ts` 检查构建产物的 gzip 大小（浏览器包 42 KB、样式 8 KB、Node 入口 1 KB），并确认 markdown-it、DOMPurify、client-zip 仍是按需加载。CI 和发布流程先构建再测试，所以超出预算会直接失败；本地先 `pnpm run build`，否则这组测试跳过。确需增大预算时，在同一个改动里调整并写明原因。

公开接口只有组件、`enhanceAppWithFileList`、文案工具与 `FileList*` 类型（`src/client/__tests__/publicApi.spec.ts` 守着这份清单）。新增导出或文案 key 前先想清楚：1.0 之后删除即是主版本。

源码结构（`src/client`）：

| 文件 | 职责 |
| --- | --- |
| `FileList.vue` | 组件：共享的属性、文案、提示、OpenList 客户端与密码，把下列模块接到模板 |
| `context.ts` | 各模块共享的 `ListContext` 类型 |
| `useTree.ts` | 目录树的加载与刷新、展开、目录密码、排序 |
| `useDeepSearch.ts` | 筛选与深度搜索 |
| `useRows.ts` | 屏幕上的行：长目录的末行与吸顶行、吸附偏移 |
| `useSelection.ts` | 勾选与全选 |
| `useDownloads.ts` | 单文件下载与批量 ZIP |
| `usePreview.ts` | 预览弹窗的状态与切换 |
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

文档站在 `demo/docs`：中文在根目录，英文在 `demo/docs/en/`（导航、侧栏与界面文字在 `en/config.ts`）。改动中文页面时，有英文版的（快速开始、接入 OpenList、安全与权限、组件属性、首页）一起更新。Markdown 可用 vitepress-tuck 的扩展：`::: npm-to`（安装命令）、`:::: steps`（分步，内部还有容器时外层用四个冒号）、`::: field`（属性）。README 同理：`README.md` 英文、`README.zh-CN.md` 中文。

推送到 main 后由 GitHub Actions 部署到 GitHub Pages：

```bash
cd demo
pnpm run dev         # 本地预览文档站
```

## 发版前回归（真实 OpenList）

自动测试连接的是模拟 OpenList（`e2e/mock-openlist.mjs`）和演示数据。下面这些只有真实部署才能验证：签名链接与 `raw_url`、跨域、OpenList 的 iframe 预览设置、真实大文件的 ZIP、iPhone Safari。发 `rc` 和正式版前，在自己的 OpenList-Worker 上走一遍。

准备：

- guest 已启用、基础路径限定在测试目录；目录里有一个带密码的子目录、一个超过 `pageSize` 的长目录、几种可预览的文件（图片、视频、音频、PDF、Markdown、HTML、文本），以及几百 MB 的大文件
- OpenList-Worker 的 `ALLOW_URLS` 包含 `http://localhost:5173`
- 在 `demo/docs` 里临时加一页（不要提交）：`<FileList base="https://你的地址" path="/测试目录" />`，以及一个 `sources` 多根挂载的例子；`pnpm --dir demo run dev` 打开

| # | 项目 | 怎么验 |
| --- | --- | --- |
| 1 | 加载 | 单路径、多根挂载、单个文件作为根，都能列出；标题回退为站点名 |
| 2 | 目录密码 | 行内输入，错误提示，勾选“记住”后刷新页面仍有效，“忘记”后重新询问 |
| 3 | 预览 | 每种类型都能打开；PDF 走 OpenList 的 iframe 预览设置；Markdown 渲染与源码切换；HTML 在沙箱里，脚本不执行；← / → 切换 |
| 4 | 单文件下载 | 文件名正确，不跳转页面 |
| 5 | ZIP（Chrome / Edge） | 选择保存位置后边下边写，大文件不占内存；中途取消 |
| 6 | ZIP（Firefox / Safari） | 超过 `zipWarnSize` 先确认，超过 `zipMaxSize` 拒绝；解压后目录结构与带密码子目录内的文件正确 |
| 7 | 深度搜索 | 手动开始、继续、停止；加锁目录被跳过并提示；`deep-search="auto"` |
| 8 | 长目录 | 再显示、全部显示、吸顶行“收起” |
| 9 | 刷新 | 展开的目录和勾选保留 |
| 10 | 失败提示 | 临时从 `ALLOW_URLS` 去掉 localhost：出现跨域提示；关闭 guest：出现 guest 提示 |
| 11 | 手机 | iPhone Safari：窄布局、吸附操作条、预览、下载、ZIP |
| 12 | 暗色 | 切换 VitePress 暗色主题，各状态颜色正常 |

结果记在发版记录里（日期、OpenList-Worker 版本、浏览器版本、未通过的项）。

## 发布

通过 GitHub Actions 的 Trusted Publishing（OIDC）发布到 npm，带 provenance。
