import type { DefaultTheme, UserConfig } from 'vitepress'
import pkg from '../../../package.json'

const repo = 'https://github.com/nrjycyd/vitepress-plugin-filelist'

// English pages (/en/). Only what differs from the Chinese root config.
export default {
  description: 'OpenList file browser for VitePress',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/en/guide/getting-started', activeMatch: '/en/guide/' },
      { text: 'Features', link: '/en/features/sources', activeMatch: '/en/features/' },
      { text: 'Reference', link: '/en/reference/props', activeMatch: '/en/reference/' },
      {
        text: `v${pkg.version}`,
        items: [
          { text: 'Changelog', link: `${repo}/blob/main/CHANGELOG.md` },
          { text: 'npm', link: 'https://www.npmjs.com/package/vitepress-plugin-filelist' },
        ],
      },
    ],
    sidebar: {
      '/en/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/en/guide/getting-started' },
            { text: 'Using with VuePress', link: '/en/guide/vuepress' },
            { text: 'Connect OpenList', link: '/en/guide/openlist' },
            { text: 'Security', link: '/en/guide/security' },
            { text: 'FAQ', link: '/en/guide/faq' },
            { text: 'Upgrading to 0.9', link: '/en/guide/migration' },
          ],
        },
        {
          text: 'Features',
          items: [
            { text: 'Several roots', link: '/en/features/sources' },
            { text: 'Batch download (ZIP)', link: '/en/features/zip' },
            { text: 'Long folders', link: '/en/features/large-folders' },
            { text: 'Filter and deep search', link: '/en/features/search' },
            { text: 'Folder passwords and refresh', link: '/en/features/passwords' },
            { text: 'Preview', link: '/en/features/preview' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Component props', link: '/en/reference/props' },
            { text: 'Locales and labels', link: '/en/reference/i18n' },
            { text: 'Exports and compatibility', link: '/en/reference/exports' },
          ],
        },
      ],
    },
    outline: { level: [2, 3], label: 'On this page' },
    docFooter: { prev: 'Previous', next: 'Next' },
    darkModeSwitchLabel: 'Appearance',
    langMenuLabel: 'Language',
    sidebarMenuLabel: 'Menu',
    returnToTopLabel: 'Return to top',
    footer: { message: 'MIT License', copyright: `vitepress-plugin-filelist v${pkg.version}` },
  },
} satisfies UserConfig<DefaultTheme.Config>
