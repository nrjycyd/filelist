import fs from 'node:fs'

// The browser bundle injects `import "../style.css"` as a banner. It also
// ends up in the generated declaration file, which makes consumers' TypeScript
// look for a CSS module type. Remove it from the .d.ts only.
const file = 'dist/client/browser/index.d.ts'

if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf-8').replace(/^import\s+"\.\.\/style\.css";\r?\n/, '')
  fs.writeFileSync(file, content)
}
