# 升级到 0.9

0.9 冻结了 1.0 的公开接口：组件属性不变，删除了已经不用的文案 key 和内部工具函数的导出，并收紧了依赖声明。大多数站点只需要升级版本号。

## 用 vitepress-tuck 的站点：自己安装 vitepress-tuck

`vitepress-tuck` 从插件的依赖改为**可选的 peerDependency**。你的配置本来就从 `vitepress-tuck` 导入 `defineConfig`，通常已经直接安装了它；如果没有：

::: npm-to

```sh
npm install -D vitepress-tuck
```

:::

普通 VitePress 站点（用 `enhanceAppWithFileList` 注册）不再安装 vitepress-tuck。

## 支持的版本

| | 0.8 | 0.9 |
| --- | --- | --- |
| VitePress | `^1.0.0 \|\| ^2.0.0-alpha.0` | `^1.6.0 \|\| >=2.0.0-alpha.18`（2 起不设上限） |
| vitepress-tuck | 依赖 | 可选 peer（`>=0.12.2`，不设上限），需要 VitePress 2 |
| Node | 未声明 | `^20.19.0 \|\| >=22.12.0` |

VitePress 1.x 请用[普通写法](./getting-started#在普通-vitepress-中使用)注册组件。

## 删除的文案 key

下面 5 个 key 早已不在界面上显示。如果你在 `labels` 里覆盖过它们，删掉即可（TypeScript 会提示未知属性）：

| key | 现在显示在哪 |
| --- | --- |
| `batchCount` | 已选数量在工具栏，见 `selected` |
| `unloaded` | 不再显示 |
| `previewFailed` | 预览弹窗内，见 `previewUnavailable` |
| `networkHint` | 加载失败提示后追加，见 `corsHint` |
| `showMore` | 见 `showNext`、`showAll` |

## 删除的工具函数导出

`vitepress-plugin-filelist/client` 不再导出组件内部用的工具函数和类型：

`compareNodes`、`encodePath`、`extOf`、`fileKind`、`fillPreviewUrl`、`formatDate`、`formatSize`、`iframePreviewsFor`、`joinPath`、`previewKind`、`totalSize`、`uniqueEntryName`、`zipEntryName`、`zipSegment`，以及类型 `FileKind`、`IframePreview`、`PreviewKind`、`SortableNode`、`SortKey`、`OpenListEntry`。

文档从未承诺过它们。如果你的主题用到了，请在自己的代码里实现；它们都是几行的纯函数，可以从[源码](https://github.com/nrjycyd/vitepress-plugin-filelist/blob/v0.8.0/src/client/utils.ts)复制。

仍然导出的见[导出与兼容性](../reference/exports)。
