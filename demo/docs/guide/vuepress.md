# 在 VuePress 中使用

VuePress 2 用户安装 **vuepress-plugin-filelist**。它和 vitepress-plugin-filelist 是同一个组件、同一个版本号，一起发布；属性、文案和功能完全相同，本站其它页面的说明都适用。

## 安装

::: npm-to

```sh
npm install -D vuepress-plugin-filelist
```

:::

不会顺带安装 VitePress。

## 注册

```ts
// .vuepress/config.ts
import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'
import { fileListPlugin } from 'vuepress-plugin-filelist'

export default defineUserConfig({
  bundler: viteBundler(),
  plugins: [fileListPlugin()],
})
```

插件会在每个页面注册 `<FileList>`（以及别名 `<VPFileList>`）并引入样式，不需要再写客户端配置。

## 放进页面

```md
<FileList base="https://pan.example.com" path="/课程资料" />
```

不写 `base` 时显示内置演示数据，可以先看效果。其余属性见 [组件属性](../reference/props)。

## 支持范围

| 组合 | 支持 | 验证方式 |
| --- | --- | --- |
| VuePress 2 + `@vuepress/bundler-vite` + 默认主题 | ✅ | `pnpm test:compat:vuepress` |
| VuePress 2 + vuepress-theme-plume | ✅ | 同上 |
| VuePress 2 + vuepress-theme-hope | ✅ | 同上 |
| `@vuepress/bundler-webpack` | ⚠️ | 未测试；开发时的公开提醒不会出现 |
| VuePress 1.x | ❌ | 不支持 |

配色跟随主题：主色、文字、边框、深浅色读取主题自己的变量（VitePress 与 plume 用 `--vp-c-brand-1` 一类，默认主题与 hope 用 `--vp-c-accent` 一类）。预览 Markdown 时沿用站点的正文样式。

VuePress 2 目前仍是 RC 版本；每个主题都锁定一个 VuePress 版本，兼容性测试按主题要求的版本安装，并每天检查新版本。
