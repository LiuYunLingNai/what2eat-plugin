import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { downloadDishImage } from './data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]
  ))
}

// 解析图片地址：已是绝对地址（http/https/file/data）原样返回；否则回退到镜像地址
function resolveImg(url, baseDir) {
  const raw = String(url).trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw // 带 scheme（含 file:// data:）直接用
  const rel = raw.replace(/^\.\//, '').replace(/^\//, '')
  const full = (baseDir ? baseDir.replace(/\/+$/, '') + '/' : '') + rel
  const encoded = full.split('/').map(encodeURIComponent).join('/')
  return `https://fastly.jsdelivr.net/gh/Anduin2017/HowToCook@master/${encoded}`
}

/**
 * 预处理 markdown：把图片下载到本地，替换成 file:// 本地地址，
 * 这样 puppeteer 渲染时不依赖远程图床（避免慢/失败/破图）。下载失败的图片直接移除。
 */
async function inlineImages(markdown, sourcePath) {
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g
  const refs = []
  let m
  while ((m = re.exec(markdown))) refs.push({ full: m[0], alt: m[1], url: m[2].trim() })
  if (!refs.length) return markdown

  let out = markdown
  for (const r of refs) {
    let replacement = '' // 下载失败就移除，避免破图
    try {
      const file = await downloadDishImage(r.url, sourcePath)
      if (file) replacement = `![${r.alt}](${pathToFileURL(file).href})`
    } catch {}
    out = out.replace(r.full, replacement)
  }
  return out
}

// 行内：图片 ![alt](url) / **粗体** / `代码`
function inline(text, baseDir) {
  let s = escapeHtml(text)
  // 图片要先于粗体处理（避免 alt 内容被误伤）
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) =>
    `<img alt="${alt}" src="${resolveImg(url, baseDir)}">`)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/`([^`]+?)`/g, '<code>$1</code>')
  return s
}

/**
 * 极简 markdown → HTML（针对 HowToCook 菜谱结构：标题 / 无序列表 / 有序列表 / 图片 / 段落）。
 * @param {string} md
 * @param {string} [baseDir] 菜谱 md 所在目录（用于解析相对图片路径）
 */
function mdToHtml(md, baseDir) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n')
  const out = []
  let listType = null // 'ul' | 'ol'

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      closeList()
      continue
    }

    let m
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      closeList()
      const level = m[1].length
      out.push(`<h${level}>${inline(m[2], baseDir)}</h${level}>`)
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inline(m[1], baseDir)}</li>`)
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inline(m[1], baseDir)}</li>`)
    } else {
      closeList()
      out.push(`<p>${inline(line.trim(), baseDir)}</p>`)
    }
  }
  closeList()
  return out.join('\n')
}

function buildHtml(bodyHtml, meta = {}) {
  const footer = meta.source
    ? `<div class="footer">数据来源：HowToCook · ${escapeHtml(meta.category || '')}</div>`
    : ''
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px;
    width: 720px;
    font-family: 'Microsoft YaHei','PingFang SC','Noto Sans SC',sans-serif;
    background: linear-gradient(160deg,#fff7ec 0%,#ffe9d6 100%);
    color: #3a2c20;
  }
  .card {
    background: #fffdf9;
    border-radius: 22px;
    padding: 30px 34px;
    box-shadow: 0 18px 40px rgba(180,120,60,0.18);
    border: 1px solid rgba(220,160,90,0.25);
  }
  h1 {
    margin: 0 0 6px;
    font-size: 30px;
    color: #d2691e;
    letter-spacing: 1px;
  }
  h2 {
    margin: 26px 0 12px;
    font-size: 21px;
    color: #c65d21;
    padding-left: 12px;
    border-left: 5px solid #f0a860;
  }
  h3 { font-size: 18px; color: #a0522d; margin: 18px 0 8px; }
  p { margin: 8px 0; line-height: 1.7; font-size: 16px; }
  ul, ol { margin: 8px 0 8px; padding-left: 26px; line-height: 1.8; font-size: 16px; }
  li { margin: 4px 0; }
  ol li::marker { color: #d2691e; font-weight: 700; }
  strong { color: #b5471c; }
  img {
    max-width: 100%;
    border-radius: 14px;
    display: block;
    margin: 6px 0 16px;
    box-shadow: 0 6px 16px rgba(180,120,60,0.2);
  }
  code {
    background: #f6ecdc;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 14px;
  }
  .footer {
    margin-top: 24px;
    padding-top: 14px;
    border-top: 1px dashed rgba(200,140,80,0.4);
    color: #a98a6b;
    font-size: 13px;
    text-align: right;
  }
</style>
</head>
<body>
  <div class="card" id="card">
    ${bodyHtml}
    ${footer}
  </div>
  <div id="render-complete"></div>
</body>
</html>`
}

