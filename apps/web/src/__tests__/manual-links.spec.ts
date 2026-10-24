import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slugify } from '../pages/help/HelpPage'

const DIR = resolve(__dirname, '../../../../docs/manual')
const FILES = ['user-manual.md', 'admin-manual.md', 'en/user-manual.md', 'en/admin-manual.md']

function anchors(md: string) {
  return new Set(
    md
      .split('\n')
      .filter((l) => /^#{1,4} /.test(l))
      .map((l) => slugify(l.replace(/^#+ /, ''))),
  )
}

describe('docs/manual 手册链接', () => {
  const docs = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(DIR, f), 'utf8')]))

  it('slugify 与 GitHub 标题锚点规则一致', () => {
    expect(slugify('1. 入门')).toBe('1-入门')
    expect(slugify('8.4 我的与修改密码')).toBe('84-我的与修改密码')
    expect(slugify('10. 开放集成：Webhook 与 Token')).toBe('10-开放集成webhook-与-token')
    expect(slugify('7.2 Security & Workflow')).toBe('72-security--workflow')
  })

  for (const file of FILES) {
    it(`${file}：站内锚点都能找到标题`, () => {
      const md = docs[file]
      const broken: string[] = []
      for (const [, target] of md.matchAll(/\]\(([^)\s]*#[^)\s]+)\)/g)) {
        const [path, hash] = target.split('#')
        // 链接相对当前手册所在目录（en/ 下的手册互相引用）
        const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''
        const doc = path ? docs[dir + path] : md
        if (path && !doc) continue // 指向 docs/ 其他文档的链接不在此校验
        if (!anchors(doc).has(decodeURIComponent(hash))) broken.push(target)
      }
      expect(broken).toEqual([])
    })

    it(`${file}：引用的截图都存在`, () => {
      const missing = [...docs[file].matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)]
        .map((m) => m[1])
        .filter((src) => !existsSync(join(DIR, file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '', src)))
      expect(missing).toEqual([])
    })
  }
})
