import type { Locator, Page, TestInfo } from '@playwright/test'
import type { Rgb } from '../src/client/contrast'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readableBackground } from '../src/client/contrast'

const list = (page: Page) => page.locator('.fl-root').first()
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const row = (page: Page, name: string) =>
  list(page).locator('.fl-row').filter({ has: page.locator('.fl-name', { hasText: new RegExp(`^${escape(name)}$`) }) })
/** The expand / lock button that is shown (left arrow on wide lists, right one on narrow). */
const opener = (target: Locator) => target.locator('.fl-arrow, .fl-arrow-end').locator('visible=true').first()
const rowHeight = (info: TestInfo) => (info.project.name === 'mobile' ? 60 : 44)
/** A file's buttons, which a mouse finds by pointing at its row (wide lists). */
const button = (target: Locator, selector: string) => target.hover().then(() => target.locator(selector))

async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(list(page).locator('.fl-row:not(.fl-head)').first()).toBeVisible()
}

async function box(target: Locator) {
  const rect = await target.boundingBox()
  if (!rect) throw new Error('not rendered')
  return rect
}

async function expectOnScreen(page: Page, target: Locator) {
  const rect = await box(target)
  const viewport = page.viewportSize()!
  expect(rect.y).toBeGreaterThanOrEqual(0)
  expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1)
}

async function check(page: Page, ...names: string[]) {
  for (const name of names) await row(page, name).locator('.fl-cell-check input').check()
}

/** Chromium only: stand in for the system "Save as" dialog with a real file in OPFS. */
async function fakeSaveDialog(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = async () =>
      (await navigator.storage.getDirectory()).getFileHandle('out.zip', { create: true })
  })
}

async function savedZip(page: Page) {
  return page.evaluate(async () => {
    const saved = await (await (await navigator.storage.getDirectory()).getFileHandle('out.zip')).getFile()
    return { size: saved.size, head: [...new Uint8Array(await saved.slice(0, 2).arrayBuffer())] }
  })
}

const streams = (info: TestInfo) => info.project.name !== 'webkit'

test('rows keep one height and the page never scrolls sideways', async ({ page }, info) => {
  await open(page)
  for (const name of ['Locked', 'photos', 'big-a.bin']) expect((await box(row(page, name))).height).toBe(rowHeight(info))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

/** Left and right edges of what is inside the card, from its inner edges. */
async function edges(page: Page) {
  return list(page).evaluate((root) => {
    const card = root.getBoundingClientRect()
    const border = Number.parseFloat(getComputedStyle(root).borderLeftWidth)
    const rect = (el: Element | null) => {
      if (!el) return null
      // text: its glyphs, not its box
      const range = document.createRange()
      range.selectNodeContents(el)
      const r = el.tagName !== 'INPUT' && el.textContent?.trim() ? range.getBoundingClientRect() : el.getBoundingClientRect()
      return r.width ? { left: Math.round(r.left - card.left - border), right: Math.round(card.right - border - r.right) } : null
    }
    const q = (selector: string) => rect(root.querySelector(selector))
    const file = root.querySelector('.fl-download')?.closest('.fl-row') ?? null
    return {
      title: q('.fl-title-text'),
      search: q('.fl-search'),
      refresh: q('.fl-refresh'),
      headCheck: q('.fl-head .fl-cell-check input'),
      rowCheck: rect(file?.querySelector('.fl-cell-check input') ?? null),
      download: rect(file?.querySelector('.fl-download svg') ?? null),
      showAll: q('.fl-more-all'),
      date: q('.fl-row:not(.fl-head) .fl-cell-date'),
      headDate: q('.fl-head .fl-cell-date .fl-sort-btn'),
      sort: q('.fl-sort-chevron'),
      foot: q('.fl-foot > *'),
    }
  })
}

test('one margin on each side: everything at the left and at the right lines up', async ({ page }, info) => {
  await open(page)
  await opener(row(page, 'photos')).click()
  await expect(list(page).locator('.fl-more')).toBeVisible()
  const phone = info.project.name === 'mobile'
  const gutter = phone ? 16 : 24
  const e = await edges(page)
  const near = (value: number | undefined) => expect(Math.abs((value ?? Number.NaN) - gutter)).toBeLessThanOrEqual(1)
  for (const left of [phone ? e.search : e.title, e.headCheck, e.rowCheck, e.foot]) near(left?.left)
  for (const right of [e.refresh, e.download, e.showAll, ...(phone ? [e.sort] : [e.date, e.headDate])]) near(right?.right)
})

test('wide lists: a file\'s buttons take the place of its date while it is pointed at or focused', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'phones show the buttons in every row')
  await open(page)
  const file = row(page, 'notes.txt')
  const folder = row(page, 'photos')
  const opacity = (target: Locator) => target.evaluate((el) => getComputedStyle(el).opacity)
  await page.mouse.move(0, 0)
  await expect.poll(() => opacity(file.locator('.fl-cell-op'))).toBe('0')
  await expect.poll(() => opacity(file.locator('.fl-cell-date'))).toBe('1')
  // one column for both, at the right margin
  const [date, op] = await Promise.all([box(file.locator('.fl-cell-date')), box(file.locator('.fl-cell-op'))])
  expect(Math.abs(op.x + op.width - (date.x + date.width) - 6)).toBeLessThanOrEqual(1)

  await file.hover()
  await expect.poll(() => opacity(file.locator('.fl-cell-op'))).toBe('1')
  await expect.poll(() => opacity(file.locator('.fl-cell-date'))).toBe('0')
  // the date heading under the header's (empty) actions cell still sorts
  await list(page).locator('.fl-head .fl-cell-date .fl-sort-btn').click()
  await expect(list(page).locator('.fl-head .fl-cell-date')).toHaveAttribute('aria-sort', /ascending|descending/)
  await file.hover()
  // folders keep their date
  await folder.hover()
  await expect.poll(() => opacity(folder.locator('.fl-cell-date'))).toBe('1')
  await expect.poll(() => opacity(file.locator('.fl-cell-op'))).toBe('0')

  // keyboard: the buttons show on the focused row, and on the row of a focused button
  await page.mouse.move(0, 0)
  await file.focus()
  await page.keyboard.press('ArrowRight')
  await expect(file.locator('.fl-preview-btn')).toBeFocused()
  await expect.poll(() => opacity(file.locator('.fl-cell-op'))).toBe('1')
  await page.keyboard.press('ArrowLeft')
  await expect(file).toBeFocused()
  await expect.poll(() => opacity(file.locator('.fl-cell-op'))).toBe('1')
})

