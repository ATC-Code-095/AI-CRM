import type { CapacitorConfig } from '@capacitor/cli'

/**
 * 打包参数（构建前用环境变量设置，见 BUILD.md；scripts/mobile-sync.sh 会一并传入）：
 *   VITE_API_BASE  后端地址，如 https://crm.example.com。App 里所有接口请求都发往这里
 *   CAP_APP_ID     应用包名；须与 Apple / Google 开发者后台登记的一致。首次生成原生工程后再改需同步修改工程
 */
const apiBase = process.env.VITE_API_BASE ?? ''
// 正式发布应使用 HTTPS。仅当后端是 http:// 时才放行明文请求（内网测试用）
const httpApi = apiBase.startsWith('http://')

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? 'com.itecent.crm',
  appName: '智销CRM',
  webDir: 'www',
  server: {
    // 页面从 App 内加载（https://localhost），接口走 VITE_API_BASE；不使用 server.url 远程加载整站
    androidScheme: 'https',
    ...(httpApi ? { cleartext: true } : {}),
  },
  android: {
    // 页面是 https://localhost，请求 http:// 后端属于混合内容，需显式放行
    allowMixedContent: httpApi,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
    },
  },
}

export default config
