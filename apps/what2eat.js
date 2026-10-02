import {
  getRecipes,
  getCategories,
  randomRecipe,
  findRecipe,
  getRecipeMarkdown,
  getOriginLink,
  getVideoLink,
} from '../lib/data.js'
import { renderRecipeImage, cleanupRenders } from '../lib/render.js'
import {
  getSelection,
  setSelection,
  toggleSelection,
  clearSelection,
} from '../lib/selection.js'

// 分类分隔符：+ 、 , ， / 空格
const CAT_SEP = /[+、,，/\s]+/

export default class What2Eat extends plugin {
  constructor() {
    super({
      name: '今天吃什么',
      dsc: '随机菜谱推荐（数据来自 HowToCook）',
      event: 'message',
      priority: 500,
      rule: [
        { reg: '^#?(今天|中午|午饭|晚上|晚饭|早上|早饭|早餐)?吃(什么|啥)[?？]?$', fnc: 'eat' },
        { reg: '^#?切换分类(.+)$', fnc: 'toggleCat' },
        { reg: '^#?(清空|重置)(分类|筛选|选择)$', fnc: 'clearCat' },
        { reg: '^#?(菜谱分类|吃什么分类|吃什么帮助)$', fnc: 'categories' },
        { reg: '^#?(\\S+?)吃(什么|啥)[?？]?$', fnc: 'eatByCategory' },
        { reg: '^#?(做法|菜谱|怎么做|咋做)\\s*(.+)$', fnc: 'detail' },
      ],
    })
  }

  /** 是否支持 QQBot 原生按钮 */
  _canButton() {
    return typeof segment?.button === 'function'
  }

  /**
   * 组装消息文本：正文直接放，补充文字放进 markdown 引用块（> ）。
   * 在开启了原生 markdown 的 QQBot 上会渲染成引用块；纯文本平台则显示为 > 前缀行。
   */
  _md(main, notes = []) {
    const lines = [main]
    const list = (Array.isArray(notes) ? notes : [notes]).filter(Boolean)
    if (list.length) {
      lines.push('')
      for (const n of list) lines.push(`> ${n}`)
    }
    return lines.join('\n')
  }

  /**
   * 分类切换按钮行（每行 4 个）。
   * 已选中的分类前面加 ✅；点击发送 #切换分类xx（有状态累加/移除）。
   */
  _catToggleRows(selected, categories, maxRows) {
    const rows = []
    const sel = new Set(selected)
    for (let i = 0; i < categories.length && rows.length < maxRows; i += 4) {
      rows.push(
        categories.slice(i, i + 4).map((c) => ({
          text: (sel.has(c) ? '✅' : '') + c,
          input: `#切换分类${c}`,
          send: true,
        })),
      )
    }
    return rows
  }

  /**
   * 推荐结果按钮（出菜时）：看做法 / 原菜谱 + 分类切换 + 随机/清空。
   * 共 5 行以内：操作行(1) + 分类行(≤3) + 控制行(1)。
   */
  async _recommendButtons(recipe) {
    if (!this._canButton()) return null
    return segment.button(
      [
        { text: '看做法', input: `#做法${recipe.name}`, send: true },
        { text: '原菜谱', link: getOriginLink(recipe.name) },
        { text: '看视频', link: getVideoLink(recipe.name) },
      ],
      [
        { text: '🍽 分类筛选', input: '#菜谱分类', send: true },
      ],
    )
  }

  /** 仅分类筛选面板按钮（不出菜时）：分类切换 + 随机/清空 */
  async _panelButtons(selected) {
    if (!this._canButton()) return null
    let categories = []
    try {
      categories = await getCategories()
    } catch {
      categories = []
    }
    const rows = this._catToggleRows(selected, categories, 4)
    rows.push([
      { text: '🎲 随机', input: '#今天吃什么', send: true },
      { text: '清空筛选', input: '#清空分类', send: true },
    ])
    return segment.button(...rows)
  }

  async _replyRecommend(e, recipe, selected) {
    const catLabel = selected && selected.length ? selected.join('、') : '全部'
    const text = this._md('今天就吃 👉 ' + recipe.name, [
      `当前筛选：${catLabel}（分类：${recipe.category || '未知'}）`,
      '点「看做法」出图，「看视频」去 B 站搜教程',
    ])

    const msg = [text]
    const btn = await this._recommendButtons(recipe)
    if (btn) msg.push(btn)
    return e.reply(msg)
  }

  /** #今天吃什么 / #吃什么 / 🎲随机 —— 按当前筛选随机一道 */
  async eat(e) {
    const selected = getSelection(e)
    let recipe
    try {
      recipe = await randomRecipe(selected.length ? selected : undefined)
    } catch (err) {
      return e.reply(`菜谱数据获取失败：${err.message}`, true)
    }
    if (!recipe) {
      const msg = [
        selected.length
          ? `「${selected.join('、')}」下暂无菜谱，换个筛选试试~`
          : '暂时没有可推荐的菜谱~',
      ]
      const btn = await this._panelButtons(selected)
      if (btn) msg.push(btn)
      return e.reply(msg, true)
    }
    return this._replyRecommend(e, recipe, selected)
  }