test('folder passwords are asked for in the row, without moving anything', async ({ page }, info) => {
  await open(page)
  const locked = row(page, 'Locked')
  const next = row(page, 'photos')
  const before = (await box(next)).y

  await opener(locked).click()
  await expect(locked).toHaveClass(/fl-row-prompting/)
  expect((await box(locked)).height).toBe(rowHeight(info))
  expect((await box(next)).y).toBe(before)

  if (info.project.name === 'mobile') {
    // lock under the folder icons; lock, input, key, Open, ✕: 12px apart to the eye, ✕ at the 16px margin, 40 × 44 to tap
    const glyph = (selector: string) => box(locked.locator(`${selector} svg`).first())
    const [lock, field, key, open, cancel, card] = await Promise.all([
      box(locked.locator('svg.fl-unlock-lock')),
      box(locked.locator('.fl-unlock-row input')),
      glyph('.fl-unlock-remember'),
      box(locked.locator('.fl-unlock-submit')),
      glyph('.fl-unlock-cancel'),
      box(list(page)),
    ])
    const gaps = [field.x - (lock.x + lock.width), key.x - (field.x + field.width), open.x - (key.x + key.width), cancel.x - (open.x + open.width)]
    for (const gap of gaps) expect(Math.abs(gap - 12)).toBeLessThanOrEqual(1)
    expect(Math.abs(card.x + card.width - 1 - (cancel.x + cancel.width) - 16)).toBeLessThanOrEqual(1)
    expect(Math.abs(lock.x - (await box(next.locator('.fl-folder-icon'))).x)).toBeLessThanOrEqual(1)
    for (const button of ['.fl-unlock-remember', '.fl-unlock-cancel']) {
      const hit = await box(locked.locator(button))
      expect(hit.width).toBeGreaterThanOrEqual(40)
      expect(hit.height).toBeGreaterThanOrEqual(44)
    }
    // the targets reach into the gaps, not over the input or Open
    const [keyHit, openBox, cancelHit] = await Promise.all(['.fl-unlock-remember', '.fl-unlock-submit', '.fl-unlock-cancel'].map((s) => box(locked.locator(s))))
    expect(keyHit.x).toBeGreaterThanOrEqual(field.x + field.width - 0.5)
    expect(keyHit.x + keyHit.width).toBeLessThanOrEqual(openBox.x + 0.5)
    expect(cancelHit.x).toBeGreaterThanOrEqual(openBox.x + openBox.width - 0.5)
  }

  const input = locked.locator('.fl-unlock-row input')
  await input.fill('0000')
  await input.press('Enter')
  await expect(locked).toHaveClass(/fl-row-error/)
  await expect(input).toBeFocused()
  expect((await box(locked)).height).toBe(rowHeight(info))
  expect((await box(next)).y).toBe(before)

  await locked.locator('.fl-unlock-remember').click()
  await input.fill('1234')
  await input.press('Enter')
  await expect(row(page, 'secret-1.txt')).toBeVisible()
  await expect(locked.locator('.fl-remembered')).toBeVisible()

  // Remembered for this tab: a reload opens it without asking.
  await page.reload()
  await opener(row(page, 'Locked')).click()
  await expect(row(page, 'secret-2.txt')).toBeVisible()
})

