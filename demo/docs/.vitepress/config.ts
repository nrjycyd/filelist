import { defineConfig } from 'vitepress-tuck'
import fileList from 'vitepress-plugin-filelist'

export default defineConfig({
  title: 'vitepress-plugin-filelist',
  description: 'OpenList file browser for VitePress',
  plugins: [fileList()],
})
