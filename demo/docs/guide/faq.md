# 常见问题

## 列表显示“Failed to fetch”或加载失败

多为跨域：检查 OpenList 的 `cors.allow_origins`，或 OpenList-Worker 的 `ALLOW_URLS` 是否包含文档站的来源；HTTPS 页面也不能请求 HTTP 的 OpenList。见[接入 OpenList](./openlist)。

## 提示 guest 相关错误

OpenList 没有启用 guest 用户。在后台启用 guest 并设置基础路径；也可以传入只读 `token`，但它对访客公开，见[安全与权限](./security)。

## 关闭了 guest 的全部权限，为什么还能预览和下载？

浏览、预览、下载不是可以关闭的权限，只要 guest 启用就可以。限制范围请用 guest 的基础路径，保护子目录请用目录密码。见[接入 OpenList](./openlist)。

## 刷新后为什么没看到网盘里的新文件？

刷新重新读取 OpenList 的目录缓存。游客没有写权限，不能强制 OpenList 刷新存储；等 OpenList 的缓存过期，或在后台刷新。

## 表头全选为什么没有选中未展开目录里的文件？

表头全选只统计已加载的文件。勾选某个文件夹会递归加载并选中其下所有文件（目录很深或很多时会逐个请求，可能较慢）。

## 文本或 PDF 显示“无法在页面内预览”

读取文本和用浏览器显示 PDF 需要文件地址允许跨域：经 OpenList 代理（`/p/`）时由 OpenList 的 CORS 设置决定，网盘直链由网盘决定。此时仍可下载。

## 打包 ZIP 很大的文件夹失败

Firefox、Safari 和手机浏览器要先把文件放进内存再打包，超过上限会提示分批；Chrome / Edge 边下载边写入磁盘，不受大小限制。见[批量下载 ZIP](../features/zip)。
