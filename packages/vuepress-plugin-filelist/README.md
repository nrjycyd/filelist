<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/wordmark-dark.svg?sanitize=true">
    <img src="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/wordmark.svg?sanitize=true" alt="filelist" width="420">
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/vuepress-plugin-filelist"><img src="https://img.shields.io/npm/v/vuepress-plugin-filelist" alt="npm"></a>
  <a href="https://github.com/nrjycyd/vitepress-plugin-filelist/actions/workflows/ci.yml"><img src="https://github.com/nrjycyd/vitepress-plugin-filelist/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/vuepress-plugin-filelist" alt="license"></a>
</p>

<p align="center">English · <a href="https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/packages/vuepress-plugin-filelist/README-zh-CN.md">简体中文</a></p>

<p align="center">An OpenList file browser for VuePress 2: browse, preview, search and batch-download OpenList files right in a docs page.</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/screenshot-en.png" alt="File list screenshot" width="640">
</p>

This is the VuePress edition of [vitepress-plugin-filelist](https://www.npmjs.com/package/vitepress-plugin-filelist): the same component and version, released together.

## Install

```bash
npm install -D vuepress-plugin-filelist
```

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

Then on any page:

```md
<FileList base="https://pan.example.com" path="/course" locale="en-US" />
```

Tested with the default theme, vuepress-theme-plume and vuepress-theme-hope on `@vuepress/bundler-vite`. Colours and light / dark follow the theme.

## Docs

👉 **[Using with VuePress](https://nrjycyd.github.io/vitepress-plugin-filelist/en/guide/vuepress)**, and every prop in [Component props](https://nrjycyd.github.io/vitepress-plugin-filelist/en/reference/props).

## More

[Changelog](https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/CHANGELOG.md) · [MIT License](https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/LICENSE)
