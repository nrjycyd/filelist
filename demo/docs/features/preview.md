# 预览

点预览按钮（眼睛图标），文件在当前页面的弹窗中显示，不跳转、不打开新标签页。只有能在页面内显示的类型才有预览按钮；点文件名仍是下载。试试“使用说明.md”，再切换到“渲染”：

<FileList title="预览示例" path="/示例文件" />

```md
<FileList base="https://pan.example.com" path="/示例文件" />
```

## 支持的类型

| 类型 | 扩展名（节选） | 方式 |
| --- | --- | --- |
| 图片 | png、jpg、gif、webp、svg、avif | `<img>`，可旋转、切换原始大小 |
| 视频 / 音频 | mp4、webm、mov / mp3、m4a、flac、wav | 原生播放器（格式以浏览器支持为准） |
| 文本 | txt、md、json、csv、yaml、日志与常见代码 | 只读取前 1 MB（Range 请求），纯文本显示 |
| Markdown / HTML | md、markdown / html、htm | 默认显示源码，可切换为“渲染” |
| PDF | pdf | 优先使用 OpenList `iframe_previews` 中配置的 PDF 查看器；未配置时用浏览器自带阅读器（下载后以 Blob 显示，上限 50 MB） |
| 其它（含 Office、压缩包） | — | 弹窗内显示文件信息和下载按钮 |

## 源码与渲染

- Markdown 渲染：使用 VitePress 正文样式；内容经 DOMPurify 过滤（去掉脚本、事件属性等）；只有 http(s) / mailto 链接可点击并在新标签页打开，相对链接显示为文字；相对路径的图片显示为“［图片：替代文字］”。渲染库按需加载
- HTML 渲染：放在空 `sandbox` 的 iframe 中，禁止脚本、表单和弹窗，无法访问当前页面；网页引用的相对路径资源不会加载
- 源码 / 渲染的选择在当前页面内记住

## 其它

- 弹窗内 ← / → 切换当前列表中的可预览文件，Esc 或点击遮罩关闭
- 读取文本和浏览器 PDF 需要文件地址允许跨域：经 OpenList 代理（`/p/`）时由 OpenList 的 CORS 设置决定；网盘直链由网盘决定。失败时显示“无法在页面内预览”和下载按钮
- `iframe_previews` 来自 `/api/public/settings`，与 OpenList 网页端使用同一配置，占位符 `$url`、`$e_url`、`$b_url`、`$durl`、`$name` 的含义一致
