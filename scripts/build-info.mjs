// 构建信息：版本号（根 package.json）+ 提交哈希 + 构建时间，供 API health 与前端 version.json 使用。
// 用法：node scripts/build-info.mjs <输出文件>；也可 import { getBuildInfo } 使用。
// 无 git（如 Docker 构建）时提交取环境变量 GIT_COMMIT，否则为 unknown。
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export function getBuildInfo() {
  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  let commit = git('rev-parse', '--short', 'HEAD')
  // 工作区有未提交改动时标记 -dirty，避免误以为线上与某个提交完全一致
  if (commit && git('status', '--porcelain', '--untracked-files=no')) commit += '-dirty'
  return {
    version,
    commit: commit || process.env.GIT_COMMIT || 'unknown',
    builtAt: new Date().toISOString(),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2]
  if (!out) {
    console.error('usage: node scripts/build-info.mjs <output-file>')
    process.exit(1)
  }
  const info = getBuildInfo()
  mkdirSync(dirname(resolve(out)), { recursive: true })
  writeFileSync(out, JSON.stringify(info, null, 2) + '\n')
  console.log(`build-info: v${info.version} ${info.commit} -> ${out}`)
}