test('a locked source root unlocks in place', async ({ page }) => {
  await open(page, '/sources')
  const locked = row(page, 'Locked')
  await expect(locked).toHaveClass(/fl-row-locked/)
  await opener(locked).click()
  await locked.locator('.fl-unlock-row input').fill('1234')
  await locked.locator('.fl-unlock-row input').press('Enter')
  await expect(row(page, 'secret-1.txt')).toBeVisible()
})

test('refresh keeps the rows and open folders', async ({ page }) => {
  await open(page)
  await opener(row(page, 'photos')).click()
  await expect(list(page).locator('.fl-more')).toBeVisible()

  await page.route('**/api/fs/list', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.continue()
  })
  await list(page).locator('.fl-refresh').click()
  await expect(list(page)).toHaveClass(/fl-refreshing/)
  await expect(list(page).locator('.fl-progress')).toBeVisible()
  await expect(row(page, 'IMG_0001.jpg')).toBeVisible()
  await expect(list(page)).not.toHaveClass(/fl-refreshing/)
  await expect(list(page).locator('.fl-more')).toBeVisible()
})

test('long folders: a quiet last row, and the folder pinned with “show less” while scrolling', async ({ page }, info) => {
  await open(page)
  await opener(row(page, 'photos')).click()
  const files = list(page).locator('.fl-row:not(.fl-head):not(.fl-more):not(.fl-row-dir)')
  const fileCount = async () => (await files.count()) - 4 // big-a, big-b, broken, notes
  const more = list(page).locator('.fl-more')
  const pin = list(page).locator('.fl-pin')
  await expect(more.locator('.fl-more-count')).toHaveText('还有 435 项')
  expect((await box(more)).height).toBe(rowHeight(info))
  expect(await fileCount()).toBe(15)

  // The last row reads as one more row: “⋯” in the type column, the count where names start.
  const file = row(page, 'IMG_0015.jpg')
  const centre = (b: { x: number; width: number }) => b.x + b.width / 2
  expect(Math.abs(centre(await box(more.locator('.fl-more-tag'))) - centre(await box(file.locator('.fl-type'))))).toBeLessThan(1)
  expect(Math.abs((await box(more.locator('.fl-more-count'))).x - (await box(file.locator('.fl-label'))).x)).toBeLessThan(1)
  const card = await box(list(page))
  const links = more.locator('.fl-more-link')
  const right = await links.last().evaluate((el) => el.getBoundingClientRect().right)
  expect(right).toBeLessThanOrEqual(card.x + card.width + 1)
  expect(right).toBeGreaterThan(card.x + card.width - 24)
  expect(await more.locator('.fl-more-count').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  if (info.project.name === 'mobile') {
    // Small to look at, still a 44px target.
    await links.first().scrollIntoViewIfNeeded()
    const link = await box(links.first())
    expect(link.height).toBe(32)
    for (const y of [link.y - 5.5, link.y + link.height + 5.5]) {
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.className ?? '', [link.x + 8, y])).toContain('fl-more-link')
    }
  }

  // No pin while only the first page shows, or while the folder's own row is on screen.
  await row(page, 'photos').scrollIntoViewIfNeeded()
  await expect(pin).toHaveCount(0)

  // “Show 15 more” stays put for the next click.
  await links.first().scrollIntoViewIfNeeded()
  const before = await box(links.first())
  await links.first().click()
  expect(await fileCount()).toBe(30)
  expect(Math.abs((await box(links.first())).x - before.x)).toBeLessThan(1)

  await more.locator('.fl-more-all').click()
  expect(await fileCount()).toBe(450)
  await expect(more).toHaveCount(0) // the list simply ends

  await row(page, 'photos').scrollIntoViewIfNeeded()
  await expect(pin).toHaveCount(0)
  // Inside the folder: its row is pinned at the top, below the theme's bars.
  await row(page, 'IMG_0300.jpg').scrollIntoViewIfNeeded()
  await expect(pin).toBeVisible()
  await expect(pin.locator('.fl-pin-name')).toHaveText('photos')
  const pinned = await box(pin)
  expect(pinned.y).toBeGreaterThanOrEqual(0)
  expect(pinned.y).toBeLessThan(140)
  expect(Math.abs((await box(pin.locator('.fl-folder-icon'))).x - (await box(row(page, 'photos').locator('.fl-folder-icon'))).x)).toBeLessThan(1)

  // “Show less”: its arrow in the column of the row buttons' icons.
  const less = await box(pin.locator('.fl-pin-less svg'))
  const download = await box(row(page, 'IMG_0300.jpg').locator('.fl-download svg'))
  expect(Math.abs(less.x + less.width / 2 - (download.x + download.width / 2))).toBeLessThan(1)
  if (info.project.name === 'mobile') {
    // Phones: only the arrow.
    await expect(pin.locator('.fl-pin-less-text')).toBeHidden()
    expect((await box(pin.locator('.fl-pin-less'))).height).toBeGreaterThanOrEqual(44)
  }

  // “Show less” from the middle: back to the first page, the folder's row on screen.
  await row(page, 'IMG_0200.jpg').scrollIntoViewIfNeeded()
  await pin.locator('.fl-pin-less').click()
  expect(await fileCount()).toBe(15)
  await expect(pin).toHaveCount(0)
  await expect(more.locator('.fl-more-count')).toHaveText('还有 435 项')
  const folder = await box(row(page, 'photos'))
  expect(folder.y).toBeGreaterThanOrEqual(0)
  expect(folder.y + folder.height).toBeLessThanOrEqual(page.viewportSize()!.height)
})

