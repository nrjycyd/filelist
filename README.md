<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/wordmark-dark.svg?sanitize=true">
    <img src="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/wordmark.svg?sanitize=true" alt="FileList" width="240">
  </picture>
</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/vitepress-plugin-filelist"><img src="https://img.shields.io/npm/v/vitepress-plugin-filelist?label=vitepress-plugin-filelist" alt="vitepress-plugin-filelist on npm"></a>
  <a href="https://www.npmjs.com/package/vuepress-plugin-filelist"><img src="https://img.shields.io/npm/v/vuepress-plugin-filelist?label=vuepress-plugin-filelist" alt="vuepress-plugin-filelist on npm"></a>
  <a href="https://github.com/nrjycyd/vitepress-plugin-filelist/actions/workflows/ci.yml"><img src="https://github.com/nrjycyd/vitepress-plugin-filelist/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/vitepress-plugin-filelist" alt="license"></a>
</p>

<p align="center">English · <a href="https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/README-zh-CN.md">简体中文</a></p>

<p align="center">An OpenList file browser for VitePress and VuePress: browse, preview, search and batch-download OpenList files right in a docs page.</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/screenshot-en.png" alt="File list screenshot" width="640">
</p>

## Features

- Folder tree loaded on demand; tick files or folders and download them as one ZIP
- Preview in a dialog: images, audio, video, text, PDF, Markdown / HTML
- Folder passwords, filter and deep search, paging for long folders
- Follows the site theme's colours and light / dark mode (VitePress, or VuePress with the default theme, plume or hope); a compact layout on phones

## Docs and live demo

👉 **[nrjycyd.github.io/vitepress-plugin-filelist/en/](https://nrjycyd.github.io/vitepress-plugin-filelist/en/)**: install, setup, every prop, and live examples.

```bash
npm install -D vitepress-plugin-filelist
```

Works with VitePress 1.6+ (register with `enhanceAppWithFileList`) and VitePress 2 (also as a [vitepress-tuck](https://github.com/pengzhanbo/vitepress-tuck) plugin).

On **VuePress 2**? Install [`vuepress-plugin-filelist`](https://github.com/nrjycyd/vitepress-plugin-filelist/tree/main/packages/vuepress-plugin-filelist) instead: the same component, released together ([guide](https://nrjycyd.github.io/vitepress-plugin-filelist/en/guide/vuepress)).

## Backend

- API: [OpenList](https://github.com/OpenListTeam/OpenList)
- Tested on: [OpenList-Worker](https://github.com/OpenListTeam/OpenList-Worker)

## More

[Changelog](https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/CHANGELOG.md) · [Contributing (Chinese)](https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/CONTRIBUTING.md) · [MIT License](https://github.com/nrjycyd/vitepress-plugin-filelist/blob/main/LICENSE)
