import field from 'vitepress-plugin-field'
import fileList from 'vitepress-plugin-filelist'
import npmTo from 'vitepress-plugin-npm-to'
import steps from 'vitepress-plugin-steps'
import { defineConfig } from 'vitepress-tuck'
import pkg from '../../../package.json'

const repo = 'https://github.com/nrjycyd/filelist'
const site = 'https://nrjycyd.github.io/filelist/'
const base = process.env.PAGES_BASE || '/'

export default defineConfig({
  base,
  lang: 'zh-CN',
  // The brand name (and the repository's); the packages are
  // vitepress-plugin-filelist and vuepress-plugin-filelist.
  title: 'FileList',
  description: '面向 VitePress 与 VuePress 的 OpenList 文件浏览组件',
  cleanUrls: true,
  // Icons and the link preview (logo sources: demo/docs/public).
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.ico`, sizes: '48x48' }],
    ['link', { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' }],
    ['link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }],
    ['meta', { name: 'theme-color', content: '#db2777' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'FileList' }],
    ['meta', { property: 'og:description', content: '在 VitePress / VuePress 文档里浏览、预览、批量下载 OpenList 网盘文件' }],
    ['meta', { property: 'og:image', content: `${site}social-preview.png` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],
  // Markdown extensions from the vitepress-tuck family: install tabs (::: npm-to),
  // steps and prop fields.
  plugins: [fileList(), npmTo(['npm', 'pnpm', 'yarn', 'bun']), steps(), field()],
  // Chinese at the root (existing links keep working), English under /en/;
  // the English nav, sidebar and labels are in en/config.ts.
  locales: {
    root: { label: '简体中文', lang: 'zh-CN' },
    en: { label: 'English', lang: 'en-US', link: '/en/' },
  },
  vite: {
    // The version shown on the home page, read from the repository at build time.
    define: { __FL_VERSION__: JSON.stringify(pkg.version) },
  },
  themeConfig: {
    // No alt text: the site title “FileList” sits right next to the logo.
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: '' },
    nav: [
      { text: '指南', link: '/guide/getting-started', activeMatch: '/guide/' },
      { text: '功能', link: '/features/sources', activeMatch: '/features/' },
      { text: '参考', link: '/reference/props', activeMatch: '/reference/' },
      {
        text: `v${pkg.version}`,
        items: [
          { text: '更新日志', link: `${repo}/blob/main/CHANGELOG.md` },
          { text: 'npm · VitePress 版', link: 'https://www.npmjs.com/package/vitepress-plugin-filelist' },
          { text: 'npm · VuePress 版', link: 'https://www.npmjs.com/package/vuepress-plugin-filelist' },
        ],
      },
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '在 VuePress 中使用', link: '/guide/vuepress' },
          { text: '接入 OpenList', link: '/guide/openlist' },
          { text: '安全与权限', link: '/guide/security' },
          { text: '常见问题', link: '/guide/faq' },
          { text: '升级指南', link: '/guide/migration' },
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
          { text: '键盘操作', link: '/features/keyboard' },
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
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: { noResultsText: '没有找到结果', footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' } },
            },
          },
          en: {
            translations: {
              button: { buttonText: 'Search', buttonAriaLabel: 'Search' },
              modal: { noResultsText: 'No results', footer: { selectText: 'Select', navigateText: 'Navigate', closeText: 'Close' } },
            },
          },
        },
      },
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '外观',
    langMenuLabel: '语言',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
    footer: { message: 'MIT License', copyright: `FileList v${pkg.version} · vitepress-plugin-filelist / vuepress-plugin-filelist` },
  },
})
