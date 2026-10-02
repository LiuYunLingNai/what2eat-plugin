import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * 入口：扫描 apps 目录下的 *.js，收集每个模块默认导出的 plugin 子类。
 * 导出名为 apps 的对象，交给 Yunzai 载入。
 */
const appsDir = path.join(__dirname, 'apps')
const files = fs
  .readdirSync(appsDir)
  .filter((file) => file.endsWith('.js'))

const apps = {}
const results = await Promise.allSettled(
  files.map((file) => import(`./apps/${file}`)),
)

for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.js$/, '')
  const res = results[i]
  if (res.status !== 'fulfilled') {
    logger.error(`[what2eat-plugin] 载入 apps/${files[i]} 失败：${res.reason}`)
    continue
  }
  const mod = res.value
  if (mod?.default) apps[name] = mod.default
}

logger.info(`[what2eat-plugin] 载入完成，共 ${Object.keys(apps).length} 个功能`)

export { apps }
