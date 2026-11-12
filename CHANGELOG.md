# Changelog

## Unreleased

### Accessibility

- Keyboard focus no longer drops to the top of the page when the control it was on goes away. It moves to the nearest control that still makes sense:
  - after unlocking a folder (or cancelling the password), to that folder's button
  - after “Show all”, to the first row that appeared
  - after the × in the filter box, to the filter box
  - after “Clear”, to the “select all” box
  - after a ZIP finishes or is cancelled, and after “Show less” and deep search links, likewise to the nearest control
- The column the list is sorted by tells screen readers its direction (“Name, ascending”); the invalid `aria-sort` on a button is gone
- “Clear” in the selection bar is announced as “清除选择 / Clear selection”, so its name contains the visible text (voice control)
- The grey file-type badge on a selected row has enough contrast (4.5:1)
- New label keys `sortedAscending` and `sortedDescending`
- Browser tests run axe-core on the list in its main states
- Docs site: the logo next to the site title has no alt text, so “FileList” is not read twice

## 0.10.2 (2026-11-12)

- The repository is now [nrjycyd/filelist](https://github.com/nrjycyd/filelist) and the docs are at [nrjycyd.github.io/filelist](https://nrjycyd.github.io/filelist/). Links to the old repository redirect; links to the old docs address (`nrjycyd.github.io/vitepress-plugin-filelist`) no longer work. Package names are unchanged
- Release workflow: each package is skipped when its version is already on npm, so a failed run can be re-run

## 0.10.1 (2026-11-12)

- First release of **vuepress-plugin-filelist** on npm. In 0.10.0 only vitepress-plugin-filelist reached npm (the VuePress package's trusted publisher was not set up yet), so both packages are released again together. No code changes

## 0.10.0 (2026-11-12)

### Features

- New package **vuepress-plugin-filelist**: the same component for VuePress 2 (`@vuepress/bundler-vite`), released together with vitepress-plugin-filelist under the same version. Register it with `plugins: [fileListPlugin()]`; tested with the default theme, vuepress-theme-plume and vuepress-theme-hope
- Colours read the site theme through a small layer of `--fl-c-*` variables: VitePress / plume names first, then the VuePress default theme / hope names. Dark mode also follows `data-theme="dark"`. VitePress sites look the same as before
- The selection bar's sticky offset also measures VuePress navbars

### Changes

- `vitepress` is now an optional peer dependency, so VuePress sites do not get VitePress installed
- `enhanceAppWithFileList` takes any `{ app }` (VitePress' `enhanceApp` context still works)
- The demo Markdown file says "the site's page style" instead of "VitePress' page style"

### Docs

- New page: Using with VuePress (Chinese and English); the compatibility table lists VuePress 2

## 0.9.5 (2026-11-11)

### Features

- Demo mode follows `locale`: with `locale="en-US"` the demo folders and files have English names (“Sample files”, “Photos (260)”, “Locked (password 1234)”…), and the sample files themselves are in English

### Docs

- The rest of the docs are in English too: the six feature pages, FAQ, upgrading to 0.9, locales and labels, exports and compatibility; the English sidebar no longer links to Chinese pages
- `README.md` shows an English screenshot
- Component props: the ZIP sizes no longer show a stray `@unit MB` (vitepress-plugin-field 0.12.2 does not support it yet; the unit is in the description)
- Exports and compatibility: building the site on Node 20.19 is listed as checked in CI

## 0.9.3 (2026-11-11)

### Fixes

- File links are reused for 10 minutes, then asked for again: many storage drivers hand out direct links that expire, so a page left open for hours could preview or download from a dead link until it was refreshed
- An OpenList request that does not answer within 30 s fails (the list shows “retry”) instead of loading forever
- Only `http(s):` and `blob:` file links are opened, previewed or zipped; anything else from the server (such as `javascript:`) falls back to OpenList's signed `/d/` link

### Internal

- ESLint (`@antfu/eslint-config`, correctness rules only; the code keeps its formatting) with `pnpm lint`; TypeScript `noUnusedLocals` / `noUnusedParameters`
- `scripts/compat.mjs` can skip the build (`COMPAT_SKIP_BUILD=1`), so CI can build with Node 22 and run the test sites on Node 20.19, the oldest Node in `engines` (checked: VitePress 1.6.4 and 2.0.0-alpha.21 pass)
- Removed leftovers: an unused binding in `FileList.vue`, `fflate` from the build externals; the package description matches the docs

## 0.9.2 (2026-11-11)

### Fixes

- The npm page showed the Chinese README: npm takes any root `README.*` file as the package README and picked `README.zh-CN.md`. The Chinese README is now `README-zh-CN.md`, so npm always shows the English `README.md`

## 0.9.1 (2026-11-11)

### Docs

- English docs at `/en/` (home, getting started, connect OpenList, security, component props) with a language switch; Chinese stays at the root, so existing links keep working. The home page demo follows the page language
- `README.md` is now in English (shown on npm), with the Chinese version in `README.zh-CN.md`
- Docs use vitepress-tuck's Markdown extensions: `::: npm-to` install tabs, `:::: steps`, and `::: field` for every prop

### Internal

- Size budget test (`size.spec.ts`): the built browser bundle, styles and Node entry must stay within their gzip budgets, and markdown-it, DOMPurify and client-zip must stay lazily loaded; CI and the release workflow fail otherwise
- CONTRIBUTING: a manual regression checklist for a real OpenList-Worker, to run before each release candidate and release
- `FileList.vue` split into `useTree`, `useDeepSearch`, `useRows`, `useSelection`, `useDownloads` and `usePreview` (1,107 → 200 lines of script); behaviour unchanged

## 0.9.0 (2026-11-11)

This release freezes the API for 1.0: props are unchanged; unused labels and internal helpers are no longer public. See “升级到 0.9” in the docs.

### Breaking

- `vitepress-tuck` is now an optional peer dependency (`>=0.12.2`, no upper bound) instead of a dependency. Sites that register the plugin with vitepress-tuck install it themselves (`pnpm add -D vitepress-tuck`; most already do, since their config imports `defineConfig` from it); plain VitePress sites no longer install it, so VitePress 1.x no longer warns about its peer range
- Supported versions: `vitepress` `^1.6.0 || >=2.0.0-alpha.18` (was `^1.0.0 || ^2.0.0-alpha.0`; 1.5 and older were never tested, and from 2.0.0-alpha.18 on there is no upper bound, so new VitePress majors need no release), Node `^20.19.0 || >=22.12.0` (new `engines`). vitepress-tuck needs VitePress 2; on VitePress 1.6 use `enhanceAppWithFileList`
- Removed the labels `batchCount`, `unloaded`, `previewFailed`, `networkHint` and `showMore`; none was shown any more
- `vitepress-plugin-filelist/client` no longer exports internal helpers (`compareNodes`, `encodePath`, `extOf`, `fileKind`, `fillPreviewUrl`, `formatDate`, `formatSize`, `iframePreviewsFor`, `joinPath`, `previewKind`, `totalSize`, `uniqueEntryName`, `zipEntryName`, `zipSegment`) or the types `FileKind`, `IframePreview`, `PreviewKind`, `SortableNode`, `SortKey`, `OpenListEntry`. The public API is the components, `enhanceAppWithFileList`, `fileListLocales` / `formatLabel` / `resolveLabels` and the `FileList*` types

### Features

- Under `vitepress dev`, a page whose `<FileList>` sets `token` or `password` logs one console warning that these are copied into the built site for every visitor to read. Production builds stay silent

### Docs

- New “安全与权限” page: what a static site makes public (`token`, `password`), guest with a base path as the recommended setup, what the component stores in the browser. The token notes moved there from “接入 OpenList”; the `password` prop docs now warn that it is public
- New “升级到 0.9” page; “导出与兼容性” lists the public API and the tested VitePress / Node versions
- `pnpm test:compat` installs the packed plugin into fresh VitePress 1.6 and 2.x sites (plain registration), builds them and checks them in Chromium; `COMPAT_VITEPRESS=latest,next` tests the newest releases
- Dependabot keeps the docs site (daily) and dev setup (weekly) on the newest vitepress / vitepress-tuck / vue through pull requests
- Home page: title “文档页里的 OpenList 文件浏览器”, a tagline listing what it does, “FileList” in the plugin's rose, and lines that break between words only
- Project logo: a ring in the colours of OpenList, VitePress and Cloudflare, with the plugin's own rose list card in the middle and four dots for what comes next. The README opens with the logo and name (light and dark versions); the docs site shows it in the nav and on the home page, and has a favicon, an iOS home-screen icon and a link preview image (`demo/docs/public`)

## 0.8.0 (2026-11-11)

### Features

- Demo data (no `base`) now has a “示例文件” folder of small real files (Markdown, HTML, SVG, PDF, text): they preview, download and zip for real, served as blob: URLs; other demo files still only describe what would happen. Also a 260-file folder for trying “show more”

- Long folders: while a folder's files are cut at `pageSize`, the last row reads as one more row of the folder (“⋯” in the file-type column, “还有 245 项” where names start) with quiet “再显示 15 项” and “全部显示” links (“+15 / 全部” on phones, still 44px-tall targets); once everything is shown the list simply ends
- Long folders can go back: once more than the first page is shown, scrolling through the folder pins its row at the top (below the theme's bars and the phone selection bar) with “已显示 30 / 260 项 · 收起”; “收起” returns to the first page and to the folder's row. Closing a folder with its arrow also resets it to the first page. New labels `showLess`, `allShown`, `moreShown`, `showNext`, `showNextShort`, `showAllShort`; `showMore` is no longer shown

### Changes

- `pageSize` now defaults to 15 (was 200), so lists in articles stay short; set `:page-size="200"` for the old behaviour

### Docs

- The demo site is now the documentation site, with a sidebar, local search, the version in the nav and a live example on each feature page
- README trimmed to an overview with links to the docs; development notes moved to CONTRIBUTING.md; `homepage` points to the docs site

## 0.7.2 (2026-11-11)

### Fixes

- The deep search status line was almost twice as tall as a row: VitePress' page styles gave it 16px paragraph margins above and below, overriding the component's own. It is now one row high on wide lists (40px) and 48px on phones, growing only when the text wraps
- The same margins padded the confirm dialog's title and text, the hints under a loading error and the notes in the preview; the component's text no longer uses tags that VitePress' page styles reach, and a unit test guards the templates

## 0.7.1 (2026-11-11)

### Fixes

- Deep search on phones: after a refresh the status line could push its button off screen. The status line is now one centred sentence that wraps, with the action as an inline link
- Refresh dropped what deep search had read, so results vanished; in deep search mode a refresh now re-reads those folders before swapping the tree in, and the folder counts stay the same
- Locked folders skipped by deep search were hidden by the filter; they now show in the results, locked, marked “Not searched (password needed)”, and can be unlocked in place

### Features

- Deep search mode: after the first “Try deep search”, new keywords, refreshes and newly unlocked folders are searched automatically until the filter is cleared; “Stop” pauses until “Continue”
- `deepSearch` prop: `'auto'` enters deep search mode as soon as a keyword is typed (default `'manual'`)
- An × in the filter box (and Esc) clears the filter
- New labels `deepLocked`, `clearFilter`; `deepHint` / `deepSearch` reworded to read as one sentence (“只筛选了已加载的内容，尝试深度搜索”)

## 0.7.0 (2026-11-10)

### Features

- Markdown and HTML previews can switch between source (default) and rendered. Markdown uses VitePress' doc style, is sanitised with DOMPurify (rendering is refused if the sanitiser does not work), keeps only http(s) / mailto links (new tab) and shows relative images as their alt text; markdown-it and DOMPurify load on demand. HTML renders in an empty-`sandbox` iframe: no scripts, forms or popups, no access to the page. The choice is kept while the page is open
- Deep search: when the filter can only see loaded folders, “Deep search” loads the remaining sub-folders under the mounted paths (four at a time, `deepSearchLimit` per run, default 500) and matches appear in place, as normal rows. Stop / Continue; locked folders are skipped and counted. No OpenList search index needed
- Filter matches are highlighted
- Name sorting follows `locale`: pinyin for `zh-CN`, alphabetical for `en-US`, numbers in natural order either way; `compareNodes` takes an optional locale
- New labels: `deepHint`, `deepSearch`, `deepRunning`, `deepStop`, `deepDone`, `deepCapped`, `deepContinue`, `deepSkipped`, `deepFailed`, `viewMode`, `viewSource`, `viewRendered`, `htmlSandboxNote`, `imageOmitted`

### Internal

- Browser tests (Playwright) run in CI on every push and PR: a fixture site in `demo/e2e` against a mock OpenList, in Chromium desktop, a phone profile and WebKit, all required. They check row heights and zero shift, folder passwords, refresh, show more, single downloads staying on the page with an on-screen toast, and ZIPs (in memory, streamed, cancelled, failed)

## 0.6.2 (2026-11-10)

### Fixes

- Toasts are pinned to the bottom of the screen instead of the bottom of the card, so they stay visible when a long folder pushes the card's end off screen
- A failed batch ZIP opens a dialog with the reason (which file, which error) and a hint to retry with fewer files, instead of a toast that was easy to miss (new labels `batchFailedTitle`, `batchFailedHint`)

## 0.6.1 (2026-11-10)

### Fixes

- Single-file downloads no longer flash a new tab: OpenList's own `/p/` and `/d/` links (always attachments) download in place; storage providers' direct links still open in a new tab so the page is never replaced. A toast confirms the hand-off (new label `downloadStarted`)

### Performance

- Batch ZIP fetches four files at a time (order in the ZIP unchanged): 300 small files over a 40 ms link went from about 31 s to 7 s
- Batch progress updates at most every 100 ms instead of on every chunk

## 0.6.0 (2026-11-10)

### Features

- Batch ZIP streams straight to disk in Chrome / Edge (system “Save as” dialog, no size limit, tiny memory use)
- Browsers that must zip in memory (Firefox, Safari, iPhone) ask first above `zipWarnSize` and refuse above `zipMaxSize` (MB; 500 / 2048 by default, 200 / 1024 on touch devices; `0` disables each)
- Batch progress shows bytes and file counts in the selection bar, with a Cancel button; selection is locked while zipping
- Long folders show `pageSize` rows (default 200; `0` = all) followed by “N more · Show more · Show all”; filtering shows every match, folder checks include hidden files, and the shown count survives refreshes
- New labels: `batchProgress`, `batchDone`, `batchCanceled`, `zipWarnTitle`, `zipWarnText`, `zipStreamTip`, `zipContinue`, `zipBlockTitle`, `zipBlockText`, `gotIt`, `moreRemaining`, `showMore`, `showAll`, `showRest`

### Changes

- ZIPs are built with `client-zip` instead of `fflate`: files are stored (not compressed) and streamed one after another; archives over 4 GB use Zip64

## 0.5.1 (2026-11-10)

### Fixes

- In `sources` mode, a source root unlocked with a typed (not remembered) password locked again on refresh; all password lookups now go through one resolver
- Password error messages are linked to their input with per-instance ids (`useId`): paths with spaces broke `aria-describedby`, and several lists on one page could share an id
- Safari's “Load failed” now shows the CORS hint on first load too (one network-error check instead of two)
- A 0-byte file shows “0 B” instead of “-”: `formatSize(0)` now returns `0 B`; missing or negative sizes still read “-”
- The ZIP's blob URL is released after 30 s instead of right after the click, which could cancel the download in some browsers

### Changes

- Network-failure toasts append `corsHint`; `networkHint` is deprecated
- `vitepress-plugin-filelist/client` lists its exports explicitly (same names as before); internal helpers are no longer exported by accident
- One extension table drives badges and previews: `markdown`, `vue`, `mjs`, `toml`, `ini` and similar now get a doc / code badge, `m4v` / `ogv` a media badge
- The preview button's class is `fl-preview-btn` (was `fl-download`, same as the download button)

### Internal

- `FileList.vue` split into `api.ts`, `demo.ts`, `tree.ts`, `usePasswords.ts`, `download.ts` and `Icon.vue`; the folder and single-path unlock flows share one implementation
- Folder counts, sizes and check states come from one pass over the tree instead of walking each subtree several times per row
- `typecheck` runs `vue-tsc` (templates and tests included) in CI and release; removed dead code in `tsdown.config.ts`

## 0.5.0 (2026-11-10)

### Features

- Refresh keeps the current rows (dimmed) with a progress bar under the header, then swaps in the new tree at once; open folders and surviving selections are kept, and a failed refresh keeps the old data with a toast
- Folder passwords are asked for in the folder's own row (in place of size / date), so rows below never move; Enter submits, Esc cancels, a wrong password shows “password is incorrect or no permission” in place
- Optional “remember in this tab” key toggle (sessionStorage, per OpenList base and folder, covers sub-folders); remembered folders show “Remembered · Forget”; stale saved passwords are dropped with a hint; new prop `rememberPassword` (default `true`)
- Checking a folder stops at a locked sub-folder and asks for its password instead of failing
- A single `path` that needs a password shows the prompt in place of the list
- New labels: `refreshing`, `refreshFailed`, `cancel`, `passwordFor`, `passwordWrong`, `passwordStale`, `rememberPassword`, `remembered`, `forgetPassword`, `unlockFolder`, `networkHint`

### Fixes

- “Failed to fetch” errors now hint at `cors.allow_origins` / OpenList-Worker `ALLOW_URLS`
- An empty loaded total shows “0 B” instead of “-”
- GET requests no longer send `Content-Type: application/json`, avoiding a needless CORS preflight
- Removed the global password bar that pushed the list down
- zh-CN `passwordPlaceholder` is now “输入密码” so it fits the phone-width input

## 0.4.0 (2026-11-10)

### Features

- In-page preview dialog (native `<dialog>`, no navigation or new tab): images (rotate, actual size), video, audio, text (first 1 MB via a Range request) and PDF (OpenList's `iframe_previews` viewer, else the browser reader through a Blob up to 50 MB)
- Office and other types are not previewed: no preview button, and the dialog shows file info with a download button when it cannot render a file (failure, too large)
- ← / → steps through the previewable files in the list; Esc or a backdrop click closes; full screen on phones
- New labels: `close`, `previous`, `next`, `rotate`, `actualSize`, `previewUnsupported`, `previewUnavailable`, `previewTooLarge`, `textTruncated`; `previewFailed` is deprecated

### Fixes

- The preview button no longer downloads the file: OpenList serves `/p/` and `/d/` with `Content-Disposition: attachment`, so opening `raw_url` in a new tab always downloaded

## 0.3.1 (2026-11-10)

### Style

- Folder names in the list are no longer bold
- Removed the footer hint “N folder(s) not expanded, excluded from select-all”; the `unloaded` label is deprecated

## 0.3.0 (2026-11-10)

### Features

- Redesigned UI (compact table): 40px rows, fixed-width type badges coloured by file family so names line up, indent guide lines, icon buttons, folder file counts and a footer with the loaded total size
- Selecting files turns the toolbar into an action bar (count, total size, clear, Download ZIP); the disabled batch button is gone
- Narrow containers (< 560px, container query): two-line rows with size and date under the name, 44px touch targets, a compact sort select, and a selection bar that sticks below the VitePress nav / local nav (`--fl-sticky-top` to override)
- New labels: `clear`, `clearSelection`, `totalSize`, `folderItems`, `sortBy`, `selectAll`, `selectItem`, `expand`, `collapse`; zh-CN `batch` is now “下载 ZIP”; `batchCount` is deprecated

## 0.2.3 (2026-11-10)

### Bug Fixes

- Batch ZIP keeps the folder structure, so same-named files from different folders or sources no longer overwrite each other; entry names are sanitised and de-duplicated
- Checking a folder now loads its whole subtree and selects every nested file, not just the first level
- Multi-source mode: sources without their own `password` fall back to the component / runtime password, and a password-protected folder now shows the password prompt

### Tests

- Component tests for `FileList` (`@vue/test-utils` + `happy-dom`)

## 0.1.0 (2026-11-09)

### Features

- `<FileList>` / `<VPFileList>` component for VitePress
- OpenList tree browsing via `POST /api/fs/list`
- Single download and preview through `POST /api/fs/get` with `/d/` fallback
- Batch ZIP download (3 concurrent requests, `fflate`) with progress
- Folder password prompt and optional read-only token
- Filter, sortable name / size / modified columns
- i18n presets (`zh-CN`, `en-US`) and per-key `labels` overrides
- `site_title` fallback from `GET /api/public/settings`
- Demo mode with built-in data when `base` is empty
- `vitepress-tuck` plugin entry and `enhanceAppWithFileList` for plain VitePress
- Vitest coverage for path/format/sort helpers and locale resolution
- GitHub Actions: CI (build + typecheck + tests + demo) and demo Pages deploy

