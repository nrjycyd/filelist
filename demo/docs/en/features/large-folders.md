# Long folders

To keep lists in articles short, each folder first shows `pageSize` rows (15 by default). When a folder is cut, one more row closes it: “⋯ 245 more”, with “Show 15 more” and “Show all” on the right. Open “Photos (260)”:

<FileList locale="en-US" title="Long folders" path="/Photos (260)" />

```md
<FileList base="https://pan.example.com" path="/photos" />
```

- The closing row lines up with the file rows: “⋯” in the file-type column, “X more” where names start. With less than a page left it offers “Show the remaining X”; once everything is shown the row goes away and the list just ends
- After more than the first page is shown, scrolling through the folder pins its row at the top of the page (below the VitePress nav), with “Showing 30 of 260 · Show less”. “Show less” goes back to the first `pageSize` rows and back to the folder's row
- Closing a folder with its arrow and opening it again starts from the first page; a refresh keeps how many rows were shown
- On phones the links read “+15” and “All”, still 44px tall to tap; the pinned folder row sits below the selection bar
- All data is loaded at once; only rendering is limited: sorting happens before cutting, ticking a folder or “select all” includes rows not shown, and a filter shows every match
- The top level of a single `path` works the same way

## Changing the page size

```md
<FileList base="https://pan.example.com" :page-size="50" />
<FileList base="https://pan.example.com" :page-size="0" />  <!-- show everything -->
```
