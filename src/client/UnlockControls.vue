<script setup lang="ts">
import type { Translate } from './context'
import Icon from './Icon.vue'

const props = defineProps<{
  t: Translate
  unlockKey: string
  placeholder: string
  canRemember: boolean
  busy: boolean
  invalid: boolean
  inputId?: string
  inputLabel?: string
  describedBy?: string
  inline?: boolean
}>()

const emit = defineEmits<{
  submit: []
  cancel: []
}>()

const input = defineModel<string>('input', { required: true })
const remember = defineModel<boolean>('remember', { required: true })

function onEnter(event: KeyboardEvent) {
  if (!props.inline) return
  event.preventDefault()
  if (input.value && !props.busy) emit('submit')
}
</script>

<template>
  <Icon v-if="inline" class="fl-unlock-lock" name="lock" :size="18" />
  <input
    :id="inputId"
    v-model="input"
    type="password"
    autocomplete="off"
    :data-unlock="unlockKey"
    :placeholder="placeholder"
    :aria-label="inputLabel"
    :aria-invalid="invalid"
    :aria-describedby="describedBy"
    @keydown.enter="onEnter"
  />
  <button
    v-if="canRemember"
    class="fl-unlock-remember"
    type="button"
    :aria-pressed="remember"
    :aria-label="t('rememberPassword')"
    :title="t('rememberPassword')"
    @click="remember = !remember"
  ><Icon name="key" /></button>
  <button
    class="fl-unlock-submit"
    :type="inline ? 'button' : 'submit'"
    :disabled="busy || !input"
    @click="inline && emit('submit')"
  >{{ t('open') }}</button>
  <button
    v-if="inline"
    class="fl-unlock-cancel"
    type="button"
    :aria-label="t('cancel')"
    :title="t('cancel')"
    @click="emit('cancel')"
  >
    <Icon name="close" :size="14" />
  </button>
</template>
