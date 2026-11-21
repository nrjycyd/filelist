import fs from 'node:fs'
import path from 'node:path'

// The source stylesheet is split into partials under `src/client/styles/` and
// explains itself in comments; sites download one `dist/client/style.css`
// with partials inlined and comments / blank lines stripped.
const entry = 'src/client/style.css'
const out = 'dist/client/style.css'

if (fs.existsSync(entry)) {
  const dir = path.dirname(entry)
  const raw = fs.readFileSync(entry, 'utf-8').replace(
    /^@import\s+['"]([^'"]+)['"]\s*;\r?\n?/gm,
    (_, rel) => `${fs.readFileSync(path.join(dir, rel), 'utf-8')}\n`,
  )
  const css = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trimStart()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, css)
}
