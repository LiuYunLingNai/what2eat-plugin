import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FILE = path.resolve(__dirname, '../config/config.default.json')
// 用户配置落在 data 目录，更新插件不丢
const USER_FILE = path.resolve(__dirname, '../../../data/what2eat/config.json')

// 兜底默认值（即使默认配置文件丢失也能跑）
const FALLBACK = {
  mirror: 'auto', // auto | raw | fastly | ghproxy | jsdelivr
  ghproxyBase: 'https://ghp.lyln114514.top/',
  showPreviewImage: true,
  renderRecipeImage: true,
}

function readJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  return null
}

let _cache = null

export function getConfig() {
  if (_cache) return _cache
  _cache = { ...FALLBACK, ...(readJson(DEFAULT_FILE) || {}), ...(readJson(USER_FILE) || {}) }
  return _cache
}

export function setConfig(patch = {}) {
  const merged = { ...getConfig(), ...patch }
  try {
    fs.mkdirSync(path.dirname(USER_FILE), { recursive: true })
    const tmp = `${USER_FILE}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, USER_FILE)
  } catch (e) {
    logger?.warn?.(`[what2eat-plugin] 写入配置失败：${e.message}`)
  }
  _cache = merged
  return merged
}

export function clearConfigCache() {
  _cache = null
}

// 各命名镜像的 URL 构造器（入参 p 为仓库内相对路径，已 URL 编码）
const BUILDERS = {
  raw: (p) => `https://raw.githubusercontent.com/Anduin2017/HowToCook/master/${p}`,
  fastly: (p) => `https://fastly.jsdelivr.net/gh/Anduin2017/HowToCook@master/${p}`,
  jsdelivr: (p) => `https://cdn.jsdelivr.net/gh/Anduin2017/HowToCook@master/${p}`,
  ghproxy: (p, base) =>
    `${(base || FALLBACK.ghproxyBase).replace(/\/+$/, '')}/https://raw.githubusercontent.com/Anduin2017/HowToCook/master/${p}`,
}

// 按内置优先级（实测速度）排列
const AUTO_ORDER = ['raw', 'fastly', 'ghproxy', 'jsdelivr']

/**
 * 根据配置返回有序的镜像构造器数组（首选在前，其余作为容错兜底）。
 */
export function getMirrorBuilders() {
  const cfg = getConfig()
  const base = cfg.ghproxyBase
  const make = (name) => (p) => BUILDERS[name](p, base)

  let order
  if (cfg.mirror && cfg.mirror !== 'auto' && BUILDERS[cfg.mirror]) {
    // 选定镜像优先，其余按内置顺序兜底
    order = [cfg.mirror, ...AUTO_ORDER.filter((n) => n !== cfg.mirror)]
  } else {
    order = AUTO_ORDER
  }
  return order.map(make)
}
