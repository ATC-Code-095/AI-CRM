import { harmonyPushAvailable, nativePushAvailable, registerHarmonyPush, registerNativePush, type PushData } from '@zhixiao-crm/mobile-bridge'
import { api } from '../api/client'

const TOKEN_KEY = 'push_token'
let started = false

/** 推送点击后跳转的页面 */
export function pushTarget(data: PushData): string {
  const id = data.entityId
  switch (data.entityType) {
    case 'LEAD':
      return id ? `/leads/${id}` : '/leads'
    case 'ACCOUNT':
      return id ? `/accounts/${id}` : '/accounts'
    case 'OPPORTUNITY':
      return id ? `/opportunities/${id}` : '/opportunities'
    case 'QUOTE':
      return id ? `/quotes/${id}` : '/quotes'
    case 'CONTRACT':
      return '/contracts'
    default:
      return data.type?.startsWith('APPROVAL') ? '/approvals' : '/notifications'
  }
}

/** 登录后在 App 内注册推送并把设备令牌登记到账号；网页中什么也不做 */
function registerToken(platform: 'ios' | 'android' | 'harmony', token: string) {
  localStorage.setItem(TOKEN_KEY, token)
  void api('/push/devices', {
    method: 'POST',
    body: JSON.stringify({ platform, token, appVersion: __APP_VERSION__ }),
  }).catch(() => undefined)
}

/** 登录后在 App 内注册推送并把设备令牌登记到账号：iOS / Android（Capacitor）或鸿蒙；网页中什么也不做 */
export function startNativePush(navigate: (to: string) => void) {
  if (started) return
  if (nativePushAvailable()) {
    started = true
    void registerNativePush({
      onToken: (platform, token) => registerToken(platform, token),
      onOpen: (data) => navigate(pushTarget(data)),
    }).catch(() => undefined)
  } else if (harmonyPushAvailable()) {
    started = true
    void registerHarmonyPush({
      onToken: (token) => registerToken('harmony', token),
      onOpen: (data) => navigate(pushTarget(data)),
    }).catch(() => undefined)
  }
}

/** 退出登录前注销本机令牌，避免推送发到已退出的手机 */
export async function stopNativePush() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return
  localStorage.removeItem(TOKEN_KEY)
  await api('/push/devices', { method: 'DELETE', body: JSON.stringify({ token }) }).catch(() => undefined)
}
