# 安全与权限

文档站是公开的静态网页。组件在访客的浏览器里直接请求 OpenList，所以**写在 Markdown 里的一切，所有访客都能看到**。

## 哪些内容是公开的

| 写在页面里的 | 访客能看到吗 | 说明 |
| --- | --- | --- |
| `base`、`path`、`sources` | 能 | OpenList 地址和目录本来就需要公开 |
| `token` | **能** | 原样出现在构建后的脚本里，也出现在每个请求的 `Authorization` 头里 |
| `password`、`sources[].password` | **能** | 原样出现在构建后的脚本里，也会随请求发给 OpenList |
| 访客自己输入的目录密码 | 不能 | 只在这位访客的浏览器里使用 |

用 GitHub Actions Secrets 在构建时注入 `token` 或 `password`，也只是让它们不出现在仓库源码里，构建产物里照样有。

::: tip 开发时的提醒
运行 `vitepress dev` 时，如果页面上的 `<FileList>` 写了 `token` 或 `password`，浏览器控制台会提示一次“会被公开”。正式构建（`vitepress build`）不会输出这条提示。
:::

## 推荐做法

1. **用 guest 访问，并限定基础路径。** 在 OpenList 后台启用 `guest`，把它的基础路径设为要公开的目录，并关闭写入类权限。这是真正限制访问范围的设置，步骤见[接入 OpenList](./openlist#_1-开启游客-并限定基础路径)。
2. **子目录用 OpenList 的目录密码保护，但不要把密码写进页面。** 不传 `password` 时，访客点开加锁目录会在行内输入密码，见[目录密码](../features/passwords)。
3. **要隐藏的文件**用 OpenList 元信息的隐藏规则。

## `password` 属性适合什么

`password` 会公开，只适合“防误入”：比如目录密码已经印在课件上、写在群公告里，只是不想让访客再输入一次。真正需要保密的目录，不要把密码写进页面。

## `token` 属性适合什么

大多数站点用 guest 就够了。确实需要 `token` 时：

- 只用可撤销、只读、限定目录的普通用户 token，**绝不使用管理员 token**
- OpenList 登录 token 默认 48 小时过期（`token_expires_in`），过期后列表无法加载
- 怀疑泄露时在 OpenList 后台改密码或删除该用户，让 token 失效

## 组件在浏览器里做了什么

- **记住密码**：访客勾选“在此标签页中记住”时，密码存在 `sessionStorage`，按 OpenList 地址和目录区分，关闭标签页即清除；`rememberPassword` 设为 `false` 可关闭这个选项
- **HTML 预览**在沙箱 `iframe` 中显示，不执行脚本；**Markdown 预览**的渲染结果经过 DOMPurify 清理
- **请求了哪里**：`base` 指向的 OpenList，以及它返回的文件地址；OpenList 后台“iframe 预览”里配置的外部查看器（例如 PDF 查看器）会收到被预览文件的地址。CORS 设置见[接入 OpenList](./openlist#_2-允许跨域-cors)

## 报告安全问题

请不要在公开 issue 里贴出可利用的细节。可以通过 GitHub 仓库的 **Security → Report a vulnerability** 私下报告。
