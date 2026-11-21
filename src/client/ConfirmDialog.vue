<script setup lang="ts">
/** Small native <dialog> for a yes / no question or a notice (bottom sheet on phones). */
import { ref } from 'vue'
import { useDialog } from './useDialog'

const props = defineProps<{
  open: boolean
  title: string
  text: string
  /** Secondary line, e.g. a tip. */
  tip?: string
  /** Omit for a notice with a single button. */
  confirmLabel?: string
  cancelLabel: string
}>()

const emit = defineEmits<{
  confirm: []
  close: []
}>()

const dialog = ref<HTMLDialogElement>()
const { onNativeClose, onBackdrop } = useDialog(dialog, () => props.open, () => emit('close'))
</script>

<template>
  <dialog ref="dialog" class="fl-confirm" :aria-label="title" @close="onNativeClose" @click="onBackdrop">
    <div v-if="open" class="fl-confirm-panel">
      <div class="fl-confirm-title">{{ title }}</div>
      <div class="fl-confirm-text">{{ text }}</div>
      <div v-if="tip" class="fl-confirm-text">{{ tip }}</div>
      <div class="fl-confirm-actions">
        <button v-if="confirmLabel" class="fl-btn" type="button" @click="emit('close')">{{ cancelLabel }}</button>
        <button
          class="fl-btn fl-btn-primary"
          type="button"
          autofocus
          @click="confirmLabel ? emit('confirm') : emit('close')"
        >{{ confirmLabel || cancelLabel }}</button>
      </div>
    </div>
  </dialog>
</template>
