/**
 * Small real files for the demo data, so preview, download and ZIP can be
 * tried without an OpenList server. Served as blob: URLs, made on first use.
 */

interface Sample {
  type: string
  body: string
}

const SAMPLES_ZH: Record<string, Sample> = {
  "使用说明.md": {
    type: "text/markdown",
    body: "# 使用说明\n\n这是 **vitepress-plugin-filelist** 演示数据自带的 Markdown 文件。\n\n## 试一试\n\n- 点右上角“渲染”，按 VitePress 正文样式显示\n- 用 ← / → 切换到同一目录里的其它文件\n- 勾选“示例文件”文件夹，点“下载 ZIP”打包\n\n| 文件 | 类型 |\n| --- | --- |\n| 讲义.pdf | PDF |\n| 课程海报.svg | 图片 |\n| 网页示例.html | 网页 |\n\n> 接入 OpenList 后，这里显示的就是网盘里的真实文件。\n\n更多说明见 [文档站](https://nrjycyd.github.io/vitepress-plugin-filelist/)。\n",
  },
  "网页示例.html": {
    type: "text/html",
    body: "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n<title>网页示例</title>\n<style>\n  body { font-family: system-ui, sans-serif; margin: 24px; line-height: 1.6; color: #1f2937; }\n  h1 { color: #3451b2; }\n  .card { padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 8px; }\n</style>\n</head>\n<body>\n<h1>网页示例</h1>\n<p>切换到“渲染”后，这个网页在沙盒中显示：带样式，但脚本不会运行。</p>\n<div class=\"card\">下面的按钮由脚本控制，在沙盒里点了没有反应。</div>\n<p><button onclick=\"alert('脚本运行了')\">点我</button></p>\n<script>document.body.dataset.ran = 'yes'</script>\n</body>\n</html>\n",
  },
  "课程海报.svg": {
    type: "image/svg+xml",
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"450\" viewBox=\"0 0 800 450\">\n<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3451b2\"/><stop offset=\"1\" stop-color=\"#5672cd\"/></linearGradient></defs>\n<rect width=\"800\" height=\"450\" fill=\"url(#g)\"/>\n<circle cx=\"660\" cy=\"90\" r=\"120\" fill=\"#ffffff\" opacity=\"0.08\"/>\n<circle cx=\"120\" cy=\"420\" r=\"160\" fill=\"#ffffff\" opacity=\"0.06\"/>\n<text x=\"64\" y=\"190\" font-family=\"system-ui, sans-serif\" font-size=\"56\" font-weight=\"700\" fill=\"#ffffff\">课程海报</text>\n<text x=\"64\" y=\"250\" font-family=\"system-ui, sans-serif\" font-size=\"26\" fill=\"#dfe5ff\">线性代数 · 2026 秋季学期</text>\n<text x=\"64\" y=\"380\" font-family=\"system-ui, sans-serif\" font-size=\"18\" fill=\"#dfe5ff\">vitepress-plugin-filelist 演示图片</text>\n</svg>\n",
  },
  "讲义.pdf": {
    type: "application/pdf",
    body: "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 257 >>\nstream\nBT\n/F1 20 Tf\n72 760 Td\n(FileList sample PDF) Tj\n/F1 12 Tf\n0 -22 Td\n() Tj\n0 -22 Td\n(This small PDF ships with the demo data of) Tj\n0 -22 Td\n(vitepress-plugin-filelist, so preview, download) Tj\n0 -22 Td\n(and ZIP can be tried without an OpenList server.) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000241 00000 n \n0000000311 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n619\n%%EOF\n",
  },
  "课程表.txt": {
    type: "text/plain",
    body: "课程表（演示文本）\n\n周一  08:00  线性代数        教 301\n周三  10:00  线性代数习题课  教 205\n周五  14:00  答疑            图书馆 2 楼\n\n纯文本文件只读取前 1 MB，按原样显示。\n",
  },
}

