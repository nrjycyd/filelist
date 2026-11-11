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
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { createOpenListApi, errorText, isNetworkError } from './api'
import ConfirmDialog from './ConfirmDialog.vue'
import { createDemoApi, isDemoFile } from './demo'
import { warnPublicSecrets } from './devWarnings'
import Icon from './Icon.vue'
import { formatLabel, resolveLabels } from './locales'
import PreviewDialog from './PreviewDialog.vue'
import { useDeepSearch } from './useDeepSearch'
import { useDownloads } from './useDownloads'
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
const api = computed(() => (demo.value ? createDemoApi() : createOpenListApi(props.base, props.token)))

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
  sortOptions,
  sortValue,
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
  stopDeepSearch,
  pauseDeepSearch,
  clearFilter,
  folderCounts,
  lockedInSearch,
  deepSummary,
  nameParts,
} = useDeepSearch(ctx, { roots, refreshing, loadChildren })

const rowsPart = useRows(ctx, { roots, keyword, deepMode })
const { showMore, showLess, resetShown, rows, visible, pinned, pinOffset, pinnedName, stickyTop } = rowsPart

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

async function loadSettings() {
  const settings = await api.value.settings()
  siteTitle.value = settings.title
  iframePreviews.value = settings.iframePreviews
}

onMounted(() => {
  warnPublicSecrets(props, props.locale)
  passwords.sync()
  void loadRoot()
  void loadSettings()
  rowsPart.mount()
})

onBeforeUnmount(() => {
  cancelZip()
  rowsPart.unmount()
  clearTimeout(toastTimer)
})
</script>

