import type { Ref } from 'vue'
import { watch } from 'vue'

/** Sync a native `<dialog>` element with an `open` prop, including Esc and backdrop clicks. */
export function useDialog(
  dialog: Ref<HTMLDialogElement | undefined>,
  open: () => boolean,
  onClose: () => void,
) {
  watch(
    open,
    (isOpen) => {
      const el = dialog.value
      if (!el) return
      if (isOpen && !el.open) {
        if (typeof el.showModal === 'function') el.showModal()
        else el.setAttribute('open', '')
      } else if (!isOpen && el.open) {
        if (typeof el.close === 'function') el.close()
        else el.removeAttribute('open')
      }
    },
    { flush: 'post', immediate: true },
  )

  return {
    onNativeClose() {
      if (open()) onClose()
    },
    onBackdrop(event: MouseEvent) {
      if (event.target === dialog.value) onClose()
    },
  }
}