test('a single download stays on the page and the toast is on screen', async ({ page, context }) => {
  await open(page)
  // A long open folder makes the card much taller than the screen.
  await opener(row(page, 'photos')).click()
  await list(page).locator('.fl-more .fl-more-all').click()
  const url = page.url()
  let popups = 0
  context.on('page', () => popups++)

  // A file at the top: the card's bottom is now far below the screen.
  await row(page, 'IMG_0001.jpg').scrollIntoViewIfNeeded()
  expect((await box(list(page))).y + (await box(list(page))).height).toBeGreaterThan(page.viewportSize()!.height * 3)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button(row(page, 'IMG_0001.jpg'), '.fl-download').then((b) => b.click()),
  ])
  expect(await download.failure()).toBeNull()
  expect(page.url()).toBe(url)
  expect(popups).toBe(0)
  const toast = list(page).locator('.fl-toast')
  await expect(toast).toHaveText('已交给浏览器下载：IMG_0001.jpg')
  await expectOnScreen(page, toast)
})

test('in-memory ZIP asks above the warning size and produces an archive', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await open(page)
  await check(page, 'big-a.bin', 'big-b.bin')
  await list(page).locator('.fl-bar .fl-btn-primary').click()

  const dialog = page.locator('dialog.fl-confirm')
  await expect(dialog.locator('.fl-confirm-title')).toHaveText('文件较大（4.0 MB）')
  await expectOnScreen(page, dialog)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.locator('.fl-btn-primary').click(),
  ])
  const zip = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
  })
  expect(zip.subarray(0, 2).toString()).toBe('PK')
  expect(zip.length).toBeGreaterThan(4 * 1024 * 1024)
  expect(zip.includes('big-a.bin')).toBe(true)
  expect(zip.includes('big-b.bin')).toBe(true)
})

test('streaming ZIP shows progress, locks the selection and writes the file', async ({ page }, info) => {
  test.skip(!streams(info), 'Safari cannot stream to disk')
  await fakeSaveDialog(page)
  await open(page)
  await page.route('**/p/big-b.bin', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await check(page, 'big-a.bin', 'big-b.bin')
  await list(page).locator('.fl-bar .fl-btn-primary').click()

  await expect(list(page).locator('.fl-zip-cancel')).toBeVisible()
  await expect(list(page).locator('.fl-selection-count')).toHaveText(/^打包中 \d+%$/)
  await expect(row(page, 'big-a.bin').locator('.fl-cell-check input')).toBeDisabled()
  await expect(list(page).locator('.fl-toast')).toContainText('已打包', { timeout: 15_000 })

  const saved = await savedZip(page)
  expect(saved.head).toEqual([0x50, 0x4b])
  expect(saved.size).toBeGreaterThan(4 * 1024 * 1024)
})

test('cancelling a ZIP keeps the selection', async ({ page }, info) => {
  if (streams(info)) await fakeSaveDialog(page)
  await open(page)
  await page.route('**/p/big-b.bin', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000))
    await route.continue().catch(() => {})
  })
  await check(page, 'big-a.bin', 'notes.txt', 'big-b.bin')
  await list(page).locator('.fl-bar .fl-btn-primary').click()
  // In-memory browsers ask first (over the 3 MB warning size of the fixture page).
  if (!streams(info)) await page.locator('dialog.fl-confirm .fl-btn-primary').click()

  await list(page).locator('.fl-zip-cancel').click()
  await expect(list(page).locator('.fl-toast')).toHaveText('已取消下载')
  await expect(list(page).locator('.fl-selection-count')).toHaveText('已选 3 项')
})

