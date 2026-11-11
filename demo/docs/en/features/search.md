# Filter and deep search

Typing in the filter box filters what is loaded right away. Try “answers”, then “Try deep search”:

<FileList locale="en-US" title="Filter and deep search" />

```md
<FileList base="https://pan.example.com" path="/course" />
```

- Matches show inside their folders with the keyword highlighted; the × in the box (or Esc) clears the filter and restores what was open
- While some sub-folders are not loaded yet, the end of the list says “Only loaded folders are filtered. **Try deep search**”
- Deep search does not use OpenList's search API (no search index needed): the component reads the unloaded sub-folders itself, four at a time and at most `deepSearchLimit` per run. Matches appear in place and can be ticked, zipped, previewed and downloaded
- One click enters **deep search mode** until the filter is cleared: a new keyword, a refresh or an unlocked folder continue the search by themselves; on refresh the results stay until the new ones are ready
- A run can be stopped; after a stop or at the limit it offers “Continue”
- Locked folders show up in the results with a lock and “Not searched (password needed)”; type the password in place and their contents are searched

## Automatic deep search

For small mounts, typing a keyword can enter deep search mode at once:

```md
<FileList base="https://pan.example.com" deep-search="auto" />
```

## Props

| Prop | Default | Description |
| --- | --- | --- |
| `deepSearch` | `'manual'` | `'auto'`: typing a keyword starts deep search |
| `deepSearchLimit` | `500` | Folders read per run, then “Continue” |
