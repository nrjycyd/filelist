import { defineConfig } from 'vitepress-tuck'
import fileList from 'vitepress-plugin-filelist'

export default defineConfig({
  base: process.env.PAGES_BASE || '/',
  title: 'vitepress-plugin-filelist',
  description: 'OpenList file browser for VitePress',
  plugins: [fileList()],
})
