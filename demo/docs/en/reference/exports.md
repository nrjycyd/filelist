# Exports and compatibility

## Exports

| Entry | Contents |
| --- | --- |
| `vitepress-plugin-filelist` | `fileList`: the vitepress-tuck plugin (also the default export) |
| `vitepress-plugin-filelist/client` | Components `FileList`, `VPFileList`; registrar `enhanceAppWithFileList`; label tools `fileListLocales`, `formatLabel`, `resolveLabels`; types `FileListProps`, `FileListSource`, `FileListLabels`, `FileListLocale` |
| `vitepress-plugin-filelist/style.css` | Component styles (import it yourself with the plain registration) |

That is the whole public API, kept with semantic versioning from 1.0: new props and label keys come in minor releases, removals and renames only in major ones. Everything else (path and format helpers, the tree, the OpenList client) may change in any release; please don't import from `dist`.

## Compatibility

| Setup | Supported | Checked by |
| --- | --- | --- |
| VitePress 2 (`>=2.0.0-alpha.18`) + vitepress-tuck | ✅ | The docs site and browser tests (Chromium desktop / mobile, WebKit) |
| VitePress 2, plain registration | ✅ | `pnpm test:compat` (2.0.0-alpha.21) |
| VitePress 1.6, plain registration | ✅ | `pnpm test:compat` (1.6.4) |
| VitePress 1.6 + vitepress-tuck | ❌ | vitepress-tuck itself needs VitePress 2 |
| VitePress 1.5 and older | ❌ | Not tested, outside `peerDependencies` |
| VuePress 2 (default theme / plume / hope) | ✅ | Use [vuepress-plugin-filelist](../guide/vuepress); `pnpm test:compat:vuepress` |
| The sites above built on Node 20.19 | ✅ | CI's node20 job (plugin built on Node 22, sites built and checked on Node 20.19) |

From VitePress 2 on there is no upper bound, so a new VitePress release needs no change here. The repository checks the newest VitePress on npm (`latest` and `next`) every day and runs the compatibility test when a new version appears; Dependabot keeps the docs site on the newest version too, so a breaking release shows up early.

`pnpm test:compat` installs the packed plugin into fresh VitePress sites, builds them and checks rendering, opening folders, preview and ZIP in a browser, and that the development-only public-props warning appears under `vitepress dev` only.

| Dependency | Range |
| --- | --- |
| `vitepress` (peer) | `^1.6.0 \|\| >=2.0.0-alpha.18`: 1.6 and later 1.x, and every release from 2.0.0-alpha.18 on (future 3.x and 4.x included) |
| `vue` (peer) | `^3.5.0` |
| `vitepress-tuck` (optional peer) | `>=0.12.2`, no upper bound; only needed when registering through vitepress-tuck |
| Node | `^20.19.0 \|\| >=22.12.0` |

Package managers, checked locally on Node 22 with VitePress `2.0.0-alpha.21`:

| Package manager | Install | Build |
| --- | --- | --- |
| npm 10 | ✅ | ✅ |
| pnpm 11.25 | ✅ | ✅ |
| yarn 1.22 (classic) | ✅ | ✅ |
| bun 1.4 | ✅ | ✅ |
| deno 2.9 | ✅ `deno install` | ❌ Vite/rolldown fails loading the config |

Deno can install npm packages, but building VitePress with Deno currently fails in rolldown with `stream did not contain valid UTF-8`; build with Node.
