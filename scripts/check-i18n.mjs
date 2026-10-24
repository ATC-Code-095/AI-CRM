#!/usr/bin/env node
/**
 * i18n 键完整性检查：node scripts/check-i18n.mjs
 * 比较 zh-CN 与 en-US 的 key 集合
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '../apps/web/src/locales')
const zh = JSON.parse(fs.readFileSync(path.join(root, 'zh-CN.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(root, 'en-US.json'), 'utf8'))
const zk = Object.keys(zh).sort()
const ek = Object.keys(en).sort()
const onlyZh = zk.filter((k) => !(k in en))
const onlyEn = ek.filter((k) => !(k in zh))

if (onlyZh.length || onlyEn.length) {
  console.error('i18n mismatch')
  if (onlyZh.length) console.error('only zh:', onlyZh)
  if (onlyEn.length) console.error('only en:', onlyEn)
  process.exit(1)
}
console.log(`i18n ok keys=${zk.length}`)
