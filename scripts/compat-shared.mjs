// Shared helpers for the VitePress and VuePress compatibility scripts.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

export const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
export const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
export const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export function run(cmd, args, cwd, quiet = false) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', quiet ? 'pipe' : 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  })
}

export function write(file, text) {
  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

export function check(ok, message) {
  if (!ok)
    throw new Error(message)
}

export function rowOf(page, list, name) {
  return list.locator('.fl-row').filter({ has: page.locator('.fl-name', { hasText: new RegExp(`^${name}$`) }) })
}

/** Verify rendered Markdown preview and in-memory ZIP download on the demo sample folder. */
export async function smokePreviewAndZip(page, list, renderedSelector) {
  const row = name => rowOf(page, list, name)
  if (!(await row('使用说明.md').count()))
    await row('示例文件').locator('.fl-arrow').first().click()
  await row('使用说明.md').waitFor()

  // wide lists show a file's buttons in place of its date while the row is pointed at
  await row('使用说明.md').hover()
  await row('使用说明.md').locator('.fl-preview-btn').click()
  const dialog = page.locator('dialog.fl-preview')
  await dialog.locator('.fl-preview-view-btn', { hasText: '渲染' }).click()
  await dialog.locator(renderedSelector).waitFor()
  await page.keyboard.press('Escape')

  await row('示例文件').locator('.fl-cell-check input').check()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    list.locator('.fl-bar .fl-btn-primary').click(),
  ])
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  check(Buffer.concat(chunks).subarray(0, 2).toString() === 'PK', 'the ZIP is not a ZIP file')
}
