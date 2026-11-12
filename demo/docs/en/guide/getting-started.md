---
title: Getting started
---

# Getting started

:::: steps

- Install

  ::: npm-to

  ```sh
  npm install -D vitepress-plugin-filelist
  ```

  :::

- Register the component

  **Plain VitePress** (1.6 or later, including VitePress 2):

  ```ts [.vitepress/theme/index.ts]
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

  **With [vitepress-tuck](https://github.com/pengzhanbo/vitepress-tuck)** (VitePress 2; install `vitepress-tuck` yourself, it is an optional dependency):

  ```ts [.vitepress/config.ts]
  import { defineConfig } from 'vitepress-tuck'
  import fileList from 'vitepress-plugin-filelist'

  export default defineConfig({
    plugins: [fileList()],
  })
  ```

  ```ts [.vitepress/theme/index.ts]
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

- Put it on a page

  ```md
  <FileList base="https://pan.example.com" path="/course" locale="en-US" />
  ```

  `base` is your OpenList address. Without `base` the component shows built-in demo data, handy before OpenList is ready:

  <FileList locale="en-US" title="Course materials (demo)" />

  ```md
  <FileList locale="en-US" title="Course materials (demo)" />
  ```

  The files in “Sample files” are real: preview, download and zip them. The other demo files only tell you what would happen with a real OpenList.

::::

Next: [connect OpenList](./openlist), or see every [component prop](../reference/props).

## Layout

- Wide containers: a table (check box, name, size, modified, actions) with 40px rows. Ticking files turns the toolbar into an action bar (count, total size, clear, download ZIP) in place
- Narrow containers (the component, not the window, narrower than 560px, so a squeezed sidebar layout counts too):
  - the date column is hidden; size and date move under the name
  - 56px rows; check boxes and buttons are at least 44px to tap
  - sorting moves to a drop-down
  - the action bar sticks to the top of the component, below the site's nav bars (VitePress, or the VuePress theme's)
- Colours come from the site theme's variables (VitePress, or VuePress with the default theme, plume or hope), so dark mode just works

The sticky offset is measured from the nav bars (`.VPNav` and `.VPLocalNav` in VitePress, `.vp-navbar`, `.vp-nav` and `.vp-local-nav` in VuePress themes). A custom theme can set it:

```css
.fl-root {
  --fl-sticky-top: 56px;
}
```

## Keyboard

The list is a single Tab stop: Tab lands on a row, Tab again leaves the list. While keyboard focus is in the list, the footer shows a key hint (not with a mouse or touch).

| Keys | What they do |
| --- | --- |
| ↑ ↓ | Previous / next row; Home / End for the first and last, PageUp / PageDown jump 10 rows |
| → | Folder: open it (a locked one asks for its password), or go to its first item when open; file: go to the row's Preview and Download buttons |
| ← | Open folder: close it; otherwise go to the parent folder; on a button: back to the row |
| Space | Tick / untick |
| Enter | Folder: open / close; file: preview when it can, else download; “N more” row: the next page |
| Typing | Jump to the next row whose name starts with what you typed; the same letter again goes on to the next one |
| Ctrl+A (Mac: ⌘A) | Tick everything, again to untick; only while keyboard focus is on a row, elsewhere it stays the browser's select-all |

Screen readers hear a tree grid, and each row's name, size, date, level, and open and ticked states.
