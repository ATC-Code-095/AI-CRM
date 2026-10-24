#!/usr/bin/env node
/** 导出 OpenAPI：node scripts/export-openapi.mjs */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.API_URL || 'http://127.0.0.1:3001'

const res = await fetch(`${base}/api/v1/docs-json`)
if (!res.ok) {
  console.error('openapi fetch failed', res.status)
  process.exit(1)
}
const json = await res.json()
const out = path.join(here, '../docs/openapi.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(json, null, 2))
console.log('written', out, 'paths', Object.keys(json.paths || {}).length)
