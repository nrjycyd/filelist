import type { Theme } from 'vitepress'
import enhanceApp from 'virtual:enhance-app'
import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import HomeDemo from './HomeDemo.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // The home page shows a live file list between the hero and the features.
  Layout: () => h(DefaultTheme.Layout, null, { 'home-features-before': () => h(HomeDemo) }),
  enhanceApp(ctx) {
    enhanceApp(ctx)
  },
} satisfies Theme
