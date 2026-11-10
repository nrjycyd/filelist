<script setup lang="ts">
import type { IconName } from './icons'
import { ICONS } from './icons'

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 16 })
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="ICONS[name].stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in ICONS[name].paths" :key="d" :d="d" />
  </svg>
</template>
