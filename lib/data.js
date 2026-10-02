import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 数据持久化目录：Yunzai/data/what2eat（不污染插件代码目录，更新插件不丢缓存）
const DATA_DIR = path.resolve(__dirname, '../../../data/what2eat')
const RECIPES_CACHE = path.join(DATA_DIR, 'recipes.json')
const MD_CACHE_DIR = path.join(DATA_DIR, 'dishes')

// 菜谱清单来源（与原项目一致）
const RECIPES_URL = 'https://eat.ryanuo.cc/recipes.json'
// 做法 markdown 来源（HowToCook 原仓库，多镜像容错）
const MD_MIRRORS = [
  (p) => `https://cdn.jsdelivr.net/gh/Anduin2017/HowToCook@master/${p}`,
  (p) => `https://raw.githubusercontent.com/Anduin2017/HowToCook/master/${p}`,
  (p) => `https://raw.gitmirror.com/Anduin2017/HowToCook/master/${p}`,
]

// 清单缓存有效期（毫秒）：24 小时
const RECIPES_TTL = 24 * 60 * 60 * 1000
// 做法缓存有效期：7 天
const MD_TTL = 7 * 24 * 60 * 60 * 1000

const FETCH_TIMEOUT = 10000

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function writeAtomic(filePath, content) {
  ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, filePath)
}

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function readCacheIfFresh(filePath, ttl) {
  try {
    if (!fs.existsSync(filePath)) return null
    const stat = fs.statSync(filePath)
    if (Date.now() - stat.mtimeMs > ttl) return null
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

// 内存缓存，避免每次指令都读盘 / 解析
let _recipesMem = null
let _recipesMemAt = 0

/**
 * 获取菜谱清单：内存 → 本地缓存 → 远程拉取。
 * 返回数组：[{ name, category, link, source_path }]
 */
export async function getRecipes(force = false) {
  if (!force && _recipesMem && Date.now() - _recipesMemAt < RECIPES_TTL) {
    return _recipesMem
  }

  if (!force) {
    const cached = readCacheIfFresh(RECIPES_CACHE, RECIPES_TTL)
    if (cached) {
      try {
        const list = JSON.parse(cached)
        if (Array.isArray(list) && list.length) {
          _recipesMem = list
          _recipesMemAt = Date.now()
          return list
        }
      } catch {
        // 缓存损坏，继续走远程
      }
    }
  }

  // 远程拉取
  const text = await fetchText(RECIPES_URL)
  const list = JSON.parse(text)
  if (!Array.isArray(list) || !list.length) {
    throw new Error('远程菜谱数据格式异常')
  }
  writeAtomic(RECIPES_CACHE, JSON.stringify(list))
  _recipesMem = list
  _recipesMemAt = Date.now()
  return list
}

/** 获取全部分类（去重） */
export async function getCategories() {
  const list = await getRecipes()
  return [...new Set(list.map((r) => r.category).filter(Boolean))]
}

/**
 * 随机取一道菜。
 * @param {string|string[]} [category] 指定一个或多个分类（可选，多分类取并集）
 */
export async function randomRecipe(category) {
  const list = await getRecipes()
  let pool = list
  if (category) {
    const cats = Array.isArray(category) ? category : [category]
    if (cats.length) {
      const set = new Set(cats)
      pool = list.filter((r) => set.has(r.category))
    }
  }
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

/** 按菜名精确 / 模糊查找 */
export async function findRecipe(name) {
  const list = await getRecipes()
  const kw = name.trim()
  if (!kw) return null
  // 精确优先
  const exact = list.find((r) => r.name === kw)
  if (exact) return exact
  // 模糊匹配
  return list.find((r) => r.name.includes(kw)) || null
}

/**
 * 获取某道菜的做法 markdown：本地缓存 → 远程镜像。
 * @param {object} recipe 菜谱对象（需含 source_path）
 */
export async function getRecipeMarkdown(recipe) {
  const sourcePath = recipe?.source_path
  if (!sourcePath) return null

  // 缓存文件名用菜名，避免路径里中文目录层级问题
  const safeName = (recipe.name || 'dish').replace(/[\\/:*?"<>|]/g, '_')
  const cacheFile = path.join(MD_CACHE_DIR, `${safeName}.md`)

  const cached = readCacheIfFresh(cacheFile, MD_TTL)
  if (cached) return cached

  const encodedPath = sourcePath.split('/').map(encodeURIComponent).join('/')
  let lastErr = null
  for (const build of MD_MIRRORS) {
    try {
      const md = await fetchText(build(encodedPath))
      if (md && md.trim()) {
        writeAtomic(cacheFile, md)
        return md
      }
    } catch (e) {
      lastErr = e
    }
  }
  if (lastErr) logger.warn(`[what2eat-plugin] 获取做法失败：${lastErr.message}`)
  return null
}

/** 原始菜谱网页链接（HowToCook 在线检索） */
export function getOriginLink(name) {
  if (!name) return ''
  return `https://howtocook.aiursoft.com/Dashboard?q=${encodeURIComponent(name)}`
}

/** B 站搜索「<菜名>的做法」视频（与原项目一致） */
export function getVideoLink(name) {
  if (!name) return ''
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(name + '的做法')}`
}