test('a failed ZIP explains why in a dialog on screen', async ({ page }, info) => {
  if (streams(info)) await fakeSaveDialog(page)
  await open(page)
  await check(page, 'notes.txt', 'broken.bin')
  await list(page).locator('.fl-bar .fl-btn-primary').click()

  const dialog = page.locator('dialog.fl-confirm')
  await expect(dialog.locator('.fl-confirm-title')).toHaveText('打包失败')
  await expect(dialog.locator('.fl-confirm-text').first()).toHaveText('broken.bin：HTTP 500')
  // VitePress' paragraph margins stay out of the component.
  expect(await dialog.locator('.fl-confirm-title').evaluate((el) => getComputedStyle(el).margin)).toBe('0px 0px 10px')
  await expectOnScreen(page, dialog)
  await dialog.locator('.fl-btn-primary').click()
  await expect(list(page).locator('.fl-selection-count')).toHaveText('已选 2 项')
})

test('Markdown shows source first and renders safely in the VitePress style', async ({ page }) => {
  await open(page)
  await opener(row(page, 'docs')).click()
  await (await button(row(page, 'guide.md'), '.fl-preview-btn')).click()
  const dialog = page.locator('dialog.fl-preview')
  await expect(dialog.locator('.fl-preview-text pre')).toContainText('# 安装指南')

  await dialog.locator('.fl-preview-view-btn', { hasText: '渲染' }).click()
  const doc = dialog.locator('.fl-md.vp-doc')
  await expect(doc.locator('h1')).toHaveText('安装指南')
  await expect(doc.locator('a')).toHaveCount(1)
  await expect(doc.locator('a')).toHaveAttribute('target', '_blank')
  await expect(doc).toContainText('另一篇')
  await expect(doc.locator('.fl-md-image')).toHaveText(['［图片：拓扑图］', '［图片：x］'])
  await expect(doc.locator('script')).toHaveCount(0)
  expect(await doc.innerHTML()).not.toContain('onerror')
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  // VitePress' doc styles apply (headings are larger than body text).
  const sizes = await doc.evaluate((el) => [
    Number.parseFloat(getComputedStyle(el.querySelector('h1')!).fontSize),
    Number.parseFloat(getComputedStyle(el.querySelector('p')!).fontSize),
  ])
  expect(sizes[0]).toBeGreaterThan(sizes[1])
})

test('HTML renders in a script-less sandbox', async ({ page }) => {
  await open(page)
  await opener(row(page, 'docs')).click()
  await (await button(row(page, 'page.html'), '.fl-preview-btn')).click()
  const dialog = page.locator('dialog.fl-preview')
  await expect(dialog.locator('.fl-preview-text pre')).toContainText('<h1 id="title">')

  await dialog.locator('.fl-preview-view-btn', { hasText: '渲染' }).click()
  const frame = dialog.locator('iframe.fl-preview-html')
  await expect(frame).toHaveAttribute('sandbox', '')
  await expect(page.frameLocator('iframe.fl-preview-html').locator('#title')).toHaveText('报告')
  expect((await box(frame)).height).toBeGreaterThan(200)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
})

test('deep search finds files in folders that were never opened, in place', async ({ page }, info) => {
  await open(page)
  await list(page).locator('.fl-search input').fill('needle')
  const status = list(page).locator('.fl-deep')
  await expect(status).toHaveText('只筛选了已加载的内容，尝试深度搜索')
  // One line high: a file row on wide lists, a little lower than one on phones.
  expect(Math.round((await box(status)).height)).toBe(info.project.name === 'mobile' ? 48 : rowHeight(info))
  if (info.project.name === 'mobile') expect((await box(status.locator('.fl-deep-link'))).height).toBeGreaterThanOrEqual(44)
  await status.locator('.fl-deep-link').click()

  await expect(row(page, 'needle-report.pdf')).toBeVisible()
  for (const folder of ['deep', 'a', 'b']) await expect(row(page, folder)).toBeVisible()
  // Locked folders that may hide matches are shown, locked, without prompting.
  await expect(status).toContainText('跳过 2 个加密文件夹')
  await expect(row(page, 'Locked deep')).toHaveClass(/fl-row-locked/)
  await expect(list(page).locator('.fl-row-prompting')).toHaveCount(0)
  await check(page, 'needle-report.pdf')
  await expect(list(page).locator('.fl-selection-count')).toHaveText('已选 1 项')
})

