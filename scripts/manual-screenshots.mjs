// 为 docs/manual 生成界面截图（JPEG）。界面改版后重新运行即可刷新手册配图。
// 前置：API 与 Web（生产构建预览）已启动，例如
//   LOGIN_RATE_LIMIT=100 node apps/api/dist/main.js &
//   pnpm -C apps/web exec vite preview --port 4174 &
// 用法：node scripts/manual-screenshots.mjs [只截名称包含该关键字的页面]
// 环境变量：WEB_URL（默认 http://localhost:4174）、EMAIL / PASS（默认种子演示账号，仅用于本地）、
//   LOCALE=en-US 截英文界面并输出到 docs/manual/en/images（默认 zh-CN → docs/manual/images）
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCALE = process.env.LOCALE === 'en-US' ? 'en-US' : 'zh-CN'
const OUT = join(ROOT, LOCALE === 'en-US' ? 'docs/manual/en/images' : 'docs/manual/images')
const WEB = (process.env.WEB_URL || 'http://localhost:4174').replace(/\/$/, '')
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'
const only = process.argv[2] || ''

/** 名称 → 路径；`:lead` 等占位在运行时替换为第一条真实记录的 id */
const DESKTOP = [
  ['home', '/home'],
  ['leads', '/leads'],
  ['lead-detail', '/leads/:lead'],
  ['pool', '/pool'],
  ['accounts', '/accounts'],
  ['account-detail', '/accounts/:account'],
  ['contacts', '/contacts'],
  ['opportunities', '/opportunities'],
  ['opportunity-detail', '/opportunities/:opportunity'],
  ['activities', '/activities'],
  ['calendar', '/calendar'],
  ['cadence', '/cadence'],
  ['products', '/products'],
  ['quotes', '/quotes'],
  ['quote-detail', '/quotes/:quote'],
  ['contracts', '/contracts'],
  ['contract-sign', '/contracts/:contract/sign'],
  ['renewals', '/contracts/renewals'],
  ['esign-board', '/esign/board'],
  ['approvals', '/approvals'],
  ['tickets', '/tickets'],
  ['campaigns', '/campaigns'],
  ['enablement', '/enablement'],
  ['todos', '/todos'],
  ['notifications', '/notifications'],
  ['reports', '/reports'],
  ['reports-pipeline', '/reports/pipeline'],
  ['forecast', '/reports/forecast'],
  ['payments-aging', '/reports/payments'],
  ['commission', '/reports/commission'],
  ['goals', '/goals'],
  ['weekly-brief', '/reports/weekly-brief'],
  ['import', '/import'],
  ['me', '/me'],
  ['help', '/help'],
  // 管理员
  ['admin-users', '/users'],
  ['admin-org', '/org'],
  ['admin-fields', '/fields'],
  ['admin-settings', '/settings'],
  ['admin-group', '/group'],
  ['admin-webhooks', '/webhooks'],
  ['admin-tokens', '/tokens'],
  ['admin-audit', '/audit'],
  ['admin-health', '/platform/health'],
  ['admin-template-guide', '/platform/template-guide'],
]
const MOBILE = [
  ['mobile-home', '/home'],
  ['mobile-opportunities', '/opportunities'],
  ['mobile-activities', '/activities'],
]

const shot = (page, name) =>
  page.screenshot({ path: join(OUT, `${name}.jpg`), type: 'jpeg', quality: 72 })

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForFunction(() => !document.querySelector('.ant-spin-spinning'), null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(600)
}

async function firstIds(page) {
  const token = await page.evaluate(() => localStorage.getItem('access_token'))
  const get = async (p) => {
    const r = await page.request.get(`${WEB}/api/v1${p}`, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json().catch(() => ({}))
    return j?.data?.items?.[0]?.id ?? ''
  }
  return {
    lead: await get('/leads?pageSize=1'),
    account: await get('/accounts?pageSize=1'),
    opportunity: await get('/opportunities?pageSize=1'),
    quote: await get('/quotes?pageSize=1'),
    contract: await get('/contracts?pageSize=1'),
  }
}

async function login(page) {
  await page.goto(`${WEB}/login`)
  await page.getByLabel('Email').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/home/, { timeout: 20000 })
}

async function run(context, list, ids) {
  const page = await context.newPage()
  for (const [name, route] of list) {
    if (only && !name.includes(only)) continue
    const path = route.replace(/:(\w+)/g, (_, k) => ids[k] || 'missing')
    if (path.includes('missing')) {
      console.warn(`skip ${name}: 无可用记录`)
      continue
    }
    await page.goto(`${WEB}${path}`)
    await settle(page)
    await shot(page, name)
    console.log(`ok   ${name}  ${path}`)
  }
  await page.close()
}

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' })
try {
  // 登录页（未登录状态）
  const anon = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: LOCALE })
  // 界面语言以 localStorage ui_locale 为准，每个页面加载前写入
  const useLocale = (ctx) => ctx.addInitScript((l) => localStorage.setItem('ui_locale', l), LOCALE)
  await useLocale(anon)
  const lp = await anon.newPage()
  await lp.goto(`${WEB}/login`)
  await settle(lp)
  if (!only || 'login'.includes(only)) await shot(lp, 'login')
  await anon.close()

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: LOCALE })
  await useLocale(desk)
  const p = await desk.newPage()
  await login(p)
  const ids = await firstIds(p)
  const state = await desk.storageState()
  await p.close()
  await run(desk, DESKTOP, ids)
  await desk.close()

  const mob = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: LOCALE,
    storageState: state,
  })
  await useLocale(mob)
  await run(mob, MOBILE, ids)
  await mob.close()
} finally {
  await browser.close()
}
