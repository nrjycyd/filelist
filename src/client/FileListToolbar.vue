<script setup lang="ts">
import type { Translate } from './context'
import type { ZipProgress } from './download'
import Icon from './Icon.vue'
import { formatSize } from './utils'

defineProps<{
  t: Translate
  displayTitle: string
  demo: boolean
  selectedCount: number
  selectedBytes: number
  refreshing: boolean
  loadingRoot: boolean
  batchBusy: boolean
  zipProgress: ZipProgress | null
  zipPercent: number
}>()

const emit = defineEmits<{
  clearSelection: []
  clearFilter: []
  refresh: []
  cancelZip: []
  batchDownload: []
}>()

const keyword = defineModel<string>('keyword', { required: true })
</script>

<template>
  <div class="fl-bar">
    <div v-if="batchBusy" class="fl-selection" role="status">
      <span class="fl-selection-count">{{ t('batching', { percent: zipPercent }) }}</span>
      <span v-if="zipProgress" class="fl-selection-size">{{
        t('batchProgress', {
          done: formatSize(zipProgress.bytes),
          total: formatSize(zipProgress.totalBytes),
          files: zipProgress.files,
          count: zipProgress.totalFiles,
        })
      }}</span>
      <span class="fl-zip-bar" :style="{ width: `${zipPercent}%` }" aria-hidden="true"></span>
    </div>
    <div v-else-if="selectedCount" class="fl-selection" role="status">
      <span class="fl-selection-count">{{ t('selected', { count: selectedCount }) }}</span>
      <span class="fl-selection-size">{{ t('totalSize', { size: formatSize(selectedBytes) }) }}</span>
    </div>
    <div v-else class="fl-title">
      <span class="fl-title-text">{{ displayTitle }}</span>
      <span v-if="demo" class="fl-demo-badge">{{ t('demoBadge') }}</span>
    </div>
    <button
      v-if="selectedCount && !batchBusy"
      class="fl-clear"
      type="button"
      :aria-label="t('clearSelection')"
      :title="t('clearSelection')"
      @click="emit('clearSelection')"
    >
      <Icon class="fl-clear-icon" name="close" :size="18" />
      <span class="fl-clear-text">{{ t('clear') }}</span>
    </button>
    <div class="fl-tools">
      <label class="fl-search">
        <Icon name="search" :size="15" />
        <input
          v-model="keyword"
          type="text"
          :placeholder="t('filter')"
          :aria-label="t('filter')"
          @keydown.esc="keyword && ($event.preventDefault(), emit('clearFilter'))"
        />
        <button
          v-if="keyword"
          class="fl-search-clear"
          type="button"
          :aria-label="t('clearFilter')"
          :title="t('clearFilter')"
          @click="emit('clearFilter')"
        ><Icon name="close" :size="12" /></button>
      </label>
      <button
        class="fl-icon-btn fl-refresh"
        :class="{ 'fl-spinning': refreshing }"
        type="button"
        :disabled="refreshing || loadingRoot"
        :aria-label="refreshing ? t('refreshing') : t('refresh')"
        :title="refreshing ? t('refreshing') : t('refresh')"
        @click="emit('refresh')"
      >
        <Icon name="refresh" :size="15" />
      </button>
    </div>
    <button v-if="batchBusy" class="fl-btn fl-zip-cancel" type="button" @click="emit('cancelZip')">{{ t('cancel') }}</button>
    <button v-else-if="selectedCount" class="fl-btn fl-btn-primary" type="button" @click="emit('batchDownload')">
      <Icon name="download" :size="15" />
      {{ t('batch') }}
    </button>
  </div>
</template>
