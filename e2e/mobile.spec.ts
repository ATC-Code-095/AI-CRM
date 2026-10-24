import { test, expect } from '@playwright/test'

const EMAIL = process.env.EMAIL ?? 'admin@demo.com'
const PASS = process.env.PASS ?? 'Demo@12345'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('手机端底部 Tab 可见并可进商机', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm|OK/i }).click()
  await page.waitForURL(/\/home/)

  // 底部五入口文案可见（中/英）
  await expect(page.getByText(/工作台|Home/).last()).toBeVisible()
  await expect(page.getByText(/客户|Accounts/).last()).toBeVisible()
  await expect(page.getByText(/商机|Deals/).last()).toBeVisible()
  await expect(page.getByText(/跟进|Follow/).last()).toBeVisible()

  // 点击「商机」进列表
  await page.getByRole('link', { name: /商机|Deals/ }).first().click()
  await expect(page).toHaveURL(/\/opportunities/)

  // 跟进页
  await page.goto('/activities')
  await expect(page).toHaveURL(/\/activities/)
  await expect(page.getByRole('button', { name: /^(新\s*建|New)$/ }).first()).toBeVisible()
})

test('手机端打卡按钮可见', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm|OK/i }).click()
  await page.waitForURL(/\/home/)
  await page.goto('/activities')
  await expect(page.getByRole('button', { name: /^(新\s*建|New)$/ }).first()).toBeVisible()
})

test('手机端打卡（Mock 定位）', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']).catch(() => undefined)
  await context.setGeolocation({ latitude: 31.23, longitude: 121.47 }).catch(() => undefined)
  await page.goto('/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm|OK/i }).click()
  await page.waitForURL(/\/home/)

  await page.goto('/activities')
  await expect(page.getByRole('button', { name: /^(新\s*建|New)$/ }).first()).toBeVisible()

  // 非安全上下文（http）浏览器会拒绝 geolocation，跳过定位断言
  const secure = await page.evaluate(() => window.isSecureContext)
  if (!secure) {
    test.info().annotations.push({ type: 'note', description: 'skip geolocation on insecure origin' })
    return
  }
  const pos = await page.evaluate(
    () =>
      new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          (e) => reject(new Error(e.message)),
        )
      }),
  )
  expect(pos.lat).toBeCloseTo(31.23, 1)
  expect(pos.lng).toBeCloseTo(121.47, 1)
})
