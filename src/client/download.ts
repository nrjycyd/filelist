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

/**
 * Fetch files (three at a time) and pack them into one ZIP. `zipPath` is the
 * entry path; clashing names get ` (2)`, ` (3)`... `onProgress` goes 0–90 while
 * fetching; packing is the rest.
 */
export async function zipFiles<T extends { name: string; zipPath: string[] }>(
  files: T[],
  urlOf: (file: T) => Promise<string>,
  onProgress: (percent: number) => void,
): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  const queue = [...files]
  let done = 0
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const response = await fetch(await urlOf(file))
      if (!response.ok) throw new Error(`${file.name}：HTTP ${response.status}`)
      entries[uniqueEntryName(zipEntryName(file.zipPath), used)] = new Uint8Array(await response.arrayBuffer())
      done += 1
      onProgress(Math.round((done / files.length) * 90))
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker))
  const { zip } = await import('fflate')
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, (error, output) => (error ? reject(error) : resolve(output)))
  })
  onProgress(100)
  return new Blob([data as unknown as BlobPart], { type: 'application/zip' })
}