  /** #切换分类xx —— 增减一个分类筛选（按钮驱动，有状态累加） */
  async toggleCat(e) {
    const m = e.msg.match(/^#?切换分类(.+)$/)
    const tk = m?.[1]?.trim()
    if (!tk) return false

    let categories
    try {
      categories = await getCategories()
    } catch (err) {
      return e.reply(`菜谱数据获取失败：${err.message}`, true)
    }
    const hit = categories.find((c) => c === tk) || categories.find((c) => c.includes(tk) || tk.includes(c))
    if (!hit) {
      return e.reply(`没有「${tk}」这个分类，可选：${categories.join('、')}`, true)
    }

    const selected = toggleSelection(e, hit)
    const text = selected.length
      ? this._md(`已选筛选：${selected.join('、')}`, '点「🎲 随机」抽一道，或继续点分类增减')
      : this._md('已清空筛选', '点「🎲 随机」从全部菜里抽')
    const msg = [text]
    const btn = await this._panelButtons(selected)
    if (btn) msg.push(btn)
    return e.reply(msg)
  }

  /** #清空分类 —— 清空筛选 */
  async clearCat(e) {
    clearSelection(e)
    const msg = [this._md('已清空分类筛选', '点「🎲 随机」从全部菜里抽')]
    const btn = await this._panelButtons([])
    if (btn) msg.push(btn)
    return e.reply(msg)
  }

  /**
   * #<分类>吃什么 —— 文本方式：设定筛选为这些分类并随机一道。
   * 支持用 + 、 , / 空格 叠加多个分类，如 #荤菜+水产吃什么、#荤菜、素菜吃什么。
   */
  async eatByCategory(e) {
    const m = e.msg.match(/^#?(\S+?)吃(什么|啥)[?？]?$/)
    const prefix = m?.[1]?.trim()
    const timeWords = ['今天', '中午', '午饭', '晚上', '晚饭', '早上', '早饭', '早餐']
    if (!prefix || timeWords.includes(prefix)) return this.eat(e)

    let categories
    try {
      categories = await getCategories()
    } catch (err) {
      return e.reply(`菜谱数据获取失败：${err.message}`, true)
    }

    // 按分隔符拆成多个 token，逐个匹配分类（精确优先，其次包含匹配）
    const tokens = prefix.split(CAT_SEP).map((t) => t.trim()).filter(Boolean)
    const matched = []
    for (const tk of tokens) {
      const hit = categories.find((c) => c === tk) || categories.find((c) => c.includes(tk) || tk.includes(c))
      if (hit && !matched.includes(hit)) matched.push(hit)
    }

    if (!matched.length) {
      const list = categories.join('、')
      const msg = [`没有「${prefix}」这个分类哦，可选分类：\n${list}\n\n可叠加多个分类，如 #荤菜+水产吃什么`]
      const btn = await this._panelButtons(getSelection(e))
      if (btn) msg.push(btn)
      return e.reply(msg, true)
    }

    // 文本指令同时把筛选落为这些分类，和按钮面板状态保持一致
    setSelection(e, matched)
    const recipe = await randomRecipe(matched)
    if (!recipe) return e.reply(`「${matched.join('、')}」下暂无菜谱~`, true)
    return this._replyRecommend(e, recipe, matched)
  }

  /** #做法<菜名> —— 渲染做法图片 */
  async detail(e) {
    const m = e.msg.match(/^#?(做法|菜谱|怎么做|咋做)\s*(.+)$/)
    const name = m?.[2]?.trim()
    if (!name) return e.reply('请在指令后带上菜名，如：#做法 拔丝土豆', true)

    let recipe
    try {
      recipe = await findRecipe(name)
    } catch (err) {
      return e.reply(`菜谱数据获取失败：${err.message}`, true)
    }
    if (!recipe) {
      return e.reply(`没找到「${name}」，换个菜名试试，或发送 #今天吃什么 随机来一道`, true)
    }

    const md = await getRecipeMarkdown(recipe)
    if (!md) {
      const msg = [`「${recipe.name}」的做法暂时拉取不到，可点下方链接查看原菜谱或视频。`]
      if (this._canButton()) {
        msg.push(segment.button([
          { text: '原菜谱', link: getOriginLink(recipe.name) },
          { text: '看视频', link: getVideoLink(recipe.name) },
        ]))
      }
      return e.reply(msg, true)
    }

    cleanupRenders()
    const imgSeg = await renderRecipeImage(md, {
      category: recipe.category,
      source: recipe.source_path,
    })

    const btnRow = this._canButton()
      ? segment.button([
          { text: '原菜谱', link: getOriginLink(recipe.name) },
          { text: '看视频', link: getVideoLink(recipe.name) },
          { text: '换一道', input: '#今天吃什么', send: true },
        ])
      : null

    if (imgSeg) {
      const msg = [imgSeg]
      if (btnRow) msg.push(btnRow)
      return e.reply(msg)
    }

    // 渲染失败：降级为文本（截断防刷屏）
    let body = md.trim()
    const MAX = 1800
    if (body.length > MAX) {
      body = body.slice(0, MAX) + '\n……（内容过长已截断，点下方「原菜谱」查看完整做法）'
    }
    const msg = [body]
    if (btnRow) msg.push(btnRow)
    return e.reply(msg)
  }

  /** #菜谱分类 —— 列出所有分类 */
  async categories(e) {
    let categories
    let total
    try {
      const list = await getRecipes()
      total = list.length
      categories = await getCategories()
    } catch (err) {
      return e.reply(`菜谱数据获取失败：${err.message}`, true)
    }

    const text = this._md(
      `共收录 ${total} 道菜，分类如下：\n${categories.map((c) => `· ${c}`).join('\n')}`,
      [
        '用法：',
        '· #今天吃什么  （按当前筛选随机一道）',
        '· 点分类按钮增减筛选，再点「🎲 随机」抽菜',
        '· #荤菜吃什么 / #荤菜+水产吃什么  （文本直接设定筛选）',
        '· #做法<菜名>  例如 #做法拔丝土豆（渲染成图片）',
      ],
    )

    const msg = [text]
    const btn = await this._panelButtons(getSelection(e))
    if (btn) msg.push(btn)
    return e.reply(msg)
  }
}
