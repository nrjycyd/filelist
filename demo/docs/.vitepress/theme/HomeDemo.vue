<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'

declare const __FL_VERSION__: string
const version = __FL_VERSION__
const { lang } = useData()
const en = computed(() => lang.value === 'en-US')
</script>

<template>
  <section class="home-demo">
    <FileList v-if="en" locale="en-US" title="Live demo · Course materials" />
    <FileList v-else title="在线演示 · 课程资料" />
    <p v-if="en" class="home-demo-note">
      A live component with built-in demo data: open “Sample files” to preview and download, tick files to zip them · v{{ version }}
    </p>
    <p v-else class="home-demo-note">
      实时组件，使用内置演示数据：展开“示例文件”可预览、下载，勾选后打包 ZIP · 当前版本 v{{ version }}
    </p>
  </section>
</template>
