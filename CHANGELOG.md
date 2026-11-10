# Changelog

## Unreleased

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

