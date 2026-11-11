# Preview

The preview button (the eye) shows a file in a dialog on the same page: no navigation, no new tab. Only types the page can show get the button; clicking a file name still downloads it. Try “Read me.md”, then switch to “Rendered”:

<FileList locale="en-US" title="Preview" path="/Sample files" />

```md
<FileList base="https://pan.example.com" path="/course" />
```

## Supported types

| Type | Extensions (some) | How |
| --- | --- | --- |
| Images | png, jpg, gif, webp, svg, avif | `<img>`, with rotate and actual size |
| Video / audio | mp4, webm, mov / mp3, m4a, flac, wav | The browser's own player (formats as the browser supports) |
| Text | txt, md, json, csv, yaml, logs and common code | The first 1 MB only (Range request), as plain text |
| Markdown / HTML | md, markdown / html, htm | Source by default; switch to “Rendered” |
| PDF | pdf | The PDF viewer set in OpenList's `iframe_previews` if any; otherwise the browser's own reader (downloaded and shown as a Blob, up to 50 MB) |
| Anything else (Office, archives…) | — | File details and a download button |

## Source and rendered

- Rendered Markdown uses VitePress' page style and is cleaned by DOMPurify (no scripts, no event attributes). Only http(s) and mailto links are clickable and open in a new tab; relative links become text, relative images show as “[image: alt text]”. The renderer loads only when needed
- Rendered HTML runs in an iframe with an empty `sandbox`: no scripts, forms or pop-ups, and no access to the page. Relative resources the page refers to are not loaded
- The source / rendered choice is remembered on the page

## More

- In the dialog, ← / → move through the previewable files of the list; Esc or a click outside closes it
- Reading text and showing PDFs in the browser need the file address to allow CORS: through OpenList's proxy (`/p/`) that is OpenList's CORS setting; for direct storage links it is up to the storage. Otherwise the dialog says the file cannot be previewed and offers the download
- `iframe_previews` comes from `/api/public/settings`, the same setting the OpenList web UI uses; the placeholders `$url`, `$e_url`, `$b_url`, `$durl` and `$name` mean the same
