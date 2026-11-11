# 接入 OpenList

组件直接在浏览器里调用 OpenList 的接口，适用于 [OpenList](https://github.com/OpenListTeam/OpenList) 及其 Workers 版 [OpenList-Worker](https://github.com/OpenListTeam/OpenList-Worker)（本插件实测部署）。

```md
<FileList base="https://pan.example.com" path="/课程资料" title="课程资料" />
```

## 1. 开启游客，并限定基础路径

文档站是公开的静态网页，访客以 OpenList 的 **guest** 身份读取文件。

- 在 OpenList 后台“用户”中启用 `guest`（OpenList-Worker 新装默认关闭）
- **把 guest 的基础路径设为要公开的目录**，其它目录对访客不可见。这是真正限制访问范围的设置
- 关闭 guest 的写入类权限（上传、重命名、移动、复制、删除、离线下载、WebDAV / FTP 管理）

::: tip 浏览、预览、下载不是可以关闭的权限
OpenList 的权限开关管理的是写入、跳过密码、查看隐藏文件等。只要 guest 启用，就能浏览其基础路径下的文件，并预览、下载——与未登录打开 OpenList 网页看到的内容一致。需要保护的子目录请设置[目录密码](../features/passwords)，要隐藏的文件用元信息的隐藏规则。
:::

## 2. 允许跨域（CORS）

- OpenList：`cors.allow_origins` 必须包含文档站的来源（默认 `*`）
- OpenList-Worker：设置环境变量 `ALLOW_URLS`，逗号分隔的完整来源，不支持通配符，例如 `https://docs.example.com,http://localhost:5173`。部署在 GitHub Pages 时填 `https://<用户名>.github.io`，只写来源，不带路径

出现“Failed to fetch”时，组件会提示检查这两项。GET 请求不带 `Content-Type`，避免多余的预检。

## 3. 同为 HTTPS

HTTPS 页面不能请求 HTTP 的 OpenList（浏览器会拦截混合内容）。

## 关于 token

可以传入 `token`，但静态站点里的一切对访客都是可见的：token 会出现在打包后的脚本和每个请求头里。即使用 GitHub Actions Secrets 在构建时注入，也只是不出现在仓库源码中。

- 只放可撤销、只读、限定目录的普通用户 token，绝不使用管理员 token
- OpenList 登录 token 默认 48 小时过期（`token_expires_in`），过期后列表无法加载
- 大多数情况下，按上面第 1 步设置好 guest 更简单、也同样安全

## 组件调用的接口

| 接口 | 用途 |
| --- | --- |
| `POST /api/fs/list` | 目录列表（`per_page: 0`） |
| `POST /api/fs/get` | 获取下载 / 预览 / 打包用的 `raw_url`；失败时回退到 `/d/...?sign=` |
| `GET /api/public/settings` | 获取 `site_title`、`iframe_previews` |
| `GET /d/...`、`GET /p/...` | 下载与预览读取的文件地址 |

## 连接真实 OpenList 的示例

下面连接的是 OpenList 官方公开演示站 `demo.oplist.org`，内容和可用性由对方决定：

<FileList base="https://demo.oplist.org" path="/" title="OpenList 演示站" />

```md
<FileList base="https://demo.oplist.org" path="/" title="OpenList 演示站" />
```
