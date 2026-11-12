---
title: Upgrading
---

# Upgrading

## 0.10: nothing to change

Just update the version.

- New VuePress edition, [vuepress-plugin-filelist](./vuepress), released with the same version
- `vitepress` is now an optional peer dependency: VitePress sites have it installed anyway
- Colours read the theme through a layer of `--fl-c-*` variables; VitePress sites look the same

## 0.9: the public API is frozen

0.9 froze the public API for 1.0: props are unchanged; labels that were no longer shown and the exports of internal helpers were removed, and the dependency ranges were tightened. Most sites only need the new version.

### Sites using vitepress-tuck: install vitepress-tuck yourself

`vitepress-tuck` moved from the plugin's dependencies to an **optional peer dependency**. Your config already imports `defineConfig` from `vitepress-tuck`, so it is usually installed directly; if not:

::: npm-to

```sh
npm install -D vitepress-tuck
```

:::

Plain VitePress sites (registering with `enhanceAppWithFileList`) no longer install vitepress-tuck.

### Supported versions

| | 0.8 | 0.9 |
| --- | --- | --- |
| VitePress | `^1.0.0 \|\| ^2.0.0-alpha.0` | `^1.6.0 \|\| >=2.0.0-alpha.18` (no upper bound from 2) |
| vitepress-tuck | dependency | optional peer (`>=0.12.2`, no upper bound), needs VitePress 2 |
| Node | not declared | `^20.19.0 \|\| >=22.12.0` |

On VitePress 1.x, register the component the [plain way](./getting-started).

### Removed label keys

These 5 keys had not been shown for a while. If you override them in `labels`, delete them (TypeScript reports unknown keys):

| Key | What shows instead |
| --- | --- |
| `batchCount` | The selection count is in the toolbar, see `selected` |
| `unloaded` | Nothing |
| `previewFailed` | Inside the preview dialog, see `previewUnavailable` |
| `networkHint` | Appended to load failures, see `corsHint` |
| `showMore` | See `showNext`, `showAll` |

### Removed helper exports

`vitepress-plugin-filelist/client` no longer exports the helpers and types the component uses internally:

`compareNodes`, `encodePath`, `extOf`, `fileKind`, `fillPreviewUrl`, `formatDate`, `formatSize`, `iframePreviewsFor`, `joinPath`, `previewKind`, `totalSize`, `uniqueEntryName`, `zipEntryName`, `zipSegment`, and the types `FileKind`, `IframePreview`, `PreviewKind`, `SortableNode`, `SortKey`, `OpenListEntry`.

The docs never promised them. If your theme used one, implement it in your own code; they are small pure functions you can copy from the [source](https://github.com/nrjycyd/filelist/blob/v0.8.0/src/client/utils.ts).

What is still exported: [Exports and compatibility](../reference/exports).
