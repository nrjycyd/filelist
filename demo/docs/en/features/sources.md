# Several roots

`sources` mounts several folders or files in one list; `path` is then ignored.

<FileList
  locale="en-US"
  title="Several roots"
  :sources="[
    { path: '/Sample files' },
    { path: '/exams', title: 'Past exams', expanded: true },
    { path: '/Sample files/Lecture notes.pdf' }
  ]"
/>

```md
<FileList
  base="https://pan.example.com"
  title="Several roots"
  :sources="[
    { path: '/Sample files' },
    { path: '/exams', title: 'Past exams', expanded: true },
    { path: '/Sample files/Lecture notes.pdf' }
  ]"
/>
```

- A folder path becomes a root folder, closed at first; `expanded` opens all roots or one source
- A file path becomes a single file row, ready to preview or download
- Ticking a root loads and ticks every file under it; in the ZIP, each root's name (`title` or the last path segment) is a top-level folder, and a file root keeps its file name
- Each source can have its own `title` and `password`. Sources without a `password` use the component's `password` or what the reader types; a folder that needs a password asks in its own row
- Roots keep the order of `sources`; their contents are sorted by name, size or date as usual

```ts
interface FileListSource {
  path: string
  title?: string
  password?: string
  expanded?: boolean
}
```
