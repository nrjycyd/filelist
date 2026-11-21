// @vitest-environment happy-dom
import type { FNode } from '../tree'
import type { Row } from '../useRows'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { rowKey, useKeyboard } from '../useKeyboard'

function makeNode(path: string, name: string, isDir: boolean, depth = 0, expanded = false): FNode {
  return {
    name,
    size: isDir ? 0 : 10,
    is_dir: isDir,
    modified: '2026-01-01T00:00:00Z',
    path,
    key: path,
    depth,
    expanded,
    loaded: isDir && expanded,
    loading: false,
    children: [],
    password: '',
    zipPath: [name],
  }
}

function buildGrid(items: Row[]) {
  const grid = document.createElement('div')
  for (const item of items) {
    const row = document.createElement('div')
    const key = rowKey(item)
    row.dataset.key = key
    row.tabIndex = -1
    row.setAttribute('aria-level', String(('more' in item ? item.depth : item.depth) + 1))
    const check = document.createElement('span')
    check.className = 'fl-cell-check'
    const box = document.createElement('input')
    box.type = 'checkbox'
    check.appendChild(box)
    row.appendChild(check)
    if (!('more' in item)) {
      const name = document.createElement('span')
      name.className = 'fl-name'
      name.textContent = item.name
      row.appendChild(name)
      if (!item.is_dir) {
        const btn = document.createElement('button')
        btn.className = 'fl-download'
        btn.getClientRects = () => [{ width: 10, height: 10 }] as unknown as DOMRectList
        row.appendChild(btn)
      }
    }
    grid.appendChild(row)
  }
  document.body.appendChild(grid)
  return grid
}

function keyEvent(key: string, target: HTMLElement, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useKeyboard', () => {
  it('moves focus across rows with arrows, Home/End, type-ahead and roving tabindex', () => {
    const dirA = makeNode('/A', 'Alpha', true, 0, true)
    const child = makeNode('/A/b.txt', 'Beta.txt', false, 1)
    const fileC = makeNode('/c.txt', 'Charlie.txt', false, 0)
    const more: Row = { more: true, key: '/', depth: 0, remaining: 5 }
    const rows = ref<Row[]>([dirA, child, fileC, more])
    const grid = buildGrid(rows.value)

    const toggleExpand = vi.fn()
    const open = vi.fn()
    const showNext = vi.fn()
    const toggleAll = vi.fn()
    const kb = useKeyboard({
      grid: ref(grid),
      rows: computed(() => rows.value),
      toggleExpand,
      open,
      showNext,
      toggleAll,
    })

    const el = (index: number) => grid.children[index] as HTMLElement
    expect(kb.rowTabIndex(dirA)).toBe(0)
    expect(kb.rowTabIndex(child)).toBe(-1)

    // ArrowRight on expanded folder moves to first child; ArrowLeft climbs back to parent.
    el(0).focus()
    kb.onKeydown(keyEvent('ArrowRight', el(0)))
    expect(document.activeElement).toBe(el(1))
    expect(kb.rowTabIndex(child)).toBe(0)

    kb.onKeydown(keyEvent('ArrowLeft', el(1)))
    expect(document.activeElement).toBe(el(0))

    // ArrowLeft on expanded folder collapses it.
    kb.onKeydown(keyEvent('ArrowLeft', el(0)))
    expect(toggleExpand).toHaveBeenCalledWith(dirA)

    // End / Home jump to last and first row.
    kb.onKeydown(keyEvent('End', el(0)))
    expect(document.activeElement).toBe(el(3))
    kb.onKeydown(keyEvent('Enter', el(3)))
    expect(showNext).toHaveBeenCalledWith(more)

    kb.onKeydown(keyEvent('Home', el(3)))
    expect(document.activeElement).toBe(el(0))

    // Type-ahead jumps to matching row; Enter opens file; ArrowRight focuses row button.
    kb.onKeydown(keyEvent('c', el(0)))
    expect(document.activeElement).toBe(el(2))
    kb.onKeydown(keyEvent('Enter', el(2)))
    expect(open).toHaveBeenCalledWith(fileC)
    kb.onKeydown(keyEvent('ArrowRight', el(2)))
    expect(document.activeElement).toBe(el(2).querySelector('.fl-download'))

    // Space clicks the row checkbox.
    const box = el(2).querySelector('input')!
    const clickSpy = vi.spyOn(box, 'click')
    kb.onKeydown(keyEvent(' ', el(2)))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