test('deep search survives a refresh; its status line is centred and stays on screen', async ({ page }) => {
  await open(page)
  await list(page).locator('.fl-search input').fill('needle')
  const status = list(page).locator('.fl-deep')
  await status.locator('.fl-deep-link').click()
  await expect(row(page, 'needle-report.pdf')).toBeVisible()
  await expect(status).toContainText('已搜索全部')
  const summary = await status.innerText()

  await list(page).locator('.fl-refresh').click()
  await expect(list(page)).not.toHaveClass(/fl-refreshing/)
  await expect(row(page, 'needle-report.pdf')).toBeVisible()
  await expect(row(page, 'Locked deep')).toHaveClass(/fl-row-locked/)
  await expect(status.locator('.fl-deep-link')).toHaveCount(0)
  await expect(status).toHaveText(summary)

  // Centred, and nothing in it pokes out of the card or the screen.
  const card = await box(list(page))
  const line = await box(status.locator('.fl-deep-text'))
  expect(Math.abs(line.x + line.width / 2 - (card.x + card.width / 2))).toBeLessThan(2)
  const widest = await status.evaluate((el) => Math.max(...[...el.querySelectorAll('*')].map((child) => child.getBoundingClientRect().right)))
  expect(widest).toBeLessThanOrEqual(Math.min(card.x + card.width, page.viewportSize()!.width) + 1)
})

test('the × in the filter box clears the filter', async ({ page }) => {
  await open(page)
  const input = list(page).locator('.fl-search input')
  await input.fill('needle')
  await list(page).locator('.fl-deep .fl-deep-link').click()
  await expect(row(page, 'needle-report.pdf')).toBeVisible()

  await list(page).locator('.fl-search-clear').click()
  await expect(input).toHaveValue('')
  await expect(list(page).locator('.fl-deep')).toHaveCount(0)
  await expect(row(page, 'needle-report.pdf')).toHaveCount(0)
  await expect(row(page, 'deep')).toBeVisible()
})

test('demo data: the sample files preview, download and zip for real', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
  })
  await open(page, '/demo')
  await opener(row(page, '示例文件')).click()

  await (await button(row(page, '使用说明.md'), '.fl-preview-btn')).click()
  const dialog = page.locator('dialog.fl-preview')
  await expect(dialog.locator('.fl-preview-text pre')).toContainText('# 使用说明')
  await dialog.locator('.fl-preview-view-btn', { hasText: '渲染' }).click()
  await expect(dialog.locator('.fl-md.vp-doc h1')).toHaveText('使用说明')
  await expect(dialog.locator('.fl-md.vp-doc table')).toBeVisible()
  await page.keyboard.press('Escape')

  // Other demo files still only describe what would happen.
  await opener(row(page, 'exams')).click()
  await (await button(row(page, '2024 期中试题.pdf'), '.fl-download')).click()
  await expect(list(page).locator('.fl-toast')).toContainText('演示模式')

  await check(page, '示例文件')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    list(page).locator('.fl-bar .fl-btn-primary').click(),
  ])
  const zip = await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks)
  })
  expect(zip.subarray(0, 2).toString()).toBe('PK')
  for (const name of ['使用说明.md', '讲义.pdf', '课程海报.svg']) expect(zip.includes(Buffer.from(name))).toBe(true)
})

test('keyboard focus stays in the list when the control it was on goes away', async ({ page }) => {
  await open(page)

  // Unlocking: the password form gives way to the folder's own button.
  const locked = row(page, 'Locked')
  await opener(locked).focus()
  await page.keyboard.press('Enter')
  const input = locked.locator('.fl-unlock-row input')
  await expect(input).toBeFocused()
  await input.fill('1234')
  await input.press('Enter')
  await expect(row(page, 'secret-1.txt')).toBeVisible()
  await expect(locked).toBeFocused()

  // “Show all”: the first row that just appeared.
  await opener(row(page, 'photos')).click()
  await list(page).locator('.fl-more .fl-more-all').focus()
  await page.keyboard.press('Enter')
  await expect(list(page).locator('.fl-more')).toHaveCount(0)
  await expect(row(page, 'IMG_0016.jpg')).toBeFocused()

  // The × in the filter box: back in the filter box.
  const search = list(page).locator('.fl-search input')
  await search.fill('IMG_00')
  await list(page).locator('.fl-search-clear').focus()
  await page.keyboard.press('Enter')
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()

  // “Clear” in the selection bar: the “select all” box.
  await check(page, 'big-a.bin')
  await list(page).locator('.fl-clear').focus()
  await page.keyboard.press('Enter')
  await expect(list(page).locator('.fl-head .fl-cell-check input')).toBeFocused()
})

