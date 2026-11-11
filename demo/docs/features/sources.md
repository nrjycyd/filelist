# 多根挂载

用 `sources` 把多个目录或文件挂在同一个列表里，设置后忽略 `path`。

<FileList
  title="多根挂载"
  :sources="[
    { path: '/示例文件' },
    { path: '/exams', title: '历年试题', expanded: true },
    { path: '/示例文件/讲义.pdf' }
  ]"
/>

```md
<FileList
  base="https://pan.example.com"
  title="多根挂载"
  :sources="[
    { path: '/示例文件' },
    { path: '/exams', title: '历年试题', expanded: true },
    { path: '/示例文件/讲义.pdf' }
  ]"
/>
```

- 目录路径挂载为根文件夹，默认折叠；`expanded` 可为全局或单个 source 打开
- 文件路径挂载为一条文件记录，直接预览 / 下载
- 勾选根目录会加载并选中其下所有文件；ZIP 内以根节点名称（`title` 或路径末段）作为顶层文件夹，文件根保留原文件名
- 每个 source 可单独设置 `title`、`password`；未设置 `password` 的 source 使用组件的 `password` 或运行时输入的密码，遇到需要密码的目录会在该行原地显示密码输入框
- 根节点顺序按 `sources` 顺序，子项仍按名称 / 大小 / 日期排序

```ts
interface FileListSource {
  path: string
  title?: string
  password?: string
  expanded?: boolean
}
```
