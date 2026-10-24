import { test, expect } from '@playwright/test'

const EMAIL = process.env.EMAIL ?? 'admin@demo.com'
const PASS = process.env.PASS ?? 'Demo@12345'

test('登录并进入工作台', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel(/^(Email|邮箱)$/)).toBeVisible({ timeout: 15000 })
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm|登\s*录/i }).click()
  await expect(page).toHaveURL(/\/home$/, { timeout: 15000 })
})

test('线索列表可见', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /线索|Leads/ }).click()
  await expect(page).toHaveURL(/\/leads/)
  await expect(page.getByRole('button', { name: /新建|New/ }).first()).toBeVisible()
})

test('商机看板加载', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /商机|Deals/ }).click()
  await expect(page).toHaveURL(/\/opportunities/)
  // 指标卡或新建按钮
  await expect(page.getByRole('button', { name: /新建|New/ }).first()).toBeVisible()
  await expect(page.getByText(/商机数|加权/).first()).toBeVisible()
})

test('审批与报表入口', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /审批|Approvals/ }).click()
  await expect(page).toHaveURL(/\/approvals/)
  // 报表中心（分类入口）
  await page.goto('/reports')
  await expect(page).toHaveURL(/\/reports/)
  await expect(page.getByRole('button', { name: /导出线索/ })).toBeVisible()
  await expect(page.getByText(/销售管道|业绩目标/).first()).toBeVisible()
})

test('组织管理页', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /组织|Org/ }).scrollIntoViewIfNeeded()
  await page.getByRole('menuitem').filter({ hasText: /组织|Org/ }).click()
  await expect(page).toHaveURL(/\/org/)
  await expect(page.getByRole('button', { name: /新建部门|New Department/ })).toBeVisible()
})

test('Webhook 与审计页', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /Webhook/ }).scrollIntoViewIfNeeded()
  await page.getByRole('menuitem').filter({ hasText: /Webhook/ }).click()
  await expect(page).toHaveURL(/\/webhooks/)
  await expect(page.getByRole('button', { name: /新建|New/ }).first()).toBeVisible()
  await page.getByRole('menuitem').filter({ hasText: /审计|Audit/ }).scrollIntoViewIfNeeded()
  await page.getByRole('menuitem').filter({ hasText: /审计|Audit/ }).click()
  await expect(page).toHaveURL(/\/audit/)
})

test('导入 CSV 入口', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /线索|Leads/ }).click()
  await expect(page.getByRole('button', { name: /导入 CSV/ })).toBeVisible()
})

test('报价列表可打开', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/^(Email|邮箱)$/).fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASS)
  await page.getByRole('button', { name: /确\s*认|Confirm/i }).click()
  await page.waitForURL(/\/home/)
  await page.getByRole('menuitem').filter({ hasText: /报价|Quotes/ }).click()
  await expect(page).toHaveURL(/\/quotes/)
  await expect(page.getByRole('button', { name: /新建|New/ }).first()).toBeVisible()
})
