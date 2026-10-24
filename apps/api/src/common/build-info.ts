import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface BuildInfo {
  version: string
  commit: string
  builtAt: string | null
}

/**
 * 构建时由 scripts/build-info.mjs 写入 dist/build-info.json（部署只上传 dist，服务器上的 package.json 不会更新）。
 * 本地开发（src 下运行）没有该文件时，回退到 package.json 版本号与环境变量 GIT_COMMIT。
 */
function load(): BuildInfo {
  const file = join(__dirname, '..', 'build-info.json')
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<BuildInfo>
      if (raw.version && raw.commit) {
        return { version: raw.version, commit: raw.commit, builtAt: raw.builtAt ?? null }
      }
    } catch {
      // 文件损坏时走回退，不影响 health
    }
  }
  let version = 'unknown'
  try {
    version = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version?: string })
      .version ?? 'unknown'
  } catch {
    // ignore
  }
  return { version, commit: process.env.GIT_COMMIT || 'dev', builtAt: null }
}

export const BUILD_INFO: BuildInfo = load()
