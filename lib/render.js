import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]
  ))
}

// 行内：**粗体** / `代码`
function inline(text) {
  let s = escapeHtml(text)
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/`([^`]+?)`/g, '<code>$1</code>')
  return s
}

/**
 * 极简 markdown → HTML（针对 HowToCook 菜谱结构：标题 / 无序列表 / 有序列表 / 段落）。
 */
function mdToHtml(md) {
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
      out.push(`<h${level}>${inline(m[2])}</h${level}>`)
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (listType !== 'ul') {
        closeList()
        out.push('<ul>')
        listType = 'ul'
      }
      out.push(`<li>${inline(m[1])}</li>`)
    } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      if (listType !== 'ol') {
        closeList()
        out.push('<ol>')
        listType = 'ol'
      }
      out.push(`<li>${inline(m[1])}</li>`)
    } else {
      closeList()
      out.push(`<p>${inline(line.trim())}</p>`)
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
    fs.writeFileSync(tplFile, buildHtml(mdToHtml(markdown), meta), 'utf8')

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
