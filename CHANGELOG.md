# Changelog

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