/** axe-core on the list in its main states, colour contrast included. */
async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include('.fl-root').analyze()
  const found = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(found).toEqual([])
}

test('no accessibility violations in the main states (axe)', async ({ page }) => {
  await open(page)
  await expectAccessible(page)

  await opener(row(page, 'photos')).click()
  await check(page, 'big-a.bin')
  await expectAccessible(page)

  await opener(row(page, 'Locked')).click()
  await expect(row(page, 'Locked')).toHaveClass(/fl-row-prompting/)
  await expectAccessible(page)
  await page.keyboard.press('Escape')

  await opener(row(page, 'docs')).click()
  await (await button(row(page, 'guide.md'), '.fl-preview-btn')).click()
  await expect(page.locator('dialog.fl-preview .fl-preview-text pre')).toBeVisible()
  await expectAccessible(page)
})

/* ---------------- keyboard model (treegrid) ---------------- */

const focusedKey = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.key)

test('the list is one Tab stop, whatever its length', async ({ page }, info) => {
  await open(page)
  const stops = async () => {
    await list(page).locator('.fl-search input').focus()
    let count = 0
    for (; count < 50; count++) {
      await page.keyboard.press('Tab')
      if (!(await page.evaluate(() => !!document.activeElement?.closest('.fl-root')))) break
    }
    return count
  }
  // Wide: refresh, select all, three column headers, one row. Narrow lists swap
  // the headers for a sort menu; either way the rows count once.
  const before = await stops()
  if (info.project.name !== 'mobile') expect(before).toBe(6)
  expect(before).toBeLessThanOrEqual(6)
  await opener(row(page, 'photos')).click()
  await list(page).locator('.fl-more .fl-more-all').click()
  await expect(row(page, 'IMG_0450.jpg')).toBeVisible()
  expect(await stops()).toBe(before)
})

test('arrow keys move between rows and open, close and climb folders', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'no arrow keys on phones')
  await open(page)
  const grid = list(page).locator('[role="treegrid"]')
  await expect(grid).toHaveAttribute('aria-multiselectable', 'true')
  await row(page, 'deep').focus()

  await page.keyboard.press('ArrowDown')
  expect(await focusedKey(page)).toBe('/docs')
  await page.keyboard.press('End')
  expect(await focusedKey(page)).toBe('/notes.txt')
  await page.keyboard.press('Home')
  expect(await focusedKey(page)).toBe('/deep')

  // → opens a folder, → again goes to its first child, ← climbs back, ← closes.
  await page.keyboard.press('ArrowDown')
  const docs = row(page, 'docs')
  await page.keyboard.press('ArrowRight')
  await expect(docs).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'guide.md')).toBeFocused()
  await expect(row(page, 'guide.md')).toHaveAttribute('aria-level', '2')
  await page.keyboard.press('ArrowLeft')
  await expect(docs).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(docs).toHaveAttribute('aria-expanded', 'false')

  // Typing jumps to a name; the same letter again goes to the next one.
  await page.keyboard.press('p')
  await expect(row(page, 'photos')).toBeFocused()
  await page.waitForTimeout(700) // letters typed within 0.6 s make one name
  await page.keyboard.press('b')
  await expect(row(page, 'big-a.bin')).toBeFocused()
  await page.keyboard.press('b')
  await expect(row(page, 'big-b.bin')).toBeFocused()
})

test('Space ticks, Enter opens, → reaches the row\'s buttons', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'no arrow keys on phones')
  await open(page)
  const notes = row(page, 'notes.txt')
  await notes.focus()

  await page.keyboard.press(' ')
  await expect(notes).toHaveAttribute('aria-selected', 'true')
  await expect(list(page).locator('.fl-selection')).toBeVisible()
  await page.keyboard.press(' ')
  await expect(notes).toHaveAttribute('aria-selected', 'false')

  await page.keyboard.press('ArrowRight')
  await expect(notes.locator('.fl-preview-btn')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(notes.locator('.fl-download')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(notes).toBeFocused()

  // Enter previews; closing the preview comes back to the row.
  await page.keyboard.press('Enter')
  const dialog = page.locator('dialog.fl-preview')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(notes).toBeFocused()
})

