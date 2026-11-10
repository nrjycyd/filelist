<script setup lang="ts">
/** Small native <dialog> for a yes / no question or a notice (bottom sheet on phones). */
import { ref, watch } from 'vue'

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

watch(
  () => props.open,
  (open) => {
    const el = dialog.value
    if (!el) return
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close()
      else el.removeAttribute('open')
    }
  },
  { flush: 'post' },
)

function onNativeClose() {
  // Esc: keep the parent in sync.
  if (props.open) emit('close')
}

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) emit('close')
}
</script>

<template>
  <dialog ref="dialog" class="fl-confirm" :aria-label="title" @close="onNativeClose" @click="onBackdrop">
    <div v-if="open" class="fl-confirm-panel">
      <p class="fl-confirm-title">{{ title }}</p>
      <p class="fl-confirm-text">{{ text }}</p>
      <p v-if="tip" class="fl-confirm-text">{{ tip }}</p>
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
