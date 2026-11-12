// VuePress compatibility check: packs both packages, installs them into a
// fresh VuePress 2 site for each theme (default, plume, hope), builds it and
// drives it in Chromium: render, theme colours in light and dark, Markdown
// preview, ZIP, no page errors.
//
//   pnpm test:compat:vuepress                      # all three themes
//   COMPAT_THEMES=plume pnpm test:compat:vuepress
//   COMPAT_VUEPRESS=2.0.0-rc.31 pnpm test:compat:vuepress   # pin VuePress
//   COMPAT_THEME_VERSIONS=plume=1.0.0-rc.216,hope=2.0.0-rc.110   # pin themes
//   COMPAT_SKIP_BUILD=1 ...                        # use the existing dist/
//
// Without COMPAT_VUEPRESS each site gets the VuePress version its theme asks
// for (themes pin an exact release candidate). Needs network access for npm
// and a Playwright Chromium.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const pkgDir = resolve(import.meta.dirname, '..')
const root = resolve(pkgDir, '../..')
const work = mkdtempSync(join(tmpdir(), 'filelist-vuepress-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const THEMES = {
  default: {
    pkg: '@vuepress/theme-default@next',
    extra: ['sass-embedded'],
    code: `import { defaultTheme } from '@vuepress/theme-default'`,
    theme: `defaultTheme()`,
    // The theme's own colour for links and buttons.
    brand: '--vp-c-accent',
  },
  plume: {
    pkg: 'vuepress-theme-plume',
    // plume's components use imported types in defineProps, which Vue's
    // compiler resolves with TypeScript, so a plume site needs it installed.
    // TypeScript 7 (the native compiler) has no `ts.sys` for Vue to use yet.
    extra: ['typescript@^5'],
    code: `import { plumeTheme } from 'vuepress-theme-plume'`,
    theme: `plumeTheme({})`,
    brand: '--vp-c-brand-1',
  },
  hope: {
    pkg: 'vuepress-theme-hope',
    extra: ['sass-embedded'],
    code: `import { hopeTheme } from 'vuepress-theme-hope'`,
    theme: `hopeTheme({})`,
    brand: '--vp-c-accent',
  },
}
// Exact theme versions (the canary passes what it looked up).
for (const pin of (process.env.COMPAT_THEME_VERSIONS || '').split(',').filter(Boolean)) {
  const [theme, version] = pin.split('=').map(s => s.trim())
  if (THEMES[theme])
    THEMES[theme].pkg = `${THEMES[theme].pkg.replace(/(.)@.*$/, '$1')}@${version}`
}
const themes = (process.env.COMPAT_THEMES || Object.keys(THEMES).join(',')).split(',').map(t => t.trim()).filter(Boolean)

function run(cmd, args, cwd, quiet = false) {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', quiet ? 'pipe' : 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  })
}

function write(file, text) {
  mkdirSync(resolve(file, '..'), { recursive: true })
  writeFileSync(file, text)
}

function check(ok, message) {
  if (!ok)
    throw new Error(message)
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' }

/** VuePress has no preview command: serve the built site. */
function serve(dir, port) {
  const server = createServer((req, res) => {
    let file = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (existsSync(file) && statSync(file).isDirectory())
      file = join(file, 'index.html')
    if (!existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise(r => server.listen(port, () => r({ url: `http://localhost:${port}/`, stop: () => server.close() })))
}

async function smoke(browser, url, theme) {
  for (const colorScheme of ['light', 'dark']) {
    const page = await browser.newPage({ acceptDownloads: true, colorScheme })
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    await page.addInitScript(() => delete window.showSaveFilePicker)
    await page.goto(`${url}demo/`)
    const list = page.locator('.fl-root').first()
    const row = name => list.locator('.fl-row').filter({ has: page.locator('.fl-name', { hasText: new RegExp(`^${name}$`) }) })
    await row('示例文件').waitFor()

    // Colours come from the theme: its brand colour, light text on dark.
    const colours = await page.evaluate((brandVar) => {
      const el = document.querySelector('.fl-root')
      const css = getComputedStyle(el)
      const luminance = (rgb) => {
        const [r, g, b] = rgb.match(/[\d.]+/g).map(Number)
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      }
      return {
        brand: css.getPropertyValue('--fl-c-brand-1').trim(),
        themeBrand: getComputedStyle(document.documentElement).getPropertyValue(brandVar).trim(),
        text: luminance(css.color),
        dark: document.documentElement.matches('.dark, [data-theme="dark"]'),
      }
    }, THEMES[theme].brand)
    check(colours.themeBrand && colours.brand === colours.themeBrand, `${colorScheme}: brand ${colours.brand} is not the theme's ${colours.themeBrand}`)
    check(colours.dark === (colorScheme === 'dark'), `${colorScheme}: the theme did not switch to ${colorScheme}`)
    check(colorScheme === 'dark' ? colours.text > 0.6 : colours.text < 0.4, `${colorScheme}: text luminance ${colours.text.toFixed(2)}`)

    if (colorScheme === 'light') {
      await row('示例文件').locator('.fl-arrow').first().click()
      await row('使用说明.md').waitFor()
      await row('使用说明.md').locator('.fl-preview-btn').click()
      const dialog = page.locator('dialog.fl-preview')
      await dialog.locator('.fl-preview-view-btn', { hasText: '渲染' }).click()
      await dialog.locator('.fl-md h1').waitFor()
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
    check(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    await page.close()
  }
}

console.log(`Packing both packages (${work})`)
if (!process.env.COMPAT_SKIP_BUILD)
  run(pnpm, ['run', 'build'], root)
run(npm, ['pack', '--silent', '--pack-destination', work], root)
// pnpm pack turns `workspace:*` into the released version.
run(pnpm, ['pack', '--pack-destination', work], pkgDir, true)
const tarballs = readdirSync(work).filter(f => f.endsWith('.tgz')).map(f => join(work, f))
check(tarballs.length === 2, `expected two tarballs, got ${tarballs.length}`)

const browser = await chromium.launch()
let port = 4710
let failed = 0
try {
  for (const theme of themes) {
    const t = THEMES[theme]
    check(t, `unknown theme ${theme}`)
    const site = join(work, `vuepress-${theme}`)
    console.log(`\n▶ VuePress · ${theme}`)
    try {
      const vuepress = process.env.COMPAT_VUEPRESS
        || run(npm, ['view', t.pkg, 'peerDependencies.vuepress'], work, true).trim()
      write(join(site, 'package.json'), JSON.stringify({ name: 'compat-site', private: true, type: 'module' }, null, 2))
      write(join(site, 'docs/.vuepress/config.ts'), [
        `import { viteBundler } from '@vuepress/bundler-vite'`,
        `import { defineUserConfig } from 'vuepress'`,
        t.code,
        `import { fileListPlugin } from 'vuepress-plugin-filelist'`,
        ``,
        `export default defineUserConfig({`,
        `  lang: 'zh-CN',`,
        `  title: 'compat',`,
        `  bundler: viteBundler(),`,
        `  theme: ${t.theme},`,
        `  plugins: [fileListPlugin()],`,
        `})`,
        ``,
      ].join('\n'))
      write(join(site, 'docs/README.md'), '# compat\n')
      write(join(site, 'docs/demo.md'), '---\ntitle: Demo\npermalink: /demo/\n---\n\n<FileList title="Demo" />\n')
      run(npm, ['install', '--no-audit', '--no-fund', '--loglevel=error', `vuepress@${vuepress}`, `@vuepress/bundler-vite@${vuepress}`, t.pkg, ...t.extra, 'vue@^3.5.0', ...tarballs], site)
      const installed = name => JSON.parse(readFileSync(join(site, 'node_modules', name, 'package.json'), 'utf8')).version
      const themeName = t.pkg.replace(/(.)@.*$/, '$1')
      console.log(`  vuepress ${installed('vuepress')} · ${themeName} ${installed(themeName)}`)
      check(!existsSync(join(site, 'node_modules/vitepress')), 'VitePress was installed into a VuePress site')
      run(npx, ['vuepress', 'build', 'docs'], site)

      const server = await serve(join(site, 'docs/.vuepress/dist'), port++)
      try {
        await smoke(browser, server.url, theme)
      }
      finally {
        server.stop()
      }
      console.log(`✔ VuePress · ${theme}`)
    }
    catch (error) {
      failed++
      console.error(`✘ VuePress · ${theme}: ${error.message}`)
    }
  }
}
finally {
  await browser.close()
  if (!failed)
    rmSync(work, { recursive: true, force: true })
}

if (failed) {
  console.error(`\n${failed} of ${themes.length} themes failed; sites kept in ${work}`)
  process.exit(1)
}
console.log(`\nAll ${themes.length} themes passed.`)
