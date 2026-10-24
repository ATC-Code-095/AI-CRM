import { test, expect, type APIRequestContext } from '@playwright/test'

const EMAIL = process.env.EMAIL ?? 'admin@demo.com'
const PASS = process.env.PASS ?? 'Demo@12345'

async function apiToken(request: APIRequestContext) {
  const res = await request.post('/api/v1/auth/login', { data: { email: EMAIL, password: PASS } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).data.accessToken as string
}

test('客户免登录打开报价分享链接', async ({ request, browser }) => {
  const token = await apiToken(request)
  const H = { Authorization: `Bearer ${token}` }
  const first = async (path: string) => (await (await request.get(`/api/v1${path}`, { headers: H })).json()).data.items[0].id as string
  const accountId = await first('/accounts?pageSize=1')
  const productId = await first('/products?pageSize=1')
  const subject = `分享页E2E-${Date.now()}`
  const quote = (await (await request.post('/api/v1/quotes', {
    headers: H,
    data: { accountId, subject, lines: [{ productId, qty: '1', discountRate: '0' }] },
  })).json()).data
  // 无折扣、金额小：提交即批准，才可分享
  await request.post(`/api/v1/quotes/${quote.id}/submit`, { headers: H })
  const share = (await (await request.post(`/api/v1/quotes/${quote.id}/share-link`, { headers: H })).json()).data
  expect(share?.url).toMatch(/^\/share\/quote\//)

  // 全新浏览器上下文：没有任何登录信息，相当于客户的手机
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(share.url)
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByText(subject).or(page.getByText(quote.quoteNo)).first()).toBeVisible({ timeout: 15000 })
  await ctx.close()
})

test('集团合并报表正常打开', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/group/report')
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(/页面出错了|Something went wrong/)).toHaveCount(0)
  expect(errors).toEqual([])
})
