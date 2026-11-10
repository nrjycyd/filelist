/** Stroke icons on a 24×24 grid, drawn by `Icon.vue`. */
export const ICONS = {
  lock: { stroke: 2.2, paths: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3'] },
  key: { stroke: 2, paths: ['M4 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'm11 12 9-9', 'm17 6 3 3'] },
  close: { stroke: 2.2, paths: ['M6 6l12 12', 'M18 6 6 18'] },
  download: { stroke: 2.2, paths: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'] },
  eye: { stroke: 2, paths: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0'] },
  refresh: { stroke: 2, paths: ['M21 12a9 9 0 1 1-3-6.7', 'M21 4v5h-5'] },
  search: { stroke: 2, paths: ['M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'm20 20-3.5-3.5'] },
  next: { stroke: 2.2, paths: ['m9 6 6 6-6 6'] },
  previous: { stroke: 2.2, paths: ['m15 6-6 6 6 6'] },
  zoomIn: { stroke: 2, paths: ['M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'm20 20-3.5-3.5', 'M11 8v6M8 11h6'] },
  zoomOut: { stroke: 2, paths: ['M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'm20 20-3.5-3.5', 'M8 11h6'] },
} as const

export type IconName = keyof typeof ICONS
