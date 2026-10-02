// 每个用户的分类筛选选择（内存态，带 TTL；重启后清空，属于临时偏好可接受）

const store = new Map() // key -> { cats: Set<string>, at: number }
const TTL = 2 * 60 * 60 * 1000 // 2 小时无操作后过期

function keyOf(e) {
  const scope = e.group_id ?? e.guild_id ?? 'private'
  return `${scope}_${e.user_id}`
}

function alive(key) {
  const v = store.get(key)
  if (!v) return null
  if (Date.now() - v.at > TTL) {
    store.delete(key)
    return null
  }
  return v
}

/** 读取当前用户已选分类（数组，可能为空） */
export function getSelection(e) {
  const v = alive(keyOf(e))
  return v ? [...v.cats] : []
}

/** 覆盖设置当前用户的分类选择 */
export function setSelection(e, cats) {
  const key = keyOf(e)
  store.set(key, { cats: new Set(cats), at: Date.now() })
  return [...new Set(cats)]
}

/** 切换某个分类（有则移除，无则加入），返回最新选择 */
export function toggleSelection(e, cat) {
  const key = keyOf(e)
  let v = alive(key)
  if (!v) {
    v = { cats: new Set(), at: Date.now() }
    store.set(key, v)
  }
  v.at = Date.now()
  if (v.cats.has(cat)) v.cats.delete(cat)
  else v.cats.add(cat)
  return [...v.cats]
}

/** 清空当前用户的分类选择 */
export function clearSelection(e) {
  store.delete(keyOf(e))
  return []
}
