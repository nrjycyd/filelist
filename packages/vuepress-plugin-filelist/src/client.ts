import type { App } from 'vue'
import { enhanceAppWithFileList } from 'vitepress-plugin-filelist/client'
import 'vitepress-plugin-filelist/style.css'

/** VuePress client config, loaded by `fileListPlugin()`. */
export default {
  enhance({ app }: { app: App }) {
    enhanceAppWithFileList({ app })
  },
}
