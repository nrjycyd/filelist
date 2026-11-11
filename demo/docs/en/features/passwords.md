# Folder passwords and refresh

Open a locked folder and its password box appears in the row itself; the files below do not move. The demo password is `1234`:

<FileList locale="en-US" title="Folder passwords" />

```md
<FileList base="https://pan.example.com" path="/course" />
```

## Folder passwords

- Opening a locked folder (or ticking a folder that contains one) shows the password box where size and date are, with the row height unchanged; ticking stops at a locked sub-folder and asks for its password
- Enter submits, Esc cancels; a wrong password says so in place (“Wrong password or no permission”: OpenList cannot tell the two apart)
- The key button turns on “Remember in this tab (cleared when the tab closes)”: the password goes to sessionStorage, per OpenList address and folder, and covers sub-folders; remembered folders show “Remembered · Forget”
- A remembered password that stops working is dropped, and the folder asks again
- Passwords typed on the page (remembered or not) still work after a refresh
- When the single `path` itself needs a password, the box appears where the list would be
- The `password` prop or a source's `password` can provide it in advance

## Refresh

The current list stays, dimmed, with a progress bar under the header; when the new data is ready it replaces the list in one go, keeping open folders and ticks that still exist. If the refresh fails, the old data stays and a message says why.

Refresh re-reads OpenList's folder cache (guests have no write access, so they cannot force OpenList to rescan the storage).

## Props

| Prop | Default | Description |
| --- | --- | --- |
| `password` | `''` | Folder password; readers can also type it |
| `rememberPassword` | `true` | Offer “remember in this tab”; `false` never writes to sessionStorage |

::: warning A password written on the page is public
`password` (and `password` in `sources`) is copied as is into the built site. For folders that must stay private, leave the password out and let readers type it. See [Security](../guide/security).
:::