// 复用机器人已经在运行的 Chromium（和 miao 等插件同一个渲染后端），
// 不再自己 puppeteer.launch —— 否则会和已运行的 Chrome 抢占 profile 报 "already running"。
const TPL_DIR = path.join(process.cwd(), 'temp', 'html', 'what2eat')

let _rendererPromise = null
function getRenderer() {
  if (!_rendererPromise) {
    _rendererPromise = import('../../../lib/puppeteer/puppeteer.js')
      .then((m) => m.default)
      .catch((e) => {
        _rendererPromise = null
        throw e
      })
  }
  return _rendererPromise
}

/**
 * 把菜谱做法 markdown 渲染成图片。
 * 返回一个可直接用于 e.reply 的图片 segment；失败返回 null。
 * @param {string} markdown
 * @param {object} meta { category, source }
 */
export async function renderRecipeImage(markdown, meta = {}) {
  let renderer
  try {
    renderer = await getRenderer()
  } catch (e) {
    logger.warn(`[what2eat-plugin] 载入渲染后端失败：${e.message}`)
    return null
  }
  if (!renderer || typeof renderer.screenshot !== 'function') {
    logger.warn('[what2eat-plugin] 渲染后端不可用')
    return null
  }

  let tplFile
  try {
    if (!fs.existsSync(TPL_DIR)) fs.mkdirSync(TPL_DIR, { recursive: true })
    const id = `recipe_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    tplFile = path.join(TPL_DIR, `${id}.html`)
    const src = meta.source || ''
    const baseDir = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : ''
    // 先把图片下载到本地并替换为 file:// 地址，渲染不再依赖远程图床
    const mdLocal = await inlineImages(markdown, src)
    fs.writeFileSync(tplFile, buildHtml(mdToHtml(mdLocal, baseDir), meta), 'utf8')

    // 返回的是 segment.image（内部已用机器人的 Chromium 截图）
    const seg = await renderer.screenshot('what2eat', {
      tplFile,
      saveId: id,
      imgType: 'png',
      pageGotoParams: { waitUntil: 'networkidle0' },
    })
    if (!seg) {
      logger.warn('[what2eat-plugin] 做法渲染返回空')
      return null
    }
    logger.info('[what2eat-plugin] 做法渲染完成')
    return seg
  } catch (e) {
    logger.warn(`[what2eat-plugin] 做法渲染失败：${e.stack || e.message}`)
    return null
  } finally {
    if (tplFile) {
      try { fs.unlinkSync(tplFile) } catch {}
    }
  }
}

/** 清理 temp 里残留的做法模板 html（best-effort） */
export function cleanupRenders(maxAgeMs = 60 * 60 * 1000) {
  try {
    if (!fs.existsSync(TPL_DIR)) return
    const now = Date.now()
    for (const f of fs.readdirSync(TPL_DIR)) {
      if (!f.endsWith('.html')) continue
      const fp = path.join(TPL_DIR, f)
      try {
        if (now - fs.statSync(fp).mtimeMs > maxAgeMs) fs.unlinkSync(fp)
      } catch {}
    }
  } catch {}
}
