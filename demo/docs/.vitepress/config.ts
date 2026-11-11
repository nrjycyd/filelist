import { defineConfig } from 'vitepress-tuck'
import fileList from 'vitepress-plugin-filelist'
import pkg from '../../../package.json'

const repo = 'https://github.com/nrjycyd/vitepress-plugin-filelist'

export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  lang: 'zh-CN',
  title: 'vitepress-plugin-filelist',
  description: '面向 VitePress 的 OpenList 文件浏览组件',
  cleanUrls: true,
  plugins: [fileList()],
  vite: {
    // The version shown on the home page, read from the repository at build time.
    define: { __FL_VERSION__: JSON.stringify(pkg.version) },
  },
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: '功能', link: '/features/sources', activeMatch: '/features/' },
      { text: '参考', link: '/reference/props', activeMatch: '/reference/' },
      {
        text: `v${pkg.version}`,
        items: [
          { text: '更新日志', link: `${repo}/blob/main/CHANGELOG.md` },
          { text: 'npm', link: 'https://www.npmjs.com/package/vitepress-plugin-filelist' },
        ],
      },
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '接入 OpenList', link: '/guide/openlist' },
          { text: '常见问题', link: '/guide/faq' },
        ],
      },
      {
        text: '功能',
        items: [
          { text: '多根挂载', link: '/features/sources' },
          { text: '批量下载 ZIP', link: '/features/zip' },
          { text: '大目录', link: '/features/large-folders' },
          { text: '筛选与深度搜索', link: '/features/search' },
          { text: '目录密码与刷新', link: '/features/passwords' },
          { text: '预览', link: '/features/preview' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: '组件属性', link: '/reference/props' },
          { text: '国际化与文案', link: '/reference/i18n' },
          { text: '导出与兼容性', link: '/reference/exports' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: { noResultsText: '没有找到结果', footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
        },
      },
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    footer: { message: 'MIT License', copyright: `vitepress-plugin-filelist v${pkg.version}` },
  },
})
