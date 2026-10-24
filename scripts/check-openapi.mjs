#!/usr/bin/env node
/** OpenAPI 关键路径契约：node scripts/check-openapi.mjs */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(here, '../docs/openapi.json')
if (!fs.existsSync(file)) {
  console.error('docs/openapi.json missing — run node scripts/export-openapi.mjs')
  process.exit(1)
}
const spec = JSON.parse(fs.readFileSync(file, 'utf8'))
const paths = Object.keys(spec.paths || {})
const required = [
  '/api/v1/auth/login',
  '/api/v1/leads',
  '/api/v1/opportunities',
  '/api/v1/quotes',
  '/api/v1/contracts',
  '/api/v1/payments',
  '/api/v1/reports/dashboard',
  '/api/v1/search',
]
const missing = required.filter((r) => !paths.includes(r))
if (missing.length) {
  console.error('missing paths', missing)
  process.exit(1)
}
console.log(`openapi contract ok paths=${paths.length}`)
