/**
 * API 服务地址。网页部署时前后端同源，留空即可；手机 App（Capacitor / 鸿蒙）的页面从本地加载，
 * 打包前需设置 VITE_API_BASE=https://crm.example.com（见 apps/mobile/BUILD.md）。
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/** 把以 / 开头的接口路径（/api/v1/…，或数据库中保存的相对文件地址）补全为完整地址 */
export function apiUrl(path: string): string {
  return API_BASE && path.startsWith('/') ? API_BASE + path : path
}

/** 给他人打开的网页链接（分享链接、二维码）。手机 App 内页面地址是本地地址，改用服务器地址 */
export function webUrl(path: string = window.location.pathname + window.location.search): string {
  return (API_BASE || window.location.origin) + path
}

const TOKEN_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  errors?: { field?: string; message: string }[]
}

export function isLoggedIn() {
  return Boolean(getAccessToken())
}

let refreshing: Promise<string | null> | null = null

/** 静默刷新 access token（并发只跑一次） */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null
    try {
      const res = await fetch(apiUrl('/api/v1/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const body = (await res.json()) as ApiEnvelope<{
        accessToken: string
        refreshToken: string
      }>
      if (body.code !== 0 || !body.data?.accessToken) {
        clearTokens()
        return null
      }
      setTokens(body.data.accessToken, body.data.refreshToken)
      return body.data.accessToken
    } catch {
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

let redirected = false
function redirectToLogin() {
  clearTokens()
  localStorage.removeItem('me_cache')
  // 并发 401 只跳转一次，避免 React 渲染中反复 location 赋值触发崩溃
  if (redirected) return
  redirected = true
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

/** 与 i18n 的语言探测一致：localStorage ui_locale → 浏览器语言；只区分中文 / 英文 */
function currentUiLocale(): string {
  const v = localStorage.getItem('ui_locale') || navigator.language || 'zh-CN'
  return v.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // 未登录直接失败，避免整页并发放出大量 401；登录接口与 /public/（如客户报价分享页）除外
  if (!getAccessToken() && !path.startsWith('/auth/') && !path.startsWith('/public/')) {
    redirectToLogin()
    throw new Error('unauthorized')
  }
  const doFetch = (token: string | null) =>
    fetch(apiUrl(`/api/v1${path}`), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        // 服务端按界面语言生成报表说明、建议、错误提示等文字
        'X-UI-Locale': currentUiLocale(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })

  let res = await doFetch(getAccessToken())

  // 401：尝试静默续期一次
  if (res.status === 401 && getRefreshToken()) {
    const newToken = await refreshAccessToken()
    if (newToken) {
      res = await doFetch(newToken)
    }
  }

  if (res.status === 401) {
    redirectToLogin()
    throw new Error('unauthorized')
  }

  const body = (await res.json()) as ApiEnvelope<T>
  if (body.code !== 0) {
    throw new Error(body.message || `error ${body.code}`)
  }
  return body.data
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ accessToken: string; refreshToken: string; user: MeUser; tenantCode?: string | null }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => api<MeUser>('/auth/me'),
}

/** 登录成功后保存令牌与资料；记住租户编码，登录页据此显示该企业的扫码登录 */
export function saveLogin(res: { accessToken: string; refreshToken: string; user: MeUser; tenantCode?: string | null }) {
  setTokens(res.accessToken, res.refreshToken)
  localStorage.setItem('me_cache', JSON.stringify(res.user))
  if (res.tenantCode) localStorage.setItem('tenant_code', res.tenantCode)
}

export type SsoProvider = 'wechat_work' | 'dingtalk' | 'feishu'

/** 扫码回跳页：平台带着 code / state 回到这里 */
export function ssoRedirectUri(provider: SsoProvider) {
  return `${window.location.origin}/login/sso/${provider}`
}

export interface MeUser {
  id: string
  email: string
  name: string
  dataScope: string
  locale: string
  timezone: string
  roles: string[]
  permissions: string[]
}
