<script setup lang="ts">
/**
 * Sort control of the narrow layout, where the column headers are hidden: a
 * button that opens a small menu (WAI-ARIA menu button). Three rows pick
 * what to sort by, keeping the order; a two-part switch picks the order, in
 * words that fit the field (A → Z, small → large, old → new).
 */
import type { IconName } from './icons'
import type { FileListLabels } from './types'
import type { SortKey } from './utils'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import Icon from './Icon.vue'

const props = defineProps<{
  sortKey: SortKey
  sortAsc: boolean
  /** Prefix for element ids. */
  uid: string
  t: (key: keyof FileListLabels, values?: Record<string, string | number>) => string
}>()
const emit = defineEmits<{ sort: [key: SortKey, ascending: boolean] }>()

const FIELDS: Array<{ key: SortKey; label: keyof FileListLabels; icon: IconName; order: [keyof FileListLabels, keyof FileListLabels] }> = [
  { key: 'name', label: 'columnName', icon: 'sortName', order: ['sortNameAsc', 'sortNameDesc'] },
  { key: 'size', label: 'columnSize', icon: 'sortSize', order: ['sortSizeAsc', 'sortSizeDesc'] },
  { key: 'modified', label: 'columnDate', icon: 'sortDate', order: ['sortDateAsc', 'sortDateDesc'] },
]

const current = computed(() => FIELDS.find((field) => field.key === props.sortKey) ?? FIELDS[0])
const menuId = computed(() => `${props.uid}-sort-menu`)
const buttonLabel = computed(() => {
  const name = props.t(current.value.label)
  return `${props.t('sortBy')} ${props.t(props.sortAsc ? 'sortedAscending' : 'sortedDescending', { name })}`
})

const open = ref(false)
/** Opens upwards when there is no room below the button. */
const upwards = ref(false)
const wrapEl = ref<HTMLElement>()
const buttonEl = ref<HTMLButtonElement>()
const menuEl = ref<HTMLElement>()

function items(): HTMLElement[] {
  return [...(menuEl.value?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])]
}

function onOutside(event: PointerEvent) {
  if (!wrapEl.value?.contains(event.target as Node)) close(false)
}

async function show(focus: 'checked' | 'last' = 'checked') {
  open.value = true
  upwards.value = false
  document.addEventListener('pointerdown', onOutside, true)
  await nextTick()
  const button = buttonEl.value?.getBoundingClientRect()
  const menu = menuEl.value?.getBoundingClientRect()
  if (button && menu) upwards.value = menu.bottom > window.innerHeight - 8 && button.top - menu.height - 6 > 8
  const all = items()
  const target = focus === 'last' ? all.at(-1) : all.find((el) => el.getAttribute('aria-checked') === 'true')
  target?.focus()
}

function close(refocus: boolean) {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  if (refocus) buttonEl.value?.focus()
}

function toggle() {
  if (open.value) close(true)
  else void show()
}

function pick(key: SortKey, ascending: boolean) {
  emit('sort', key, ascending)
  close(true)
}

function onButtonKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void show(event.key === 'ArrowUp' ? 'last' : 'checked')
  }
}

function onMenuKeydown(event: KeyboardEvent) {
  const all = items()
  const at = all.indexOf(document.activeElement as HTMLElement)
  const move = (index: number) => all[(index + all.length) % all.length]?.focus()
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') move(at + 1)
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') move(at - 1)
  else if (event.key === 'Home') move(0)
  else if (event.key === 'End') move(all.length - 1)
  else if (event.key === 'Escape') close(true)
  else if (event.key === 'Tab') {
    close(false)
    return
  }
  else return
  event.preventDefault()
  event.stopPropagation()
}

onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <div ref="wrapEl" class="fl-sort-menu">
    <button
      ref="buttonEl"
      class="fl-sort-trigger"
      :class="{ 'fl-open': open }"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      :aria-label="buttonLabel"
      @click="toggle"
      @keydown="onButtonKeydown"
    >
      <span>{{ t('sortBy') }}</span>
      <span class="fl-sort-current">{{ t(current.label) }} {{ sortAsc ? '↑' : '↓' }}</span>
      <Icon name="down" :size="14" class="fl-sort-chevron" />
    </button>
    <div
      v-if="open"
      :id="menuId"
      ref="menuEl"
      class="fl-menu"
      :class="{ 'fl-menu-up': upwards }"
      role="menu"
      :aria-label="t('sortTitle')"
      @keydown="onMenuKeydown"
    >
      <div class="fl-menu-title" aria-hidden="true">{{ t('sortTitle') }}</div>
      <button
        v-for="field in FIELDS"
        :key="field.key"
        class="fl-menu-item"
        :class="{ 'fl-current': field.key === sortKey }"
        type="button"
        role="menuitemradio"
        :aria-checked="field.key === sortKey"
        tabindex="-1"
        @click="pick(field.key, sortAsc)"
      >
        <Icon :name="field.icon" :size="18" />
        <span class="fl-menu-label">{{ t(field.label) }}</span>
        <Icon v-if="field.key === sortKey" name="check" :size="18" class="fl-menu-check" />
      </button>
      <div class="fl-menu-sep" role="separator" />
      <div class="fl-menu-order" role="group" :aria-label="t('sortOrder')">
        <button
          v-for="(order, index) in current.order"
          :key="order"
          class="fl-menu-order-btn"
          :class="{ 'fl-current': sortAsc === (index === 0) }"
          type="button"
          role="menuitemradio"
          :aria-checked="sortAsc === (index === 0)"
          tabindex="-1"
          @click="pick(sortKey, index === 0)"
        >
          {{ t(order) }}
        </button>
      </div>
    </div>
  </div>
</template>
