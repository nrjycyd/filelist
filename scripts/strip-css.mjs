import fs from 'node:fs'

// The source stylesheet explains itself in comments; sites download the copy
// in dist, which keeps the rules and drops the comments and blank lines.
const file = 'dist/client/style.css'

if (fs.existsSync(file)) {
  const css = fs.readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trimStart()
  fs.writeFileSync(file, css)
}
