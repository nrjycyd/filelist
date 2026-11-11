<script setup lang="ts">
declare const __FL_VERSION__: string
const version = __FL_VERSION__
</script>

<template>
  <section class="home-demo">
    <FileList title="在线演示 · 课程资料" />
    <p class="home-demo-note">
      实时组件，使用内置演示数据：展开“示例文件”可预览、下载，勾选后打包 ZIP · 当前版本 v{{ version }}
    </p>
  </section>
</template>
