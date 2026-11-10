import { uniqueEntryName, zipEntryName } from './utils'

/** Open a file URL; OpenList serves `/p/` and `/d/` as attachments, so this downloads. */
export function openUrl(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener'
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

export interface ZipFile {
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

export interface ZipOptions<T extends ZipFile> {
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
 * The ZIP as a stream: files are fetched one after another and passed through
 * as they arrive, stored without compression (most shared files are already
 * compressed). Clashing entry names get ` (2)`, ` (3)`...
 */
async function zipStream<T extends ZipFile>(files: T[], options: ZipOptions<T>): Promise<ReadableStream<Uint8Array>> {
  const { makeZip } = await import('client-zip')
  const progress: ZipProgress = {
    bytes: 0,
    totalBytes: files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0),
    files: 0,
    totalFiles: files.length,
  }
  const report = () => options.onProgress({ ...progress })
  report()

  async function* entries() {
    const used = new Set<string>()
    for (const file of files) {
      const response = await fetch(await options.urlOf(file), { signal: options.signal })
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
            report()
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
