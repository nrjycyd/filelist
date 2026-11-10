# Changelog

## Unreleased

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

