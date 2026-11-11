# Batch download (ZIP)

Tick files or folders: the toolbar turns into an action bar; click “Download ZIP”. Try ticking “Sample files”:

<FileList locale="en-US" title="Batch download" path="/Sample files" />

```md
<FileList base="https://pan.example.com" path="/course" />
```

- Chrome and Edge (and recent Android Chrome) first open the system “Save as” dialog, then write the ZIP while downloading: little memory, no size limit
- Firefox, Safari and iPhone have to hold the files in memory before zipping. Based on the selected size: above `zipWarnSize` they ask first, above `zipMaxSize` they refuse and suggest smaller batches
- While zipping, the action bar shows progress (size and file count) and can cancel; ticks are locked meanwhile. If any file fails, the whole ZIP is cancelled and a dialog says which file and why
- Four files are fetched at a time (order kept) to cut network waits; progress updates every 100 ms
- Files are stored, not compressed (most drive files already are); ZIPs over 4 GB work (Zip64); folders are kept, and files with the same name in different folders do not overwrite each other
- Batch ZIPs download through `raw_url` (OpenList's `/p/` proxy), so CORS stays on the OpenList origin

## Single files

Click a file name or the download button: the component takes `raw_url` from `fs/get` (falling back to `/d/`) and hands it to the browser. OpenList's own `/p/` and `/d/` links download in the current page without a new tab; direct storage links open in a new tab.

## Props

| Prop | Default | Description |
| --- | --- | --- |
| `zipWarnSize` | `500` (`200` on touch devices) | Browsers that zip in memory ask first above this size (MB); `0` never asks |
| `zipMaxSize` | `2048` (`1024` on touch devices) | …and refuse above this size (MB); `0` means no limit |
