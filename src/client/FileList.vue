<script setup lang="ts">
/**
 * OpenList file browser: folder tree, batch ZIP, folder passwords and an
 * in-page preview. This component holds what every part shares (props,
 * labels, toast, the OpenList client, passwords) and wires the parts to the
 * template:
 *
 * - useTree.ts: loading and refreshing the tree, opening folders, folder passwords, sorting
 * - useDeepSearch.ts: the filter and deep search
 * - useRows.ts: rows on screen, long folders (“more” row, pinned folder row), sticky offsets
 * - useSelection.ts: check boxes and “select all”
 * - useDownloads.ts: single downloads and the batch ZIP
 * - usePreview.ts: the preview dialog
 *
 * OpenList access is in api.ts (demo.ts when `base` is empty), password choice
 * in usePasswords.ts, tree helpers in tree.ts and ZIP building in download.ts.
 */
import type { ListContext } from './context'
import type { FNode } from './tree'
import type { FileListLabels, FileListProps, FileListSource } from './types'
import type { SortKey } from './utils'
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, useId } from 'vue'
import { createOpenListApi, errorText, isNetworkError } from './api'
import ConfirmDialog from './ConfirmDialog.vue'
import { fitPrimaryButton } from './contrast'
import { createDemoApi, isDemoFile } from './demo'
import { warnPublicSecrets } from './devWarnings'
import FileListToolbar from './FileListToolbar.vue'
import Icon from './Icon.vue'
import { formatLabel, resolveLabels } from './locales'
import PreviewDialog from './PreviewDialog.vue'
import SortMenu from './SortMenu.vue'
import { useDeepSearch } from './useDeepSearch'
import { useDownloads } from './useDownloads'
import { rowKey, useKeyboard } from './useKeyboard'
import { usePasswords } from './usePasswords'
import { canPreview, usePreview } from './usePreview'
import { isMore, useRows } from './useRows'
import { useSelection } from './useSelection'
import { useTree } from './useTree'
import { extOf, fileKind, formatDate, formatSize, totalSize } from './utils'

const props = withDefaults(defineProps<FileListProps>(), {
  base: '',
  path: '/',
  sources: () => [] as FileListSource[],
  expanded: false,
  token: '',
  password: '',
  title: '',
  locale: 'zh-CN',
  rememberPassword: true,
  pageSize: 15,
  deepSearchLimit: 500,
  deepSearch: 'manual',
})

const text = computed<FileListLabels>(() => resolveLabels(props.locale, props.labels))

function t(key: keyof FileListLabels, values?: Record<string, string | number>): string {
  return formatLabel(text.value[key], values)
}

/** Prefix for element ids, unique per component instance. */
const uid = useId()
const demo = computed(() => !props.base)
const api = computed(() => (demo.value ? createDemoApi(220, props.locale) : createOpenListApi(props.base, props.token)))

const canRemember = computed(() => props.rememberPassword !== false)
const passwords = usePasswords({
  scope: () => props.base.replace(/\/+$/, '') || 'demo',
  enabled: () => canRemember.value,
  fallback: () => props.password,
})
const remembered = passwords.remembered

const rootEl = ref<HTMLElement>()
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

function showToast(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 3200)
}

/** A failure toast; browser network errors are usually CORS, so say where to look. */
function failureMessage(key: keyof FileListLabels, error: unknown): string {
  const message = t(key, { message: errorText(error) })
  return isNetworkError(error) ? `${message} ${t('corsHint')}` : message
}

const ctx: ListContext = { props, t, showToast, failureMessage, api, demo, passwords, rootEl }

/** Selected file paths, shared by the tree (which trims them) and the check boxes. */
const selected = ref<Set<string>>(new Set())

