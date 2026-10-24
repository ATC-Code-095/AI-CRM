// 把指定 npm 包及其全部生产依赖（递归）以实体目录复制到 <输出目录>/node_modules/<包名>，
// 供部署脚本随 API 上传服务器上还没有的新依赖（服务器的 node_modules 不随每次部署更新）。
// 用法：node scripts/bundle-deps.mjs <输出目录> <包名> [包名...]   （从 apps/api 解析）
import { cpSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [out, ...roots] = process.argv.slice(2)
if (!out || !roots.length) {
  console.error('usage: node scripts/bundle-deps.mjs <outDir> <pkg> [pkg...]')
  process.exit(1)
}
const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api')

/** 找到包目录（含 package.json）；包可能未导出 package.json，按目录逐级向上找 */
function pkgDir(name, fromDir) {
  const req = createRequire(join(fromDir, 'noop.js'))
  let entry
  try {
    entry = req.resolve(`${name}/package.json`)
    return dirname(realpathSync(entry))
  } catch {
    entry = realpathSync(req.resolve(name))
  }
  let d = dirname(entry)
  while (d !== dirname(d)) {
    const pj = join(d, 'package.json')
    if (existsSync(pj) && JSON.parse(readFileSync(pj, 'utf8')).name === name) return d
    d = dirname(d)
  }
  throw new Error(`cannot locate ${name}`)
}

const done = new Map()
function visit(name, fromDir) {
  if (done.has(name)) return
  const dir = pkgDir(name, fromDir)
  done.set(name, dir)
  const pj = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  for (const dep of Object.keys(pj.dependencies ?? {})) visit(dep, dir)
}
for (const r of roots) visit(r, apiDir)
for (const [name, dir] of done) {
  cpSync(dir, join(out, 'node_modules', name), { recursive: true, dereference: true })
}
console.log(`bundled ${done.size} packages: ${[...done.keys()].join(', ')}`)
