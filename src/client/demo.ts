import type { OLItem, OpenListApi } from './api'
import { ApiError } from './api'
import { isSample, SAMPLE_FOLDER, SAMPLE_NAMES, sampleSize, sampleUrl } from './demoSamples'
import { isWithin } from './utils'

/** Built-in sample data, used when no `base` is given. */
const TREE: Record<string, OLItem[]> = {
  '/': [
    { name: 'assignments', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'exams', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'materials', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'notes', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: 'slides', size: 0, is_dir: true, modified: '2026-09-01T08:00:00+08:00' },
    { name: '加密示例（密码 1234）', size: 0, is_dir: true, modified: '2026-10-20T18:00:00+08:00' },
    { name: '示例文件', size: 0, is_dir: true, modified: '2026-11-11T09:00:00+08:00' },
    { name: '照片（260 张）', size: 0, is_dir: true, modified: '2026-10-01T12:00:00+08:00' },
  ],
  [SAMPLE_FOLDER]: SAMPLE_NAMES.map((name) => ({
    name,
    size: sampleSize(name),
    is_dir: false,
    modified: '2026-11-11T09:00:00+08:00',
  })),
  // A long folder for the “show more” rows.
  '/照片（260 张）': Array.from({ length: 260 }, (_, index) => ({
    name: `IMG_${String(index + 1).padStart(4, '0')}.jpg`,
    size: 2_000_000 + ((index * 7919) % 1_500_000),
    is_dir: false,
    modified: '2026-10-01T12:00:00+08:00',
  })),
  '/assignments': [
    { name: '线代作业参考答案', size: 0, is_dir: true, modified: '2026-10-12T21:30:00+08:00' },
    { name: '作业提交说明.pdf', size: 186_432, is_dir: false, modified: '2026-09-03T10:15:00+08:00' },
  ],
  '/assignments/线代作业参考答案': [
    { name: '第1次作业参考答案.doc', size: 412_672, is_dir: false, modified: '2026-09-15T22:41:00+08:00' },
    { name: '第2次作业参考答案.pdf', size: 1_048_576, is_dir: false, modified: '2026-09-22T22:03:00+08:00' },
    { name: '第3次作业参考答案.pdf', size: 986_112, is_dir: false, modified: '2026-09-29T21:57:00+08:00' },
    { name: '第4次作业参考答案.pdf', size: 1_572_864, is_dir: false, modified: '2026-10-13T22:10:00+08:00' },
  ],
  '/exams': [
    { name: '2023 期末试题和答案.pdf', size: 2_345_678, is_dir: false, modified: '2025-01-18T09:20:00+08:00' },
    { name: '2024 期中试题.pdf', size: 1_234_567, is_dir: false, modified: '2025-11-02T14:08:00+08:00' },
    { name: '代数与几何-多年合集-试题和答案.pdf', size: 18_874_368, is_dir: false, modified: '2025-01-18T09:25:00+08:00' },
  ],
  '/materials': [
    { name: '线性代数及其应用（Lay 第5版）.pdf', size: 48_231_424, is_dir: false, modified: '2024-07-29T16:44:00+08:00' },
    { name: 'Introduction to Linear Algebra（Strang）.pdf', size: 36_700_160, is_dir: false, modified: '2024-07-29T16:50:00+08:00' },
    { name: '疑难解答与习题指导.zip', size: 9_437_184, is_dir: false, modified: '2024-08-05T11:12:00+08:00' },
  ],
  '/notes': [
    { name: '线性代数笔记（106页）.pdf', size: 12_582_912, is_dir: false, modified: '2025-06-30T20:31:00+08:00' },
    { name: '期末复习提纲.docx', size: 245_760, is_dir: false, modified: '2026-01-05T19:02:00+08:00' },
  ],
  '/加密示例（密码 1234）': [
    { name: '期末答案（教师版）.pdf', size: 2_621_440, is_dir: false, modified: '2026-10-20T18:00:00+08:00' },
    { name: '成绩登记表.xlsx', size: 48_128, is_dir: false, modified: '2026-10-21T09:12:00+08:00' },
  ],
  '/slides': [
    { name: '第一章 行列式.pptx', size: 3_145_728, is_dir: false, modified: '2026-09-08T13:26:00+08:00' },
    { name: '第二章 矩阵.pptx', size: 4_194_304, is_dir: false, modified: '2026-09-15T13:30:00+08:00' },
  ],
}

/** Demo-only folder passwords, so the demo can show the password flow. */
const PASSWORDS: Record<string, string> = { '/加密示例（密码 1234）': '1234' }

function guard(path: string, password: string) {
  const lock = Object.entries(PASSWORDS).find(([folder]) => isWithin(path, folder))
  if (lock && lock[1] !== password) throw new ApiError('password is incorrect or you have no permission', 403)
}

function parentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/')) || '/'
}

/** Demo OpenList: same API, no network; only the sample files have a URL. */
export function createDemoApi(delay = 220): OpenListApi {
  return {
    async list(path, password) {
      await new Promise((resolve) => setTimeout(resolve, delay))
      guard(path, password)
      return TREE[path] ?? []
    },
    async get(path, password) {
      guard(path, password)
      const name = path.split('/').filter(Boolean).pop() ?? ''
      const item = (TREE[parentOf(path)] ?? []).find((entry) => entry.name === name)
      if (!item) throw new ApiError('object not found', 404)
      return item
    },
    settings: async () => ({ title: '', iframePreviews: '' }),
    fileUrl: async (file) => sampleUrl(file.path),
    directUrl: () => '',
    // A blob: link with a file name downloads in place.
    isAttachmentUrl: (url) => url.startsWith('blob:'),
    clearCache: () => {},
  }
}

/** Whether a demo file can really be previewed, downloaded and zipped. */
export const isDemoFile = isSample