// The parts need each other's state; the arrows below are only called after
// setup, once every part exists.
const {
  roots,
  loadingRoot,
  errorMsg,
  refreshing,
  rootLock,
  sortKey,
  sortAsc,
  startPrompt,
  cancelUnlock,
  unlockErrorText,
  submitUnlock,
  submitRootUnlock,
  forgetPassword,
  loadChildren,
  loadRoot,
  refresh,
  toggleExpand,
  setSort,
  applySort,
} = useTree(ctx, {
  selected,
  stopDeepSearch: () => stopDeepSearch(),
  deepMode: () => deepMode.value,
  resetShown: (folder) => resetShown(folder),
})

const {
  keyword,
  deepMode,
  deepRow,
  deepSearch,
  retryDeepSearch,
  stopDeepSearch,
  pauseDeepSearch,
  clearFilter,
  folderCounts,
  lockedInSearch,
  deepSummary,
  nameParts,
} = useDeepSearch(ctx, { roots, refreshing, loadChildren })

const rowsPart = useRows(ctx, { roots, keyword, deepMode })
const { showMore, showLess, resetShown, rows, visible, pinned, pinOffset, pinnedName, stickyTop, toolbarOverFooter, schedulePin } = rowsPart

const {
  statsOf,
  isChecked,
  isIndeterminate,
  toggleCheck,
  allFiles,
  selectedFiles,
  allChecked,
  someChecked,
  toggleCheckAll,
  clearSelection,
} = useSelection({ roots, selected, loadChildren, startPrompt })

function fileUrlOf(node: FNode): Promise<string> {
  return api.value.fileUrl(node, passwords.resolve(node.path, node.password).password)
}

const { download, batchBusy, zipProgress, zipNotice, zipDialog, batchDownload, confirmZip, cancelZip, zipPercent } =
  useDownloads(ctx, { selected, selectedFiles, fileUrlOf })

/* ---------------- page chrome ---------------- */

const siteTitle = ref('')
const iframePreviews = ref('')

const {
  previewNode,
  previewSrc,
  previewViewer,
  previewResolving,
  previewError,
  previewList,
  previewPosition,
  preview,
  stepPreview,
  closePreview,
} = usePreview(ctx, { visible, fileUrlOf, iframePreviews })

const displayTitle = computed(() => props.title || siteTitle.value || (props.path === '/' ? t('allFiles') : props.path))

/* ---------------- keyboard (treegrid) ---------------- */

const gridEl = ref<HTMLElement>()
const keyboard = useKeyboard({
  grid: gridEl,
  rows,
  toggleExpand,
  open: (node) => (canPreview(node) ? preview(node) : download(node)),
  showNext: (row) => (isMore(row) ? showMore(row, false) : undefined),
  toggleAll: () => gridEl.value?.querySelector<HTMLInputElement>('.fl-head .fl-cell-check input:not(:disabled)')?.click(),
})
const { rowTabIndex, keyboardInside } = keyboard
/**
 * What a screen reader says for a row (its level, open and ticked states come
 * from the treegrid roles): the name, then size and date, or a folder's count.
 */
function rowLabel(node: FNode): string {
  if (!node.is_dir) return `${node.name}, ${formatSize(node.size)}, ${formatDate(node.modified)}`
  return node.loaded ? `${node.name}, ${t('folderItems', { count: statsOf(node).files })}` : node.name
}

/** “⌘A” on Apple keyboards, “Ctrl+A” elsewhere; decided in the browser. */
const selectAllKeys = ref('Ctrl+A')

async function loadSettings() {
  const settings = await api.value.settings()
  siteTitle.value = settings.title
  iframePreviews.value = settings.iframePreviews
}

/* ---------------- keyboard focus that would be lost ---------------- */

/**
 * Where focus was in the list. Several controls disappear after their own
 * action (“show all”, “clear”, the password form after unlocking, “Stop”…),
 * which would drop keyboard focus back to the top of the page. When that
 * happens, focus moves to the nearest control that still makes sense.
 */
