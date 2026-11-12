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

<p align="center"><a href="./README.md">English</a> · 简体中文</p>

<p align="center">面向 VitePress 与 VuePress 的 OpenList 文件浏览组件：在文档页里浏览、预览、批量下载 OpenList 上的文件。</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nrjycyd/vitepress-plugin-filelist/main/demo/docs/public/screenshot.png" alt="文件列表截图" width="640">
</p>

## 功能

- 树形目录、按需加载；勾选文件或文件夹批量打包 ZIP
- 弹窗预览：图片、音视频、文本、PDF、Markdown / HTML
- 目录密码、筛选与深度搜索、大目录分页
- 跟随站点主题的配色与亮 / 暗模式（VitePress，或 VuePress 的默认主题、plume、hope），手机自动切换布局

## 文档与在线演示

👉 **[nrjycyd.github.io/vitepress-plugin-filelist](https://nrjycyd.github.io/vitepress-plugin-filelist/)**：安装、配置、全部属性，每个功能都有可操作的示例。

```bash
pnpm add -D vitepress-plugin-filelist
```

用 **VuePress 2**？请安装 [`vuepress-plugin-filelist`](./packages/vuepress-plugin-filelist/README-zh-CN.md)：同一个组件，一起发布（[使用说明](https://nrjycyd.github.io/vitepress-plugin-filelist/guide/vuepress)）。

## 后端

- 接口：[OpenList](https://github.com/OpenListTeam/OpenList)
- 实测部署：[OpenList-Worker](https://github.com/OpenListTeam/OpenList-Worker)

## 更多

[更新日志](./CHANGELOG.md) · [参与开发](./CONTRIBUTING.md) · [MIT License](./LICENSE)
