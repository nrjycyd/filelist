# Changelog

## 0.1.0 (2026-11-09)

### Features

- `<FileList>` / `<VPFileList>` component for VitePress
- OpenList tree browsing via `POST /api/fs/list`
- Single download and preview through `POST /api/fs/get` with `/d/` fallback
- Batch ZIP download (3 concurrent requests, `fflate`) with progress
- Folder password prompt and optional read-only token
- Filter, sortable name / size / modified columns
- `site_title` fallback from `GET /api/public/settings`
- Demo mode with built-in data when `base` is empty
- `vitepress-tuck` plugin entry and `enhanceAppWithFileList` for plain VitePress