<template>
  <div
    ref="rootEl"
    class="fl-root"
    :class="{ 'fl-selecting': selected.size > 0, 'fl-refreshing': refreshing }"
    :style="{ '--fl-sticky-top-auto': `${stickyTop}px` }"
    :aria-busy="refreshing || loadingRoot"
  >
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
      <div v-else-if="selected.size" class="fl-selection" role="status">
        <span class="fl-selection-count">{{ t('selected', { count: selected.size }) }}</span>
        <span class="fl-selection-size">{{ t('totalSize', { size: formatSize(totalSize(selectedFiles)) }) }}</span>
      </div>
      <div v-else class="fl-title">
        <span class="fl-title-text">{{ displayTitle }}</span>
        <span v-if="demo" class="fl-demo-badge">{{ t('demoBadge') }}</span>
      </div>
      <button
        v-if="selected.size && !batchBusy"
        class="fl-clear"
        type="button"
        :aria-label="t('clearSelection')"
        :title="t('clearSelection')"
        @click="clearSelection"
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
            @keydown.esc="keyword && ($event.preventDefault(), clearFilter())"
          />
          <button
            v-if="keyword"
            class="fl-search-clear"
            type="button"
            :aria-label="t('clearFilter')"
            :title="t('clearFilter')"
            @click="clearFilter"
          ><Icon name="close" :size="12" /></button>
        </label>
        <button
          class="fl-icon-btn fl-refresh"
          :class="{ 'fl-spinning': refreshing }"
          type="button"
          :disabled="refreshing || loadingRoot"
          :aria-label="refreshing ? t('refreshing') : t('refresh')"
          :title="refreshing ? t('refreshing') : t('refresh')"
          @click="refresh"
        >
          <Icon name="refresh" :size="15" />
        </button>
      </div>
      <button v-if="batchBusy" class="fl-btn fl-zip-cancel" type="button" @click="cancelZip">{{ t('cancel') }}</button>
      <button v-else-if="selected.size" class="fl-btn fl-btn-primary" type="button" @click="batchDownload">
        <Icon name="download" :size="15" />
        {{ t('batch') }}
      </button>
    </div>

    <div class="fl-row fl-head">
      <span v-if="refreshing" class="fl-progress" aria-hidden="true"></span>
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :aria-label="t('selectAll')"
          :disabled="batchBusy"
          :checked="allChecked"
          :indeterminate.prop="someChecked"
          @change="toggleCheckAll"
        />
      </label>
      <span
        v-for="column in (['name', 'size', 'modified'] as SortKey[])"
        :key="column"
        class="fl-cell"
        :class="`fl-cell-${column === 'modified' ? 'date' : column}`"
      >
        <button
          class="fl-sort-btn"
          type="button"
          :aria-sort="sortKey === column ? (sortAsc ? 'ascending' : 'descending') : undefined"
          @click="setSort(column)"
        >
          {{ t(column === 'name' ? 'columnName' : column === 'size' ? 'columnSize' : 'columnDate') }}<span class="fl-sort" aria-hidden="true">{{ sortKey === column ? (sortAsc ? '▲' : '▼') : '' }}</span>
        </button>
      </span>
      <span class="fl-cell fl-cell-op">
        <label class="fl-sort-select">
          <span>{{ t('sortBy') }}</span>
          <span class="fl-sort-current" aria-hidden="true">{{ sortOptions.find((option) => option.value === sortValue)?.label }}</span>
          <select v-model="sortValue" :aria-label="t('sortBy')">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
      </span>
    </div>

    <!-- While scrolling through a long folder, its row stays at the top with “show less”. -->
    <div class="fl-pin-anchor" :style="{ '--fl-pin-offset': `${pinOffset}px` }">
      <div v-if="pinned" class="fl-pin" :style="{ '--fl-depth': Math.max(pinned.depth, 0) }">
        <span class="fl-cell fl-cell-check"></span>
        <span class="fl-cell fl-cell-name">
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
        <button class="fl-pin-less" type="button" @click="showLess(pinned.key)">
          {{ t('showLess') }}<Icon name="up" :size="12" />
        </button>
      </div>
    </div>

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

    <template v-for="(node, index) in rows" :key="isMore(node) ? `more:${node.key}` : node.path">
    <div
      v-if="isMore(node)"
      class="fl-row fl-more"
      :style="{ '--fl-depth': node.depth }"
    >
      <span class="fl-cell fl-cell-check"></span>
      <span class="fl-cell fl-more-cell">
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
              :aria-label="t('showNext', { count: pageSize })"
              @click="showMore(node, false)"
            >
              <span class="fl-more-long">{{ t('showNext', { count: pageSize }) }}</span>
              <span class="fl-more-short" aria-hidden="true">{{ t('showNextShort', { count: pageSize }) }}</span>
            </button>
            <button class="fl-more-link fl-more-all" type="button" :aria-label="t('showAll')" @click="showMore(node, true)">
              <span class="fl-more-long">{{ t('showAll') }}</span>
              <span class="fl-more-short" aria-hidden="true">{{ t('showAllShort') }}</span>
            </button>
          </template>
          <button v-else class="fl-more-link fl-more-all" type="button" @click="showMore(node, true)">
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
      :style="{ '--fl-depth': node.depth }"
      :data-path="node.path"
    >
      <label class="fl-cell fl-cell-check">
        <input
          type="checkbox"
          :disabled="!!node.lock || batchBusy"
          :aria-label="t('selectItem', { name: node.name })"
          :checked="isChecked(node)"
          :indeterminate.prop="isIndeterminate(node)"
          @change="toggleCheck(node, $event)"
        />
      </label>
      <span class="fl-cell fl-cell-name" :title="node.isRoot ? node.path : undefined">
        <span class="fl-indent" aria-hidden="true"></span>
        <button
          v-if="node.lock"
          class="fl-arrow fl-lock"
          type="button"
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
          :class="{ 'fl-arrow-open': node.expanded }"
          :aria-label="t(node.expanded ? 'collapse' : 'expand', { name: node.name })"
          :aria-expanded="node.expanded"
          @click="toggleExpand(node)"
        >
          <Icon name="next" :size="14" />
        </button>
        <span v-else class="fl-arrow-placeholder" aria-hidden="true"></span>
        <svg v-if="node.is_dir" class="fl-folder-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
        <span v-else class="fl-type" :data-kind="fileKind(node.name)" aria-hidden="true">{{ extOf(node.name) || 'FILE' }}</span>
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
      <form
        v-if="node.lock?.prompting"
        class="fl-unlock fl-unlock-row"
        @submit.prevent="submitUnlock(node)"
        @keydown.esc.prevent="cancelUnlock(node.lock)"
      >
        <Icon class="fl-unlock-lock" name="lock" :size="18" />
        <input
          v-model="node.lock.input"
          type="password"
          autocomplete="off"
          :data-unlock="node.path"
          :placeholder="node.lock.error ? unlockErrorText(node.lock.error) : t('passwordPlaceholder')"
          :aria-label="t('passwordFor', { name: node.name })"
          :aria-invalid="!!node.lock.error"
          :aria-describedby="node.lock.error ? `${uid}-error-${index}` : undefined"
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
        <button class="fl-unlock-submit" type="submit" :disabled="node.lock.busy || !node.lock.input">{{ t('open') }}</button>
        <button class="fl-unlock-cancel" type="button" :aria-label="t('cancel')" :title="t('cancel')" @click="cancelUnlock(node.lock)">
          <Icon name="close" :size="14" />
        </button>
      </form>
      <template v-else>
        <span class="fl-cell fl-cell-size">{{ node.is_dir ? '—' : formatSize(node.size) }}</span>
        <span class="fl-cell fl-cell-date">{{ formatDate(node.modified) }}</span>
        <span class="fl-cell fl-cell-op">
          <button
            v-if="node.lock"
            class="fl-action fl-arrow-end fl-lock"
            type="button"
            :aria-label="t('unlockFolder', { name: node.name })"
            @click="toggleExpand(node)"
          >
            <Icon name="lock" :size="18" />
          </button>
          <button
            v-else-if="node.is_dir"
            class="fl-action fl-arrow-end"
            type="button"
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
              :aria-label="`${t('preview')} ${node.name}`"
              :title="t('preview')"
              @click="preview(node)"
            ><Icon name="eye" /></button>
            <button
              class="fl-action fl-download"
              type="button"
              :aria-label="`${t('download')} ${node.name}`"
              :title="t('download')"
              @click="download(node)"
            ><Icon name="download" /></button>
          </template>
        </span>
      </template>
    </div>
    </template>

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
        <template v-else>{{ deepSummary }}</template>
      </div>
      <span v-if="deepRow === 'running'" class="fl-deep-bar" aria-hidden="true"></span>
    </div>

    <div class="fl-foot">
      <span>{{ t('loaded', { count: allFiles.length }) }} · {{ t('totalSize', { size: formatSize(totalSize(allFiles)) }) }}</span>
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
