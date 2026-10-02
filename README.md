# what2eat-plugin

> 今天吃什么？—— TRSS-Yunzai 随机菜谱推荐插件，帮你解决「今天吃什么」的世纪难题。

菜谱数据来自 [HowToCook（程序员做饭指南）](https://github.com/Anduin2017/HowToCook)，灵感与数据接口参考了 [ryanuo/whatToEat](https://github.com/ryanuo/whatToEat)。

## 功能

- 🎲 随机推荐一道菜，带菜品预览图
- 🍚 按菜系筛选（素菜 / 荤菜 / 水产 / 早餐 / 主食 / 汤与粥 / 甜品 等），支持多分类叠加
- 📖 `#做法<菜名>` 把完整做法（原料 + 步骤）渲染成图片，不刷屏
- 🔘 适配 QQBot 原生按钮：看做法 / 原菜谱 / 看视频（B 站搜索）/ 分类筛选
- 💾 菜谱清单与做法在线拉取并本地缓存，减少重复请求

## 安装

将本仓库克隆到 Yunzai 的 `plugins` 目录下：

```bash
# 在 Yunzai 根目录执行
git clone https://github.com/LiuYunLingNai/what2eat-plugin.git ./plugins/what2eat-plugin
```

无需额外依赖（使用 Node 内置 `fetch`，图片渲染复用 Yunzai 自带的渲染后端）。重启 Yunzai 即可。

> 要求 Node.js 18+（内置 `fetch`）。

## 指令

| 指令 | 说明 |
| --- | --- |
| `#今天吃什么` / `#吃什么` | 按当前筛选随机推荐一道菜 |
| `#<分类>吃什么` | 指定菜系随机，如 `#荤菜吃什么` |
| `#<分类>+<分类>吃什么` | 多分类叠加，如 `#荤菜+水产吃什么`（`+`、`、`、空格 均可分隔） |
| `#做法<菜名>` | 渲染该菜的完整做法图，如 `#做法拔丝土豆` |
| `#菜谱分类` | 打开分类筛选面板（按钮可增减筛选） |
| `#切换分类<分类>` | 增减一个分类筛选（一般由按钮触发） |
| `#清空分类` | 清空当前筛选 |

## 按钮交互（QQBot）

- 出菜结果：**看做法** / **原菜谱** / **看视频** / **🍽 分类筛选**
- 分类筛选面板：点分类按钮增减筛选（已选项带 ✅），再点 **🎲 随机** 抽一道
- 非 QQBot 平台自动降级为纯文本，指令照常可用

## 数据与缓存

- 菜谱清单：`https://eat.ryanuo.cc/recipes.json`（缓存 24 小时）
- 做法正文：HowToCook 仓库 markdown（jsdelivr / raw.githubusercontent / gitmirror 三源容错，缓存 7 天）
- 缓存目录：`<Yunzai>/data/what2eat/`

## 致谢

- [HowToCook](https://github.com/Anduin2017/HowToCook) —— 菜谱数据
- [ryanuo/whatToEat](https://github.com/ryanuo/whatToEat) —— 原始项目与数据接口

## 许可证

[MIT](./LICENSE)
