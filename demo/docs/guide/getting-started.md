---
title: 快速开始
---

# 快速开始

## 安装

::: npm-to

```sh
npm install -D vitepress-plugin-filelist
```

:::

## 在 vitepress-tuck 中使用

需要 VitePress 2，并自行安装 [vitepress-tuck](https://github.com/pengzhanbo/vitepress-tuck)（它是本插件的可选依赖）：

::: npm-to

```sh
npm install -D vitepress-tuck
```

:::

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

## 在普通 VitePress 中使用

支持 VitePress 1.6 及以上（含 VitePress 2），不需要 vitepress-tuck：

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

## 放进页面

在任意 Markdown 页面中：

```md
<FileList base="https://pan.example.com" path="/课程资料" />
```

`base` 是 OpenList 站点地址。还没准备好 OpenList 时，先不写 `base`，组件会使用内置演示数据：

<FileList title="课程资料（演示数据）" />

```md
<FileList title="课程资料（演示数据）" />
```

演示数据中“示例文件”里的文件是真实的，可以预览、下载、打包；其它文件只提示接入 OpenList 后会发生什么。

接下来：[接入 OpenList](./openlist)，或查看全部[组件属性](../reference/props)。

## 界面与布局

- 宽容器：表格布局（勾选 / 名称 / 大小 / 修改日期 / 操作），行高 40px；勾选文件后，工具栏原地变为操作条（已选数量、总大小、清除、下载 ZIP）
- 窄容器（组件宽度 < 560px，基于容器查询而非视口宽度，侧边栏挤压时同样生效）：
  - 隐藏“修改日期”列，大小与日期显示在文件名下方
  - 行高 56px，复选框、展开、预览、下载的触控区不小于 44px
  - 表头排序改为下拉选择
  - 勾选后操作条吸附在组件顶部，位于站点导航栏（VitePress 的导航栏 / “On this page” 栏，或 VuePress 主题的导航栏）下方，只在本组件范围内吸附
- 颜色取自站点主题的变量（VitePress，或 VuePress 的默认主题、plume、hope），暗色模式自动适配；“下载 ZIP”按钮用主题的按钮色，若白字不够清楚（低于 4.5:1）会自动加深到刚好清楚

吸顶偏移默认根据导航栏的实际高度自动计算（VitePress 的 `.VPNav`、`.VPLocalNav`，VuePress 主题的 `.vp-navbar`、`.vp-nav`、`.vp-local-nav`）；自定义主题可手动指定：

```css
.fl-root {
  --fl-sticky-top: 56px;
}
```

## 键盘操作

列表可以完全用键盘操作，只占一个 Tab 停顿：方向键移动、展开、收起，空格勾选，回车打开，输入文字跳转，Ctrl+A（Mac：⌘A）全选。全部按键和读屏说明见[键盘操作](../features/keyboard)。
