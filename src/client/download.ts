import { uniqueEntryName, zipEntryName } from './utils'

/**
 * Hand a file URL to the browser's own download manager.
 *
 * `sameTab` is for links known to answer as attachments (OpenList `/p/`, `/d/`):
 * the browser downloads and the page stays put, with no tab flashing open.
 * Other links (a storage provider's direct URL may display inline) open in a
 * new tab so the document page is never replaced. `download` also keeps a
 * same-origin link out of the VitePress router and names the file.
 */
export function openUrl(url: string, options: { sameTab: boolean; name: string }): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = options.name
  anchor.rel = 'noopener'
  if (!options.sameTab) anchor.target = '_blank'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function saveBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(href), 30_000)
}

/** File-system-safe ZIP name from a title. */
export function zipFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, '_')}.zip`
}

interface ZipFile {
  name: string
  /** Entry path segments inside the ZIP. */
  zipPath: string[]
  size: number
  modified: string
}

export interface ZipProgress {
  bytes: number
  totalBytes: number
  files: number
  totalFiles: number
}

interface ZipOptions<T extends ZipFile> {
  urlOf: (file: T) => Promise<string>
  signal: AbortSignal
  onProgress: (progress: ZipProgress) => void
}

interface SaveFilePickerWindow {
  showSaveFilePicker: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
}

/** Whether the browser can write a ZIP straight into a file the user picks (Chromium). */
export function canStreamToDisk(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && 'showSaveFilePicker' in window
}

/**
 * Ask where to save the ZIP. Call it straight from the click, before any other
 * `await`, or the browser refuses. Resolves `null` when the user cancels.
 */
export async function pickZipFile(name: string): Promise<FileSystemFileHandle | null> {
  try {
    return await (window as unknown as SaveFilePickerWindow).showSaveFilePicker({
      suggestedName: name,
      types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }],
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null
    throw error
  }
}

/**
 * The ZIP as a stream: files are fetched a few at a time and passed through
 * as they arrive, stored without compression (most shared files are already
 * compressed). Clashing entry names get ` (2)`, ` (3)`...
 */
/** Files fetched at once: hides per-file latency, stays under the browser's 6 per host. */
const CONCURRENCY = 4
/** Progress updates at most this often (ms), so the bar does not re-render per chunk. */
const PROGRESS_INTERVAL = 100

async function zipStream<T extends ZipFile>(files: T[], options: ZipOptions<T>): Promise<ReadableStream<Uint8Array>> {
  const { makeZip } = await import('client-zip')
  const progress: ZipProgress = {
    bytes: 0,
    totalBytes: files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0),
    files: 0,
    totalFiles: files.length,
  }
  let reportedAt = 0
  const report = (force = false) => {
    const now = Date.now()
    if (!force && now - reportedAt < PROGRESS_INTERVAL) return
    reportedAt = now
    options.onProgress({ ...progress })
  }
  report(true)

  async function* entries() {
    const used = new Set<string>()
    // Up to CONCURRENCY requests run ahead; entries still go into the ZIP in order.
    const ahead: Array<Promise<Response>> = []
    let started = 0
    const startNext = () => {
      const file = files[started++]
      const response = options.urlOf(file).then((url) => fetch(url, { signal: options.signal }))
      response.catch(() => {}) // surfaced when its turn comes
      ahead.push(response)
    }
    while (started < files.length && ahead.length < CONCURRENCY) startNext()

    for (const file of files) {
      const response = await ahead.shift()!
      if (started < files.length) startNext()
      if (!response.ok || !response.body) throw new Error(`${file.name}：HTTP ${response.status}`)
      const counted = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            progress.bytes += chunk.byteLength
            report()
            controller.enqueue(chunk)
          },
          flush() {
            progress.files += 1
            report(progress.files === progress.totalFiles)
          },
        }),
      )
      const modified = new Date(file.modified)
      yield {
        name: uniqueEntryName(zipEntryName(file.zipPath), used),
        lastModified: Number.isNaN(modified.getTime()) ? undefined : modified,
        input: counted,
      }
    }
  }

  return makeZip(entries())
}

/** Stream the ZIP into a picked file; memory use stays small whatever the size. */
export async function zipToFile<T extends ZipFile>(
  handle: FileSystemFileHandle,
  files: T[],
  options: ZipOptions<T>,
): Promise<void> {
  const stream = await zipStream(files, options)
  const writable = await handle.createWritable()
  // An abort or error discards the partly written file.
  await stream.pipeTo(writable, { signal: options.signal })
}

/** Build the ZIP in memory (browsers without file streaming). */
export async function zipToBlob<T extends ZipFile>(files: T[], options: ZipOptions<T>): Promise<Blob> {
  const reader = (await zipStream(files, options)).getReader()
  const chunks: Uint8Array[] = []
  const abort = () => void reader.cancel(options.signal.reason).catch(() => {})
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) abort()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    options.signal.removeEventListener('abort', abort)
  }
  options.signal.throwIfAborted()
  return new Blob(chunks as BlobPart[], { type: 'application/zip' })
}
