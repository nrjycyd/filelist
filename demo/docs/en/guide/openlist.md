# Connect OpenList

The component calls the OpenList API straight from the reader's browser. It works with [OpenList](https://github.com/OpenListTeam/OpenList) and its Workers edition [OpenList-Worker](https://github.com/OpenListTeam/OpenList-Worker), which this plugin is tested on.

```md
<FileList base="https://pan.example.com" path="/course" title="Course materials" locale="en-US" />
```

## 1. Enable guest and limit its base path

A docs site is a public static page: readers see OpenList as its **guest** user.

- Enable `guest` under Users in the OpenList admin (a fresh OpenList-Worker has it off)
- **Set guest's base path to the folder you want to publish.** Nothing outside it is visible to readers; this is the setting that really limits access
- Turn off guest's write permissions (upload, rename, move, copy, delete, offline download, WebDAV / FTP management)

::: tip Browsing, preview and download cannot be switched off
OpenList's permission switches cover writing, skipping passwords, seeing hidden files and so on. As long as guest is enabled, it can list, preview and download everything under its base path, exactly like a signed-out visitor of the OpenList web UI. Protect sub-folders with [folder passwords](../features/passwords), hide files with OpenList's meta rules.
:::

## 2. Allow cross-origin requests (CORS)

- OpenList: `cors.allow_origins` must include your docs site's origin (`*` by default)
- OpenList-Worker: the `ALLOW_URLS` variable, a comma-separated list of full origins without wildcards, e.g. `https://docs.example.com,http://localhost:5173`. For GitHub Pages use `https://<user>.github.io`, origin only, no path

When a request fails with “Failed to fetch”, the component points to these two settings. GET requests carry no `Content-Type`, so they need no preflight.

## 3. Both on HTTPS

An HTTPS page cannot call an HTTP OpenList; the browser blocks mixed content.

## Tokens and passwords

You can pass `token` or `password`, but they are copied into the built site where every reader can see them. When that is acceptable and how to do it safely: [Security](./security).

## API used

| Endpoint | Used for |
| --- | --- |
| `POST /api/fs/list` | Folder listing (`per_page: 0`) |
| `POST /api/fs/get` | `raw_url` for download, preview and ZIP; falls back to `/d/...?sign=` |
| `GET /api/public/settings` | `site_title`, `iframe_previews` |
| `GET /d/...`, `GET /p/...` | File addresses read by download and preview |

## A real OpenList

This one reads OpenList's public demo `demo.oplist.org`; its content and availability are up to them:

<FileList base="https://demo.oplist.org" path="/" title="OpenList demo" locale="en-US" />

```md
<FileList base="https://demo.oplist.org" path="/" title="OpenList demo" locale="en-US" />
```