interface FocusSpot {
  el: HTMLElement
  /** The filter box, the toolbar, a row, a “more” row, the pinned folder row, the deep search line, or elsewhere. */
  spot: 'search' | 'bar' | 'row' | 'more' | 'pin' | 'deep' | 'other'
  /** Key of the row, the row above a “more” row, or the pinned folder. */
  key?: string
}
let lastFocus: FocusSpot | null = null

function onFocusIn(event: FocusEvent) {
  const el = event.target
  if (!(el instanceof HTMLElement) || el.closest('dialog')) {
    lastFocus = null
    return
  }
  const row = el.closest<HTMLElement>('[data-path]')
  const more = el.closest<HTMLElement>('.fl-more')
  const pin = el.closest<HTMLElement>('[data-pin]')
  if (row) lastFocus = { el, spot: 'row', key: row.dataset.key }
  else if (more) lastFocus = { el, spot: 'more', key: (more.previousElementSibling as HTMLElement | null)?.dataset.key }
  else if (pin) lastFocus = { el, spot: 'pin', key: pin.dataset.pin }
  else if (el.closest('.fl-deep')) lastFocus = { el, spot: 'deep' }
  else if (el.closest('.fl-search')) lastFocus = { el, spot: 'search' }
  else if (el.closest('.fl-bar')) lastFocus = { el, spot: 'bar' }
  else lastFocus = { el, spot: 'other' }
}

/** Focus that leaves for somewhere else is not ours to bring back. */
function onFocusOut(event: FocusEvent) {
  const el = event.target
  setTimeout(() => {
    if (lastFocus?.el === el && (el as HTMLElement).isConnected) lastFocus = null
  })
}

function restoreFocus() {
  const last = lastFocus
  const root = rootEl.value
  if (!last || !root || last.el.isConnected) return
  const active = document.activeElement
  lastFocus = null
  if (active && active !== document.body && active !== document.documentElement) return
  const find = (selector: string) => root.querySelector<HTMLElement>(selector)
  const rowAt = (key?: string) =>
    key === undefined ? null : root.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
  // Rows take focus themselves (one Tab stop for the list, see useKeyboard.ts).
  const inRow = (row: Element | null | undefined) =>
    row instanceof HTMLElement && row.dataset.key !== undefined ? row : null
  let target: HTMLElement | null = null
  if (last.spot === 'row' || last.spot === 'pin') target = inRow(rowAt(last.key))
  // “Show all”: the first row that just appeared.
  else if (last.spot === 'more') target = inRow(rowAt(last.key)?.nextElementSibling)
  else if (last.spot === 'deep') target = find('.fl-deep button') ?? find('.fl-search input')
  else if (last.spot === 'search') target = find('.fl-search input')
  else if (last.spot === 'bar') target = find('.fl-zip-cancel') ?? find('.fl-bar .fl-btn-primary')
  target ??= find('.fl-head input[type="checkbox"]:not(:disabled)') ?? find('.fl-search input')
  target?.focus()
}

onUpdated(() => {
  restoreFocus()
  schedulePin()
})

/** Keeps “Download ZIP” readable in every theme, light and dark (contrast.ts). */
let stopThemeWatch: (() => void) | undefined

onMounted(() => {
  if (/Mac|iPhone|iPad/.test(navigator.platform)) selectAllKeys.value = '⌘A'
  const fit = () => rootEl.value && fitPrimaryButton(rootEl.value)
  fit()
  // Light / dark switches: a class or attribute on <html> or <body>, or only
  // the system setting (themes that follow prefers-color-scheme in CSS).
  const watch = new MutationObserver(fit)
  for (const el of [document.documentElement, document.body])
    watch.observe(el, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)')
  scheme?.addEventListener('change', fit)
  stopThemeWatch = () => {
    watch.disconnect()
    scheme?.removeEventListener('change', fit)
  }
  warnPublicSecrets(props, props.locale)
  passwords.sync()
  void loadRoot()
  void loadSettings()
  rowsPart.mount()
})

