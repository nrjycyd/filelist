# Keyboard

The list works fully from the keyboard and is a single Tab stop: Tab lands on a row, the arrow keys move between rows, and Tab again leaves the list, however many rows are open.

Try it: click the filter box below and press Tab a few times until a row gets a focus ring, then use the arrow keys, Space and Enter. While keyboard focus is in the list, the footer shows a key hint.

<FileList title="Keyboard demo" locale="en-US" />

## Keys

| Keys | Folder row | File row | “N more” row |
| --- | --- | --- | --- |
| ↑ ↓ | Previous / next row | same | same |
| Home / End | First / last row | same | same |
| PageUp / PageDown | Jump 10 rows | same | same |
| → | Closed: open it (a locked one asks for its password); open: go to its first item | Go to the row's buttons: Preview → Download | Go to its buttons: Show more → Show all |
| ← | Open: close it; otherwise go to the parent folder | On a button: step back, then to the row; on the row: go to the parent folder | as a file row |
| Space | Tick / untick the whole folder | Tick / untick | — |
| Enter | Open / close | Preview when it can, else download | Show the next page |
| Typing | Jump to the next row whose name starts with what you typed; quick keystrokes make one word, the same letter again goes on to the next match | same | same |
| Ctrl+A (Mac: ⌘A) | Tick everything, again to untick | same | same |
| Esc | In the password box: cancel and go back to the row; in the preview: close and go back to the row | same | — |

The toolbar (filter, refresh, Download ZIP) and the column headers (select all, sorting) stay ordinary Tab stops, before the list.

## When it applies

- **Keyboard only**: the focus ring and the key hint only appear with the keyboard; with a mouse or touch, the list looks and works exactly as before, and the check boxes and buttons in rows are clicked as usual
- **Ctrl+A / ⌘A** ticks files only while keyboard focus is on a row. In the filter or password box, elsewhere on the page, or after clicking the list with a mouse, it stays the browser's own select-all
- **The key hint** is hidden on narrow lists (phones) and from screen readers
- **Focus is not lost**: when unlocking a folder, “Show all”, clearing the filter or the selection removes the button you were on, focus moves to the nearest sensible place instead of the top of the page

## Screen readers

The list is a tree grid (WAI-ARIA treegrid). Screen readers announce:

- On entering: the title (such as “Keyboard demo”), tree grid, multi-selectable
- Each row: its name, with size and date for files (“Lecture notes.pdf, 802 B, 2026/11/11”) or the item count for folders (“Sample files, 5 items”), plus its level, whether it is open, and whether it is ticked
- Column headers: their names, with ascending / descending on the sorted one

## Key hint labels

The key hint uses the label keys `keyMove`, `keyExpand`, `keySpace`, `keySelect`, `keyEnter`, `keyOpen` and `keySelectAll`; override them through `labels` like any other label, see [Locales and labels](../reference/i18n).