test('Ctrl / ⌘ + A ticks everything, from the keyboard only', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'no keyboard on phones')
  await open(page)
  const all = list(page).locator('.fl-head .fl-cell-check input')
  const hint = list(page).locator('.fl-keys')

  // A mouse click keeps the browser's own select-all and shows no key hint.
  await row(page, 'notes.txt').locator('.fl-cell-size').click()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(all).not.toBeChecked()
  await expect(hint).toHaveCount(0)

  await row(page, 'notes.txt').focus()
  await page.keyboard.press('ArrowUp')
  await expect(hint).toBeVisible()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(all).toBeChecked()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(all).not.toBeChecked()

  // Leaving the list hides the hint.
  await list(page).locator('.fl-search input').focus()
  await expect(hint).toHaveCount(0)
})

test('Enter on a “more” row shows the next page', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'no keyboard on phones')
  await open(page)
  await opener(row(page, 'photos')).click()
  const more = list(page).locator('.fl-more')
  await expect(more.locator('.fl-more-count')).toHaveText('还有 435 项')
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(more.locator('.fl-more-count')).toHaveText('还有 420 项')
  await expect(more).toBeFocused()
})

/** White-on-colour contrast of “Download ZIP”, computed in the page. */
async function primaryContrast(page: Page) {
  return list(page).locator('.fl-btn-primary').evaluate((el) => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number)
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const style = getComputedStyle(el)
    const [a, b] = [lum(rgb(style.color)), lum(rgb(style.backgroundColor))].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  })
}

test('“Download ZIP” is readable in light and dark', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    await open(page)
    await check(page, 'notes.txt')
    expect(await primaryContrast(page)).toBeGreaterThanOrEqual(4.5)
  }
  // Switching the theme while the page is open works it out again.
  const before = await list(page).locator('.fl-btn-primary').evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.evaluate(() => document.documentElement.classList.toggle('dark'))
  await expect.poll(() => list(page).locator('.fl-btn-primary').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before)
  expect(await primaryContrast(page)).toBeGreaterThanOrEqual(4.5)
})

test('“Download ZIP” follows themes that switch on <body> or only by the system setting', async ({ page }) => {
  // Keep VitePress itself on light, so only the stand-in theme below changes.
  await page.addInitScript(() => localStorage.setItem('vitepress-theme-appearance', 'light'))
  await page.emulateMedia({ colorScheme: 'light' })
  await open(page)
  await page.addStyleTag({ content: `
    body.fake-dark .fl-root { --vp-button-brand-bg: #8cccd5; }
    @media (prefers-color-scheme: dark) { .fl-root { --vp-button-brand-bg: #3eaf7c; } }
  ` })
  await check(page, 'notes.txt')
  const bg = () => list(page).locator('.fl-btn-primary').evaluate((el) => getComputedStyle(el).backgroundColor)

  // The button takes the new theme colour, darkened just enough, not the one
  // worked out for the old theme.
  const fitted = (hex: string) => {
    const rgb = readableBackground(hex.match(/\w\w/g)!.map((h) => Number.parseInt(h, 16)) as Rgb, [255, 255, 255])!
    return `rgb(${rgb.join(', ')})`
  }
  await page.evaluate(() => document.body.classList.add('fake-dark'))
  await expect.poll(bg).toBe(fitted('8cccd5'))
  expect(await primaryContrast(page)).toBeGreaterThanOrEqual(4.5)

  await page.evaluate(() => document.body.classList.remove('fake-dark'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect.poll(bg).toBe(fitted('3eaf7c'))
  expect(await primaryContrast(page)).toBeGreaterThanOrEqual(4.5)
})

test('narrow lists sort from the sort menu', async ({ page }, info) => {
  await open(page)
  const trigger = list(page).locator('.fl-sort-trigger')
  if (info.project.name !== 'mobile') {
    // Wide lists sort from the column headers; the menu is not shown.
    await expect(trigger).toBeHidden()
    return
  }
  const names = () => list(page).locator('.fl-row:not(.fl-head) .fl-name').allTextContents()
  const before = await names()

  await trigger.tap()
  const menu = list(page).locator('.fl-menu')
  await expect(menu).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const box = (await menu.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  await expectAccessible(page)

  await menu.locator('.fl-menu-order-btn').nth(1).tap()
  await expect(menu).toBeHidden()
  await expect(trigger).toContainText('↓')
  const after = await names()
  expect(after).not.toEqual(before)
  expect([...after].sort()).toEqual([...before].sort())

  // A tap elsewhere on the page closes the menu without sorting.
  await trigger.tap()
  await expect(menu).toBeVisible()
  await page.locator('body').tap({ position: { x: 4, y: 4 } })
  await expect(menu).toBeHidden()
  await expect(trigger).toContainText('↓')
  expect(await names()).toEqual(after)
})
