# Using with VuePress

VuePress 2 sites install **vuepress-plugin-filelist**. It is the same component as vitepress-plugin-filelist, with the same version number, released together; props, labels and features are identical, so the rest of these docs apply.

## Install

::: npm-to

```sh
npm install -D vuepress-plugin-filelist
```

:::

VitePress is not installed along with it.

## Register

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

The plugin registers `<FileList>` (and the alias `<VPFileList>`) on every page and loads the styles; no client config needed.

## Add it to a page

```md
<FileList base="https://pan.example.com" path="/course" locale="en-US" />
```

Without `base` it shows the built-in demo data, so you can try it first. All props are in [Component props](../reference/props).

## What is supported

| Setup | Supported | Checked by |
| --- | --- | --- |
| VuePress 2 + `@vuepress/bundler-vite` + default theme | ✅ | `pnpm test:compat:vuepress` |
| VuePress 2 + vuepress-theme-plume | ✅ | same |
| VuePress 2 + vuepress-theme-hope | ✅ | same |
| `@vuepress/bundler-webpack` | ⚠️ | not tested; the development warning about public tokens does not show |
| VuePress 1.x | ❌ | not supported |

Colours follow the theme: brand colour, text, borders and light / dark come from the theme's own variables (`--vp-c-brand-1` and friends in VitePress and plume, `--vp-c-accent` and friends in the default theme and hope). Markdown previews use the site's own page style.

VuePress 2 is still a release candidate; each theme pins one VuePress version, so the compatibility check installs the version the theme asks for and checks for new releases every day.
