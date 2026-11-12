import vue from 'unplugin-vue/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['src/**/*.spec.ts', 'packages/*/src/**/*.spec.ts'],
    environment: 'node',
  },
})
