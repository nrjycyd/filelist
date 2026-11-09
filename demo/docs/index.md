# vitepress-plugin-filelist

## Demo mode (zh-CN)

<FileList title="课程资料（演示数据）" />

## English locale

<FileList locale="en-US" title="Course materials (demo)" />

## Real OpenList

<FileList
  base="https://demo.oplist.org"
  path="/"
  title="OpenList 演示站"
/>

## 多根挂载（默认折叠）

<FileList
  base="https://demo.oplist.org"
  title="多根挂载（默认折叠）"
  :sources="[
    { path: '/Document' },
    { path: '/Document/example1.ppt' }
  ]"
/>

## 多根挂载（默认展开）

<FileList
  base="https://demo.oplist.org"
  title="多根挂载（默认展开）"
  :expanded="true"
  :sources="[
    { path: '/Document' },
    { path: '/Document/example1.ppt' }
  ]"
/>
