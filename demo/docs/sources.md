# 多根挂载测试

## 默认折叠

<FileList
  base="https://demo.oplist.org"
  title="多根挂载（默认折叠）"
  :sources="[
    { path: '/Document' },
    { path: '/Document/example1.ppt' }
  ]"
/>

## 默认展开

<FileList
  base="https://demo.oplist.org"
  title="多根挂载（默认展开）"
  :expanded="true"
  :sources="[
    { path: '/Document' },
    { path: '/Document/example1.ppt' }
  ]"
/>