const SAMPLES_EN: Record<string, Sample> = {
  "Read me.md": {
    type: "text/markdown",
    body: "# Read me\n\nThis Markdown file ships with the demo data of **vitepress-plugin-filelist**.\n\n## Try it\n\n- Click “Rendered” at the top right to show it in VitePress' page style\n- Use ← / → to move to the other files in this folder\n- Tick the “Sample files” folder and click “Download ZIP”\n\n| File | Type |\n| --- | --- |\n| Lecture notes.pdf | PDF |\n| Course poster.svg | Image |\n| Web page.html | Web page |\n\n> With OpenList connected, this list shows the real files on your drive.\n\nMore in the [docs](https://nrjycyd.github.io/vitepress-plugin-filelist/en/).\n",
  },
  "Web page.html": {
    type: "text/html",
    body: "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>Web page</title>\n<style>\n  body { font-family: system-ui, sans-serif; margin: 24px; line-height: 1.6; color: #1f2937; }\n  h1 { color: #3451b2; }\n  .card { padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 8px; }\n</style>\n</head>\n<body>\n<h1>Web page</h1>\n<p>Switched to “Rendered”, this page shows in a sandbox: styles apply, scripts do not run.</p>\n<div class=\"card\">The button below is driven by a script, so clicking it in the sandbox does nothing.</div>\n<p><button onclick=\"alert('The script ran')\">Click me</button></p>\n<script>document.body.dataset.ran = 'yes'</script>\n</body>\n</html>\n",
  },
  "Course poster.svg": {
    type: "image/svg+xml",
    body: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"450\" viewBox=\"0 0 800 450\">\n<defs><linearGradient id=\"g\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#3451b2\"/><stop offset=\"1\" stop-color=\"#5672cd\"/></linearGradient></defs>\n<rect width=\"800\" height=\"450\" fill=\"url(#g)\"/>\n<circle cx=\"660\" cy=\"90\" r=\"120\" fill=\"#ffffff\" opacity=\"0.08\"/>\n<circle cx=\"120\" cy=\"420\" r=\"160\" fill=\"#ffffff\" opacity=\"0.06\"/>\n<text x=\"64\" y=\"190\" font-family=\"system-ui, sans-serif\" font-size=\"56\" font-weight=\"700\" fill=\"#ffffff\">Course poster</text>\n<text x=\"64\" y=\"250\" font-family=\"system-ui, sans-serif\" font-size=\"26\" fill=\"#dfe5ff\">Linear Algebra · Fall 2026</text>\n<text x=\"64\" y=\"380\" font-family=\"system-ui, sans-serif\" font-size=\"18\" fill=\"#dfe5ff\">vitepress-plugin-filelist demo image</text>\n</svg>\n",
  },
  "Lecture notes.pdf": {
    type: "application/pdf",
    body: "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n5 0 obj\n<< /Length 257 >>\nstream\nBT\n/F1 20 Tf\n72 760 Td\n(FileList sample PDF) Tj\n/F1 12 Tf\n0 -22 Td\n() Tj\n0 -22 Td\n(This small PDF ships with the demo data of) Tj\n0 -22 Td\n(vitepress-plugin-filelist, so preview, download) Tj\n0 -22 Td\n(and ZIP can be tried without an OpenList server.) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000241 00000 n \n0000000311 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n619\n%%EOF\n",
  },
  "Timetable.txt": {
    type: "text/plain",
    body: "Timetable (demo text)\n\nMon  08:00  Linear algebra            Room 301\nWed  10:00  Linear algebra exercises  Room 205\nFri  14:00  Office hours              Library, 2nd floor\n\nPlain text files are read up to the first 1 MB and shown as is.\n",
  },
}

/** The sample folder and its files, per demo language. */
const SETS: Array<{ folder: string; samples: Record<string, Sample> }> = [
  { folder: '/示例文件', samples: SAMPLES_ZH },
  { folder: '/Sample files', samples: SAMPLES_EN },
]

/** The sample folder of the Chinese / English demo data. */
export const SAMPLE_FOLDER = { 'zh-CN': SETS[0].folder, 'en-US': SETS[1].folder } as const

/** File names in a sample folder. */
export function sampleNames(folder: string): string[] {
  return Object.keys(SETS.find((set) => set.folder === folder)?.samples ?? {})
}

function find(path: string): Sample | undefined {
  for (const { folder, samples } of SETS) {
    const name = path.slice(folder.length + 1)
    if (path.startsWith(`${folder}/`) && name in samples) return samples[name]
  }
}

/** Size in bytes of a sample, as UTF-8. */
export function sampleSize(path: string): number {
  const sample = find(path)
  return sample ? new TextEncoder().encode(sample.body).byteLength : 0
}

/** Whether a demo path is one of the sample files (which have a real URL). */
export function isSample(path: string): boolean {
  return find(path) !== undefined
}

const urls = new Map<string, string>()

/** A blob: URL for a sample file, `''` for any other path or outside a browser. */
export function sampleUrl(path: string): string {
  const sample = find(path)
  if (!sample || typeof URL.createObjectURL !== 'function') return ''
  let url = urls.get(path)
  if (!url) {
    url = URL.createObjectURL(new Blob([sample.body], { type: `${sample.type};charset=utf-8` }))
    urls.set(path, url)
  }
  return url
}
