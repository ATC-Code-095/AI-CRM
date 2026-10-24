import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    channel: process.env.PW_CHANNEL ?? 'chrome',
    baseURL: process.env.WEB_URL ?? 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 800 },
    // 界面语言按浏览器探测；e2e 断言以中文文案为准
    locale: 'zh-CN',
  },
  projects: [{ name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.NO_WEB_SERVER
    ? undefined
    : {
        command: 'pnpm exec vite --host 127.0.0.1 --port 5174',
        cwd: 'apps/web',
        url: 'http://127.0.0.1:5174/login',
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
