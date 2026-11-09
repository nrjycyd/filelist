import type { FileListLabels, FileListLocale } from './types'

export const fileListLocales: Record<FileListLocale, FileListLabels> = {
  'zh-CN': {
    allFiles: '全部文件',
    demoBadge: '演示数据',
    filter: '筛选文件名',
    refresh: '刷新',
    batch: '批量下载',
    batchCount: '批量下载（{count}）',
    batching: '打包中 {percent}%',
    passwordPrompt: '该目录受密码保护：',
    passwordPlaceholder: '输入目录密码',
    open: '打开',
    columnName: '文件名',
    columnSize: '文件大小',
    columnDate: '最后修改日期',
    loading: '加载中…',
    loadFailed: '加载失败：{message}',
    guestHint: '在 OpenList 后台启用 guest，或给组件传一个只读 token。',
    corsHint: '可能是跨域或混合内容被拦截，检查 OpenList 的 cors 配置与页面协议。',
    retry: '重试',
    empty: '没有文件',
    preview: '预览',
    download: '下载',
    loaded: '{count} 个已加载文件',
    selected: '已选 {count} 项',
    unloaded: '{count} 个目录未展开，未计入全选',
    folderFailed: '打开文件夹失败：{message}',
    demoDownload: '演示模式：接入 OpenList 后会下载「{name}」',
    demoPreview: '演示模式：接入 OpenList 后可预览「{name}」',
    demoBatch: '演示模式：将打包已勾选的 {count} 个文件',
    downloadFailed: '下载失败：{message}',
    previewFailed: '预览失败：{message}',
    batchFailed: '打包失败：{message}',
    defaultZip: '资源',
  },
  'en-US': {
    allFiles: 'All files',
    demoBadge: 'Demo data',
    filter: 'Filter files',
    refresh: 'Refresh',
    batch: 'Download ZIP',
    batchCount: 'Download ZIP ({count})',
    batching: 'Zipping {percent}%',
    passwordPrompt: 'This folder is password protected:',
    passwordPlaceholder: 'Folder password',
    open: 'Open',
    columnName: 'Name',
    columnSize: 'Size',
    columnDate: 'Modified',
    loading: 'Loading…',
    loadFailed: 'Failed to load: {message}',
    guestHint: 'Enable the guest user in OpenList, or pass a read-only token.',
    corsHint: 'Possibly blocked by CORS or mixed content. Check OpenList cors settings and the page protocol.',
    retry: 'Retry',
    empty: 'No files',
    preview: 'Preview',
    download: 'Download',
    loaded: '{count} loaded file(s)',
    selected: '{count} selected',
    unloaded: '{count} folder(s) not expanded, excluded from select-all',
    folderFailed: 'Failed to open folder: {message}',
    demoDownload: 'Demo mode: "{name}" will download once OpenList is connected.',
    demoPreview: 'Demo mode: "{name}" will preview once OpenList is connected.',
    demoBatch: 'Demo mode: {count} selected file(s) would be zipped.',
    downloadFailed: 'Download failed: {message}',
    previewFailed: 'Preview failed: {message}',
    batchFailed: 'Failed to create ZIP: {message}',
    defaultZip: 'resources',
  },
}

export function formatLabel(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    values[key] === undefined ? `{${key}}` : String(values[key]),
  )
}

export function resolveLabels(
  locale: FileListLocale = 'zh-CN',
  overrides?: Partial<FileListLabels>,
): FileListLabels {
  return {
    ...(fileListLocales[locale] ?? fileListLocales['zh-CN']),
    ...overrides,
  }
}
