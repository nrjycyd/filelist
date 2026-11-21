/**
 * Markdown → safe HTML for the preview dialog. Loaded on demand, so pages that
 * never render Markdown do not download markdown-it or DOMPurify.
 *
 * - Raw HTML in the file is allowed, then sanitised (no scripts, handlers, iframes...)
 * - Only absolute http(s) / mailto links stay clickable, opening in a new tab;
 *   relative links (to other files in the share) become plain text
 * - Images with a relative source are replaced by their alt text, because the
 *   share's relative paths do not resolve on the documentation site
 */
interface MarkdownEngine {
  md: { render: (source: string) => string }
  sanitize: (html: string) => string
}

let enginePromise: Promise<MarkdownEngine> | null = null

function loadEngine(): Promise<MarkdownEngine> {
  if (!enginePromise) {
    enginePromise = Promise.all([import('markdown-it'), import('dompurify')])
      .then(([{ default: MarkdownIt }, { default: DOMPurify }]) => {
        // Without a working DOM DOMPurify can pass markup through unchanged: check
        // that it really strips a script and a handler, and never render otherwise.
        const probe = DOMPurify.isSupported ? DOMPurify.sanitize('<img src="x" onerror="1"><script>1</script>') : '<script'
        if (/<script|onerror/i.test(probe)) throw new Error('HTML sanitiser unavailable')
        return {
          md: new MarkdownIt({ html: true, linkify: true }),
          sanitize: (html: string) => DOMPurify.sanitize(html),
        }
      })
      .catch((error) => {
        enginePromise = null
        throw error
      })
  }
  return enginePromise
}

export async function renderMarkdown(source: string, imageLabel: (alt: string) => string): Promise<string> {
  const { md, sanitize } = await loadEngine()
  const html = md.render(source)
  const template = document.createElement('template')
  template.innerHTML = sanitize(html)
  const fragment = template.content

  for (const link of fragment.querySelectorAll('a')) {
    const href = link.getAttribute('href') ?? ''
    if (/^(?:https?:|mailto:)/i.test(href)) {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    } else {
      link.replaceWith(...link.childNodes)
    }
  }
  for (const image of fragment.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? ''
    if (/^(?:https?:|data:image\/)/i.test(src)) continue
    const placeholder = document.createElement('span')
    placeholder.className = 'fl-md-image'
    placeholder.textContent = imageLabel(image.getAttribute('alt') || src.split('/').pop() || '')
    image.replaceWith(placeholder)
  }

  return template.innerHTML
}
