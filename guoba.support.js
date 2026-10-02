import { getConfig, setConfig, clearConfigCache } from './lib/config.js'

const MIRROR_OPTIONS = [
  { label: '自动（按内置优先级依次尝试，推荐）', value: 'auto' },
  { label: 'raw.githubusercontent（GitHub 原始，直连最快）', value: 'raw' },
  { label: 'fastly.jsdelivr（jsDelivr Fastly 节点）', value: 'fastly' },
  { label: 'ghproxy 代理（用下方自定义代理地址）', value: 'ghproxy' },
  { label: 'cdn.jsdelivr（官方 CDN，国内常抽风）', value: 'jsdelivr' },
]

export function supportGuoba() {
  return {
    pluginInfo: {
      name: 'what2eat-plugin',
      title: '今天吃什么',
      description: '随机菜谱推荐插件（数据来自 HowToCook），支持分类筛选、做法出图、QQBot 按钮',
      author: 'LiuYunLingNai',
      authorLink: 'https://github.com/LiuYunLingNai',
      link: 'https://github.com/LiuYunLingNai/what2eat-plugin',
      isV3: true,
      isV2: false,
      showInMenu: 'auto',
      icon: 'mdi:silverware-fork-knife',
      iconColor: '#d2691e',
    },
    configInfo: {
      schemas: [
        {
          component: 'Divider',
          label: '资源镜像',
        },
        {
          field: 'mirror',
          label: '资源镜像',
          bottomHelpMessage:
            '菜谱/图片的下载源。jsDelivr 国内常慢或失败，建议用「自动」或「raw」；网络不好可选 ghproxy 代理。',
          component: 'Select',
          componentProps: {
            options: MIRROR_OPTIONS,
          },
        },
        {
          field: 'ghproxyBase',
          label: 'ghproxy 代理地址',
          bottomHelpMessage:
            '当镜像选「ghproxy 代理」时使用，形如 https://ghp.xxx.top/ ，会拼在 GitHub 原始地址前。',
          component: 'Input',
          componentProps: {
            placeholder: 'https://ghp.lyln114514.top/',
          },
        },
        {
          component: 'Divider',
          label: '显示选项',
        },
        {
          field: 'showPreviewImage',
          label: '出菜带预览图',
          bottomHelpMessage: '「今天吃什么」推荐结果是否在菜名上方附带菜品预览图。',
          component: 'Switch',
          componentProps: { checkedValue: true, unCheckedValue: false },
        },
        {
          field: 'renderRecipeImage',
          label: '做法渲染成图片',
          bottomHelpMessage: '「#做法xx」是否把做法渲染成图片；关闭则直接发文本（不依赖渲染器）。',
          component: 'Switch',
          componentProps: { checkedValue: true, unCheckedValue: false },
        },
      ],

      getConfigData() {
        return getConfig()
      },

      setConfigData(data, { Result }) {
        try {
          const patch = {}
          for (const key of ['mirror', 'ghproxyBase', 'showPreviewImage', 'renderRecipeImage']) {
            if (data[key] !== undefined) patch[key] = data[key]
          }
          setConfig(patch)
          clearConfigCache()
          return Result.ok({}, '保存成功~重新发指令即生效')
        } catch (e) {
          return Result.error({}, '保存失败：' + e.message)
        }
      },
    },
  }
}
