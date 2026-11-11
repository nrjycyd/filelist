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

  The files in “示例文件” (sample files) are real: preview, download and zip them. The other demo files only tell you what would happen with a real OpenList.

::::

Next: [connect OpenList](./openlist), or see every [component prop](../reference/props).

## Layout

- Wide containers: a table (check box, name, size, modified, actions) with 40px rows. Ticking files turns the toolbar into an action bar (count, total size, clear, download ZIP) in place
- Narrow containers (the component, not the window, narrower than 560px, so a squeezed sidebar layout counts too):
  - the date column is hidden; size and date move under the name
  - 56px rows; check boxes and buttons are at least 44px to tap
  - sorting moves to a drop-down
  - the action bar sticks to the top of the component, below the VitePress nav bars
- Colours come from the VitePress theme variables, so dark mode just works

The sticky offset is measured from `.VPNav` and `.VPLocalNav`. A custom theme can set it:

```css
.fl-root {
  --fl-sticky-top: 56px;
}
```
