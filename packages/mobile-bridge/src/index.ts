/**
 * Mobile Bridge 契约（docs/11）— 业务只依赖本接口
 * Web 降级：Geolocation / tel: / file input
 */

export type PlatformId = 'web' | 'ios' | 'android' | 'harmony'

export interface MobileBridge {
  getPlatform(): PlatformId
  getAppVersion(): Promise<string>
  getDevice(): Promise<{ model: string; os: string; osVersion: string }>
  requestPermissions(
    names: Array<'location' | 'camera' | 'notify'>,
  ): Promise<Record<string, 'granted' | 'denied'>>
  getCurrentPosition(): Promise<{ lat: number; lng: number; accuracy: number }>
  reverseGeocode(lat: number, lng: number): Promise<{ address: string }>
  openExternal(url: string): Promise<void>
  callPhone(tel: string): Promise<void>
  secureGet(key: string): Promise<string | null>
  secureSet(key: string, value: string): Promise<void>
}

/** Web / PWA 降级实现 */
export class WebMobileBridge implements MobileBridge {
  getPlatform(): PlatformId {
    return 'web'
  }

  async getAppVersion() {
    return 'web-0.1.0'
  }

  async getDevice() {
    return {
      model: navigator.userAgent.slice(0, 80),
      os: navigator.platform,
      osVersion: navigator.appVersion,
    }
  }

  async requestPermissions(names: Array<'location' | 'camera' | 'notify'>) {
    const out: Record<string, 'granted' | 'denied'> = {}
    for (const n of names) {
      if (n === 'location') {
        out[n] = 'granted' // 实际在 getCurrentPosition 再拒
      } else if (n === 'notify' && 'Notification' in window) {
        const p = await Notification.requestPermission()
        out[n] = p === 'granted' ? 'granted' : 'denied'
      } else {
        out[n] = 'denied'
      }
    }
    return out
  }

  async getCurrentPosition() {
    return new Promise<{ lat: number; lng: number; accuracy: number }>((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('geolocation unsupported'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        (err) => reject(new Error(err.message || 'geolocation denied')),
        { enableHighAccuracy: true, timeout: 10_000 },
      )
    })
  }

  async reverseGeocode(lat: number, lng: number) {
    // Web 无内置逆地理；返回坐标串，或走后端 GEO_PROVIDER
    return { address: `${lat.toFixed(5)},${lng.toFixed(5)}` }
  }

  async openExternal(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async callPhone(tel: string) {
    window.location.href = `tel:${tel}`
  }

  async secureGet(key: string) {
    return localStorage.getItem(`sec_${key}`)
  }

  async secureSet(key: string, value: string) {
    localStorage.setItem(`sec_${key}`, value)
  }
}

// ========== 推送（APNs / FCM）==========

/** 推送点击后带回的数据：type / entityType / entityId / notificationId */
export type PushData = Record<string, string>

export interface PushHandlers {
  /** 拿到设备令牌：交给后端登记（POST /push/devices） */
  onToken(platform: 'ios' | 'android', token: string): void
  /** 用户点击了推送：按 entityType / entityId 跳转 */
  onOpen(data: PushData): void
  onError?(message: string): void
}

interface CapacitorPushPlugin {
  checkPermissions(): Promise<{ receive: string }>
  requestPermissions(): Promise<{ receive: string }>
  register(): Promise<void>
  addListener(event: string, cb: (e: never) => void): Promise<{ remove(): Promise<void> }>
}

/** Android 工程自带的原生插件（apps/mobile/android/.../CrmAppPlugin.java） */
interface CrmAppPlugin {
  pushReady(): Promise<{ ready: boolean }>
}

interface CapacitorGlobal {
  isNativePlatform?(): boolean
  getPlatform?(): string
  Plugins?: { PushNotifications?: CapacitorPushPlugin; CrmApp?: CrmAppPlugin }
}

function capacitor(): CapacitorGlobal | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
}

/** 是否运行在已安装推送插件的 iOS / Android App 内 */
export function nativePushAvailable(): boolean {
  const cap = capacitor()
  const p = cap?.getPlatform?.()
  return Boolean(cap?.isNativePlatform?.() && (p === 'ios' || p === 'android') && cap.Plugins?.PushNotifications)
}

/**
 * 在 App 内申请通知权限并注册推送；网页 / PWA 中直接返回 false。
 * 用户拒绝授权也返回 false，不影响其他功能。
 */
export async function registerNativePush(h: PushHandlers): Promise<boolean> {
  if (!nativePushAvailable()) return false
  const cap = capacitor()!
  const push = cap.Plugins!.PushNotifications!
  const platform = cap.getPlatform!() as 'ios' | 'android'
  // Android 未配置 Firebase（打包时没有 google-services.json）时注册推送会让 App 崩溃，直接跳过
  if (platform === 'android') {
    const ready = await cap.Plugins!.CrmApp?.pushReady().then((r) => r.ready).catch(() => false)
    if (!ready) {
      h.onError?.('android push not configured (google-services.json missing)')
      return false
    }
  }
  let perm = await push.checkPermissions()
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await push.requestPermissions()
  if (perm.receive !== 'granted') return false
  await push.addListener('registration', ((t: { value: string }) => h.onToken(platform, t.value)) as (e: never) => void)
  await push.addListener('registrationError', ((e: { error: string }) => h.onError?.(e.error)) as (e: never) => void)
  await push.addListener(
    'pushNotificationActionPerformed',
    ((a: { notification: { data?: PushData } }) => h.onOpen(a.notification.data ?? {})) as (e: never) => void,
  )
  await push.register()
  return true
}

// ========== 鸿蒙 NEXT 推送（Push Kit）==========

/**
 * 鸿蒙壳通过 javaScriptProxy 注入的对象（名称 CrmHarmony，实现见 apps/harmony/entry/src/main/ets/common/CrmHarmony.ets）。
 * getPushToken：ArkTS 侧调用 pushService.getToken() 后返回令牌；
 * 用户点击通知启动 App 时，ArkTS 侧调用 window.crmOnPushOpen(JSON 字符串) 交给网页跳转。
 */
interface HarmonyGlobal {
  getPushToken?(): string | Promise<string>
}

function harmony(): HarmonyGlobal | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { CrmHarmony?: HarmonyGlobal }).CrmHarmony
}

export function harmonyPushAvailable(): boolean {
  return typeof harmony()?.getPushToken === 'function'
}

export async function registerHarmonyPush(h: { onToken(token: string): void; onOpen(data: PushData): void }): Promise<boolean> {
  const hm = harmony()
  if (!hm?.getPushToken) return false
  ;(window as unknown as { crmOnPushOpen?: (raw: string) => void }).crmOnPushOpen = (raw: string) => {
    try {
      h.onOpen(JSON.parse(raw) as PushData)
    } catch {
      /* 数据格式不对时忽略 */
    }
  }
  const token = await hm.getPushToken()
  if (!token) return false
  h.onToken(token)
  return true
}

let bridge: MobileBridge | null = null

export function getMobileBridge(): MobileBridge {
  if (!bridge) bridge = new WebMobileBridge()
  return bridge
}

export function setMobileBridge(b: MobileBridge) {
  bridge = b
}
