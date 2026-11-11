// Compatibility check: installs the packed plugin into a fresh VitePress site
// for each supported VitePress line, registered the plain way (no
// vitepress-tuck), and drives it in Chromium.
//
//   pnpm test:compat                      # 1.6.4 and 2.0.0-alpha.21
//   COMPAT_VITEPRESS=1.6.4 pnpm test:compat
//   COMPAT_VITEPRESS=latest,next pnpm test:compat   # npm dist-tags work too
//
// Each site is built and previewed (render, expand, preview, ZIP, no console
// warning), then started with `vitepress dev` (the public-token warning shows).
// Needs network access for npm and a Playwright Chromium.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const versions = (process.env.COMPAT_VITEPRESS || '1.6.4,2.0.0-alpha.21').split(',').map(v => v.trim()).filter(Boolean)
const work = mkdtempSync(join(tmpdir(), 'filelist-compat-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], shell: process.platform === 'win32' })
}

function write(file, text) {
  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

async function serve(cwd, args, port) {
  const child = spawn(npx, ['vitepress', ...args, 'docs', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'ignore',
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
  })
  const url = `http://localhost:${port}/`
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok)
        return { url, stop: () => stopServer(child) }
    }
    catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  stopServer(child)
  throw new Error(`vitepress ${args[0]} did not start on ${url}`)
}

function stopServer(child) {
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else
      process.kill(-child.pid)
  }
  catch {}
}

function check(ok, message) {
  if (!ok)
    throw new Error(message)
}

/** Messages the plugin logged on a page. */
function pluginWarnings(page) {
  const seen = []
  page.on('console', (msg) => {
    if (msg.text().includes('[vitepress-plugin-filelist]'))
      seen.push(msg.text())
  })
  return seen
}

async function smoke(browser, url) {
  const page = await browser.newPage({ acceptDownloads: true })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  const warnings = pluginWarnings(page)
  // In-memory ZIP path, the same in every browser.
  await page.addInitScript(() => delete window.showSaveFilePicker)
  await page.goto(url)
  const list = page.locator('.fl-root').first()
  const row = name => list.locator('.fl-row').filter({ has: page.locator('.fl-name', { hasText: new RegExp(`^${name}$`) }) })

  await row('示例文件').locator('.fl-arrow').first().click()
  await row('使用说明.md').waitFor()

  await row('使用说明.md').locator('.fl-preview-btn').click()
  const dialog = page.locator('dialog.fl-preview')
  await dialog.locator('.fl-preview-view-btn', { hasText: '渲染' }).click()
  await dialog.locator('.fl-md.vp-doc h1').waitFor()
  await page.keyboard.press('Escape')

  await row('示例文件').locator('.fl-cell-check input').check()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    list.locator('.fl-bar .fl-btn-primary').click(),
  ])
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  check(Buffer.concat(chunks).subarray(0, 2).toString() === 'PK', 'the ZIP is not a ZIP file')

  // The production build stays silent, even on a page that sets a token.
  await page.goto(`${url}secret`)
  await list.locator('.fl-row').first().waitFor()
  await page.waitForTimeout(500)
  check(warnings.length === 0, `production build logged: ${warnings.join(' | ')}`)
  check(errors.length === 0, `page errors: ${errors.join(' | ')}`)
  await page.close()
}

async function devWarning(browser, url) {
  const page = await browser.newPage()
  const warnings = pluginWarnings(page)
  await page.goto(`${url}secret`)
  await page.locator('.fl-root .fl-row').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1000)
  check(warnings.length === 1 && warnings[0].includes('token'), `dev server: expected one token warning, got ${warnings.length}`)
  await page.close()
}

console.log(`Packing the plugin (${work})`)
run('pnpm', ['run', 'build'], root)
run(npm, ['pack', '--silent', '--pack-destination', work], root)
const tarball = join(work, readdirSync(work).find(f => f.endsWith('.tgz')))

const browser = await chromium.launch()
let port = 4610
let failed = 0
try {
  for (const version of versions) {
    const site = join(work, `vitepress-${version}`)
    console.log(`\n▶ VitePress ${version}`)
    write(join(site, 'package.json'), JSON.stringify({ name: 'compat-site', private: true, type: 'module' }, null, 2))
    write(join(site, 'docs/.vitepress/config.mts'), `import { defineConfig } from 'vitepress'\nexport default defineConfig({ title: 'compat' })\n`)
    write(join(site, 'docs/.vitepress/theme/index.ts'), [
      `import DefaultTheme from 'vitepress/theme'`,
      `import { enhanceAppWithFileList } from 'vitepress-plugin-filelist/client'`,
      `import 'vitepress-plugin-filelist/style.css'`,
      ``,
      `export default { extends: DefaultTheme, enhanceApp(ctx) { enhanceAppWithFileList(ctx) } }`,
      ``,
    ].join('\n'))
    write(join(site, 'docs/index.md'), '# Demo\n\n<FileList title="Demo" />\n')
    write(join(site, 'docs/secret.md'), '# Token\n\n<FileList token="not-a-real-token" />\n')
    try {
      run(npm, ['install', '--no-audit', '--no-fund', '--loglevel=error', `vitepress@${version}`, 'vue@^3.5.0', tarball], site)
      const installed = JSON.parse(readFileSync(join(site, 'node_modules/vitepress/package.json'), 'utf8')).version
      if (installed !== version)
        console.log(`  vitepress@${version} → ${installed}`)
      run(npx, ['vitepress', 'build', 'docs'], site)

      const preview = await serve(site, ['preview'], port++)
      try {
        await smoke(browser, preview.url)
      }
      finally {
        preview.stop()
      }
      const dev = await serve(site, ['dev'], port++)
      try {
        await devWarning(browser, dev.url)
      }
      finally {
        dev.stop()
      }
      console.log(`✔ VitePress ${version}`)
    }
    catch (error) {
      failed++
      console.error(`✘ VitePress ${version}: ${error.message}`)
    }
  }
}
finally {
  await browser.close()
  if (!failed)
    rmSync(work, { recursive: true, force: true })
}

if (failed) {
  console.error(`\n${failed} of ${versions.length} VitePress versions failed; sites kept in ${work}`)
  process.exit(1)
}
console.log(`\nAll ${versions.length} VitePress versions passed.`)
