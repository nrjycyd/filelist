import type { DefaultTheme, UserConfig } from 'vitepress'
import pkg from '../../../package.json'

const repo = 'https://github.com/nrjycyd/vitepress-plugin-filelist'

// English pages (/en/). Only what differs from the Chinese root config.
export default {
  description: 'OpenList file browser for VitePress',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/en/guide/getting-started', activeMatch: '/en/guide/' },
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
            { text: 'Connect OpenList', link: '/en/guide/openlist' },
            { text: 'Security', link: '/en/guide/security' },
          ],
        },
        {
          text: 'Reference',
          items: [{ text: 'Component props', link: '/en/reference/props' }],
        },
        {
          text: 'More (Chinese)',
          items: [
            { text: 'Features and live examples', link: '/features/sources' },
            { text: 'FAQ', link: '/guide/faq' },
            { text: 'Exports and compatibility', link: '/reference/exports' },
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