onBeforeUnmount(() => {
  stopThemeWatch?.()
  cancelZip()
  rowsPart.unmount()
  clearTimeout(toastTimer)
})
</script>

<template>
  <div
    ref="rootEl"
    class="fl-root"
    :class="{ 'fl-selecting': selected.size > 0, 'fl-refreshing': refreshing, 'fl-toolbar-over-footer': toolbarOverFooter }"
    :style="{ '--fl-sticky-top-auto': `${stickyTop}px` }"
    :aria-busy="refreshing || loadingRoot"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <FileListToolbar
      v-model:keyword="keyword"
      :t="t"
      :display-title="displayTitle"
      :demo="demo"
      :selected-count="selected.size"
      :selected-bytes="selected.size && !batchBusy ? totalSize(selectedFiles) : 0"
      :refreshing="refreshing"
      :loading-root="loadingRoot"
      :batch-busy="batchBusy"
      :zip-progress="zipProgress"
      :zip-percent="zipPercent"
      @clear-selection="clearSelection"
      @clear-filter="clearFilter"
      @refresh="refresh"
      @cancel-zip="cancelZip"
      @batch-download="batchDownload"
    />

    <!-- One Tab stop for the list; arrow keys inside (useKeyboard.ts). -->
    <div
      ref="gridEl"
      class="fl-grid"
      role="treegrid"
      :aria-label="displayTitle"
      aria-multiselectable="true"
      @keydown="keyboard.onKeydown"
      @focusin="keyboard.onFocusin"
      @focusout="keyboard.onFocusout"
      @pointerdown="keyboard.onPointerdown"
    >
    <div class="fl-row fl-head" role="row">
      <span v-if="refreshing" class="fl-progress" aria-hidden="true"></span>
      <span class="fl-cell fl-cell-check" role="columnheader">
        <label class="fl-check-hit">
          <input
            type="checkbox"
            :aria-label="t('selectAll')"
            :disabled="batchBusy"
            :checked="allChecked"
            :indeterminate.prop="someChecked"
            @change="toggleCheckAll"
          />
        </label>
      </span>
      <span
        v-for="column in (['name', 'size', 'modified'] as SortKey[])"
        :key="column"
        class="fl-cell"
        :class="`fl-cell-${column === 'modified' ? 'date' : column}`"
        role="columnheader"
        :aria-sort="sortKey === column ? (sortAsc ? 'ascending' : 'descending') : undefined"
      >
        <button
          class="fl-sort-btn"
          type="button"
          :aria-label="sortKey === column ? t(sortAsc ? 'sortedAscending' : 'sortedDescending', { name: t(column === 'name' ? 'columnName' : column === 'size' ? 'columnSize' : 'columnDate') }) : undefined"
          @click="setSort(column)"
        >
          {{ t(column === 'name' ? 'columnName' : column === 'size' ? 'columnSize' : 'columnDate') }}<span class="fl-sort" aria-hidden="true">{{ sortKey === column ? (sortAsc ? '▲' : '▼') : '' }}</span>
        </button>
      </span>
      <span class="fl-cell fl-cell-op" role="columnheader">
        <span class="fl-sr-only">{{ t('actions') }}</span>
        <SortMenu :sort-key="sortKey" :sort-asc="sortAsc" :uid="uid" :t="t" @sort="applySort" />
      </span>
    </div>

    <!-- While scrolling through a long folder, its row stays at the top with “show less”. -->
    <div class="fl-pin-anchor" :style="{ '--fl-pin-offset': `${pinOffset}px` }">
      <div v-if="pinned" class="fl-pin" role="row" :data-pin="pinned.key" :style="{ '--fl-depth': Math.max(pinned.depth, 0) }">
        <span class="fl-cell fl-cell-check" role="gridcell"></span>
        <span class="fl-cell fl-cell-name" role="gridcell">
          <span v-if="pinned.depth >= 0" class="fl-indent" aria-hidden="true"></span>
          <span v-if="pinned.depth >= 0" class="fl-pin-arrow" aria-hidden="true"><Icon name="next" :size="14" /></span>
          <svg class="fl-folder-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          <span class="fl-pin-name">{{ pinnedName }}</span>
          <span class="fl-pin-count">
            {{ pinned.shown < pinned.total
              ? t('moreShown', { shown: pinned.shown, total: pinned.total })
              : t('allShown', { count: pinned.total }) }}
          </span>
        </span>
        <span class="fl-pin-cell" role="gridcell">
          <button class="fl-pin-less" type="button" :aria-label="t('showLess')" @click="showLess(pinned.key)">
            <span class="fl-pin-less-text">{{ t('showLess') }}</span><Icon name="up" :size="12" />
          </button>
        </span>
      </div>
    </div>


    <template v-for="(node, index) in rows" :key="rowKey(node)">
    <div
      v-if="isMore(node)"
      class="fl-row fl-more"
      role="row"
      :aria-label="t('moreRemaining', { count: node.remaining })"
      :aria-level="node.depth + 1"
      :data-key="rowKey(node)"
      :tabindex="rowTabIndex(node)"
      :style="{ '--fl-depth': node.depth }"
    >
      <span class="fl-cell fl-cell-check" role="gridcell"></span>
      <span class="fl-cell fl-more-cell" role="gridcell">
        <!-- Reads as one more row of the folder: “⋯” in the type column, the count where names start. -->
        <span class="fl-indent" aria-hidden="true"></span>
        <span class="fl-arrow-placeholder" aria-hidden="true"></span>
        <span class="fl-more-tag" aria-hidden="true">⋯</span>
        <span class="fl-more-count">{{ t('moreRemaining', { count: node.remaining }) }}</span>
        <span class="fl-more-actions">
          <template v-if="node.remaining > (pageSize || 0)">
            <button
              class="fl-more-link"
              type="button"
              tabindex="-1"
              :aria-label="t('showNext', { count: pageSize })"
              @click="showMore(node, false)"
            >
              <span class="fl-more-long">{{ t('showNext', { count: pageSize }) }}</span>
              <span class="fl-more-short" aria-hidden="true">{{ t('showNextShort', { count: pageSize }) }}</span>
            </button>
            <button class="fl-more-link fl-more-all" type="button" tabindex="-1" :aria-label="t('showAll')" @click="showMore(node, true)">
              <span class="fl-more-long">{{ t('showAll') }}</span>
              <span class="fl-more-short" aria-hidden="true">{{ t('showAllShort') }}</span>
            </button>
          </template>
          <button v-else class="fl-more-link fl-more-all" type="button" tabindex="-1" @click="showMore(node, true)">
            {{ t('showRest', { count: node.remaining }) }}
          </button>
        </span>
      </span>
    </div>
    <div
      v-else
      class="fl-row"
      :class="{
        'fl-row-dir': node.is_dir,
        'fl-row-root': node.isRoot,
        'fl-row-selected': !node.is_dir && selected.has(node.path),
        'fl-row-locked': !!node.lock,
        'fl-row-prompting': node.lock?.prompting,
        'fl-row-error': node.lock?.prompting && !!node.lock.error,
      }"
      role="row"
      :aria-label="rowLabel(node)"
      :aria-level="node.depth + 1"
      :aria-expanded="node.is_dir ? !!node.expanded : undefined"
      :aria-selected="isChecked(node)"
      :data-key="rowKey(node)"
      :tabindex="rowTabIndex(node)"
      :style="{ '--fl-depth': node.depth }"
      :data-path="node.path"
    >
      <span class="fl-cell fl-cell-check" role="gridcell">
        <label class="fl-check-hit">
          <input
            type="checkbox"
            tabindex="-1"
            :disabled="!!node.lock || batchBusy"
            :aria-label="t('selectItem', { name: node.name })"
            :checked="isChecked(node)"
            :indeterminate.prop="isIndeterminate(node)"
            @change="toggleCheck(node, $event)"
          />
        </label>
      </span>
      <span class="fl-cell fl-cell-name" role="gridcell" :title="node.isRoot ? node.path : undefined">
        <span class="fl-indent" aria-hidden="true"></span>
        <button
          v-if="node.lock"
          class="fl-arrow fl-lock"
          type="button"
          tabindex="-1"
          :aria-label="t('unlockFolder', { name: node.name })"
          :title="t('unlockFolder', { name: node.name })"
          @click="toggleExpand(node)"
        >
          <Icon name="lock" :size="14" />
        </button>
        <button
          v-else-if="node.is_dir"
          class="fl-arrow"
          type="button"
          tabindex="-1"
          :class="{ 'fl-arrow-open': node.expanded }"
          :aria-label="t(node.expanded ? 'collapse' : 'expand', { name: node.name })"
          :aria-expanded="node.expanded"
          @click="toggleExpand(node)"
        >
          <Icon name="next" :size="14" />
        </button>
        <span v-else class="fl-arrow-placeholder" aria-hidden="true"></span>
        <svg v-if="node.is_dir" class="fl-folder-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        <span v-else class="fl-type" :data-kind="fileKind(node.originalName ?? node.name)" aria-hidden="true">{{ extOf(node.originalName ?? node.name) || 'FILE' }}</span>
        <span class="fl-label">
          <span
            class="fl-name"
            :class="{ 'fl-name-dir': node.is_dir }"
            @click="node.lock || node.is_dir ? toggleExpand(node) : download(node)"
          ><template v-for="(part, at) in nameParts(node.name)" :key="at"><mark v-if="part.hit" class="fl-hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></span>
          <span class="fl-meta">
            <template v-if="!node.is_dir">{{ formatSize(node.size) }} · {{ formatDate(node.modified) }}</template>
            <template v-else-if="node.loaded">{{ t('folderItems', { count: statsOf(node).files }) }} · {{ formatSize(statsOf(node).bytes) }}</template>
            <span v-else-if="lockedInSearch(node)" class="fl-locked-note">{{ t('deepLocked') }}</span>
          </span>
        </span>
        <span v-if="lockedInSearch(node) && !node.lock?.prompting" class="fl-locked-note fl-locked-hint">{{ t('deepLocked') }}</span>
        <span v-if="node.is_dir && node.loaded" class="fl-count">{{ t('folderItems', { count: statsOf(node).files }) }}</span>
        <span
          v-if="node.lock?.prompting && node.lock.error"
          :id="`${uid}-error-${index}`"
          class="fl-unlock-message"
          role="alert"
        >{{ unlockErrorText(node.lock.error) }}</span>
        <button
          v-if="!node.lock && remembered.has(node.path)"
          class="fl-remembered"
          type="button"
          :aria-label="`${t('forgetPassword')} ${node.name}`"
          :title="t('forgetPassword')"
          @click="forgetPassword(node)"
        >
          <Icon name="key" :size="11" />
          {{ t('remembered') }} · {{ t('forgetPassword') }}
        </button>
        <span v-if="node.loading" class="fl-loading" aria-hidden="true">…</span>
      </span>
      <div
        v-if="node.lock?.prompting"
        class="fl-unlock fl-unlock-row"
        role="gridcell"
        @keydown.esc.prevent="cancelUnlock(node.lock)"
      >
        <Icon class="fl-unlock-lock" name="lock" :size="18" />
        <input
          v-model="node.lock.input"
          type="password"
          autocomplete="off"
          :data-unlock="node.key"
          :placeholder="node.lock.error ? unlockErrorText(node.lock.error) : t('passwordPlaceholder')"
          :aria-label="t('passwordFor', { name: node.name })"
          :aria-invalid="!!node.lock.error"
          :aria-describedby="node.lock.error ? `${uid}-error-${index}` : undefined"
          @keydown.enter.prevent="node.lock.input && !node.lock.busy && submitUnlock(node)"
        />
        <button
          v-if="canRemember"
          class="fl-unlock-remember"
          type="button"
          :aria-pressed="node.lock.remember"
          :aria-label="t('rememberPassword')"
          :title="t('rememberPassword')"
          @click="node.lock.remember = !node.lock.remember"
        ><Icon name="key" /></button>
        <button class="fl-unlock-submit" type="button" :disabled="node.lock.busy || !node.lock.input" @click="submitUnlock(node)">{{ t('open') }}</button>
        <button class="fl-unlock-cancel" type="button" :aria-label="t('cancel')" :title="t('cancel')" @click="cancelUnlock(node.lock)">
          <Icon name="close" :size="14" />
        </button>
      </div>
      <template v-else>
        <span class="fl-cell fl-cell-size" role="gridcell">{{ node.is_dir ? '' : formatSize(node.size) }}</span>
        <span class="fl-cell fl-cell-date" role="gridcell">{{ formatDate(node.modified) }}</span>
        <span class="fl-cell fl-cell-op" role="gridcell">
          <button
            v-if="node.lock"
            class="fl-action fl-arrow-end fl-lock"
            type="button"
            tabindex="-1"
            :aria-label="t('unlockFolder', { name: node.name })"
            @click="toggleExpand(node)"
          >
            <Icon name="lock" :size="18" />
          </button>
          <button
            v-else-if="node.is_dir"
            class="fl-action fl-arrow-end"
            type="button"
            tabindex="-1"
            :class="{ 'fl-arrow-open': node.expanded }"
            :aria-label="t(node.expanded ? 'collapse' : 'expand', { name: node.name })"
            :aria-expanded="node.expanded"
            @click="toggleExpand(node)"
          >
            <Icon name="next" :size="18" />
          </button>
          <template v-else>
            <button
              v-if="canPreview(node)"
              class="fl-action fl-preview-btn"
              type="button"
              tabindex="-1"
              :aria-label="`${t('preview')} ${node.name}`"
              :title="t('preview')"
              @click="preview(node)"
            ><Icon name="eye" /></button>
            <button
              class="fl-action fl-download"
              type="button"
              tabindex="-1"
              :aria-label="`${t('download')} ${node.name}`"
              :title="t('download')"
              @click="download(node)"
            ><Icon name="download" /></button>
          </template>
        </span>
      </template>
    </div>
    </template>
    </div>

    <!-- Loading, password, error and empty states: outside the treegrid, where only rows belong. -->
    <div v-if="loadingRoot" class="fl-status">{{ t('loading') }}</div>
    <form
      v-else-if="rootLock"
      class="fl-unlock-root"
      :class="{ 'fl-unlock-error': rootLock.error }"
      @submit.prevent="submitRootUnlock"
    >
      <Icon class="fl-unlock-lock" name="lock" />
      <label class="fl-unlock-label" :for="`${uid}-root`">{{ t('passwordPrompt') }}</label>
      <span v-if="rootLock.error" :id="`${uid}-root-error`" class="fl-unlock-message" role="alert">{{ unlockErrorText(rootLock.error) }}</span>
      <span class="fl-unlock">
        <input
          :id="`${uid}-root`"
          v-model="rootLock.input"
          type="password"
          autocomplete="off"
          :data-unlock="path"
          :placeholder="t('passwordPlaceholder')"
          :aria-invalid="!!rootLock.error"
          :aria-describedby="rootLock.error ? `${uid}-root-error` : undefined"
        />
        <button
          v-if="canRemember"
          class="fl-unlock-remember"
          type="button"
          :aria-pressed="rootLock.remember"
          :aria-label="t('rememberPassword')"
          :title="t('rememberPassword')"
          @click="rootLock.remember = !rootLock.remember"
        ><Icon name="key" /></button>
        <button class="fl-unlock-submit" type="submit" :disabled="rootLock.busy || !rootLock.input">{{ t('open') }}</button>
      </span>
    </form>
    <div v-else-if="errorMsg" class="fl-status fl-error">
      {{ t('loadFailed', { message: errorMsg }) }}
      <div v-if="/guest/i.test(errorMsg)" class="fl-hint">{{ t('guestHint') }}</div>
      <div v-if="isNetworkError(errorMsg)" class="fl-hint">{{ t('corsHint') }}</div>
      <button class="fl-btn" type="button" @click="loadRoot">{{ t('retry') }}</button>
    </div>
    <div v-else-if="visible.length === 0" class="fl-status">{{ t('empty') }}</div>

    <div v-if="deepRow" class="fl-deep" role="status">
      <div class="fl-deep-text">
        <template v-if="deepRow === 'running'">
          {{ t('deepRunning', { count: folderCounts.checked }) }} ·
          <button class="fl-deep-link" type="button" @click="pauseDeepSearch">{{ t('deepStop') }}</button>
        </template>
        <template v-else-if="deepRow === 'idle'">
          {{ t('deepHint') }}<button class="fl-deep-link" type="button" @click="deepSearch">{{ t('deepSearch') }}</button>
        </template>
        <template v-else-if="deepRow === 'capped'">
          {{ deepSummary }} ·
          <button class="fl-deep-link" type="button" @click="deepSearch">{{ t('deepContinue') }}</button>
        </template>
        <template v-else-if="deepRow === 'failed'">
          {{ deepSummary }} ·
          <button class="fl-deep-link" type="button" @click="retryDeepSearch">{{ t('retry') }}</button>
        </template>
        <template v-else>{{ deepSummary }}</template>
      </div>
      <span v-if="deepRow === 'running'" class="fl-deep-bar" aria-hidden="true"></span>
    </div>

    <div class="fl-foot">
      <span>{{ t('loaded', { count: allFiles.length }) }} · {{ t('totalSize', { size: formatSize(totalSize(allFiles)) }) }}</span>
      <!-- Shown while keyboard focus is on a row; screen readers get the treegrid roles instead. -->
      <span v-if="keyboardInside" class="fl-keys" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd>{{ t('keyMove') }}</span>
        <span><kbd>←</kbd><kbd>→</kbd>{{ t('keyExpand') }}</span>
        <span><kbd>{{ t('keySpace') }}</kbd>{{ t('keySelect') }}</span>
        <span><kbd>{{ t('keyEnter') }}</kbd>{{ t('keyOpen') }}</span>
        <span><kbd>{{ selectAllKeys }}</kbd>{{ t('keySelectAll') }}</span>
      </span>
    </div>

    <div v-if="toast" class="fl-toast" role="status">{{ toast }}</div>

    <ConfirmDialog
      :open="!!zipDialog"
      :title="zipDialog?.title ?? ''"
      :text="zipDialog?.text ?? ''"
      :tip="zipDialog?.tip"
      :confirm-label="zipDialog?.confirm"
      :cancel-label="zipDialog?.cancel ?? ''"
      @confirm="confirmZip"
      @close="zipNotice = null"
    />

    <PreviewDialog
      :open="!!previewNode"
      :file="previewNode"
      :labels="text"
      :src="previewSrc"
      :viewer="previewViewer"
      :resolving="previewResolving"
      :error="previewError"
      :demo="demo && !!previewNode && !isDemoFile(previewNode.path)"
      :position="previewPosition"
      :total="previewPosition ? previewList.length : 0"
      @close="closePreview"
      @prev="stepPreview(-1)"
      @next="stepPreview(1)"
      @download="previewNode && download(previewNode)"
    />
  </div>
</template>
