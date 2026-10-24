import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { constants, createPrivateKey, KeyObject, sign } from 'crypto'
import { readFileSync } from 'fs'
import http2 from 'http2'
import { PrismaService } from '../../common/prisma/prisma.service'

/**
 * 手机推送：iOS 走 APNs（HTTP/2 + .p8 密钥），Android 走 FCM HTTP v1（Firebase 服务账号），
 * 鸿蒙 NEXT 走华为 Push Kit v3（服务账号密钥签发 JWT）。
 * 凭证只经环境变量传入（见 README「配置项」），未配置的平台直接跳过。
 */

export interface PushMessage {
  title: string
  body?: string | null
  /** 点击推送后 App 用它跳转：type / entityType / entityId / notificationId */
  data?: Record<string, string>
}

export type SendResult = 'ok' | 'invalid-token' | 'error'

interface ApnsConfig {
  keyId: string
  teamId: string
  bundleId: string
  key: KeyObject
  host: string
}

interface HmsConfig {
  projectId: string
  keyId: string
  subAccount: string
  key: KeyObject
}

interface FcmConfig {
  projectId: string
  clientEmail: string
  key: KeyObject
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString('base64url')

/** 环境变量里的 PEM 常以 \n 转义成一行 */
function pemFrom(value?: string, file?: string): string | null {
  if (file) return readFileSync(file, 'utf8')
  if (!value) return null
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value
}

export function loadApnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const pem = pemFrom(env.APNS_KEY, env.APNS_KEY_FILE)
  if (!pem || !env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null
  return {
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    bundleId: env.APNS_BUNDLE_ID || 'com.itecent.crm',
    key: createPrivateKey(pem),
    host: env.APNS_PRODUCTION === 'true' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com',
  }
}

export function loadFcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT_FILE ? readFileSync(env.FCM_SERVICE_ACCOUNT_FILE, 'utf8') : env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  const sa = JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string }
  if (!sa.project_id || !sa.client_email || !sa.private_key) return null
  return { projectId: sa.project_id, clientEmail: sa.client_email, key: createPrivateKey(sa.private_key) }
}

/** 华为 Push Kit 服务账号密钥（AppGallery Connect → 项目设置 → 服务账号）：JSON 内容或文件路径 */
export function loadHmsConfig(env: NodeJS.ProcessEnv = process.env): HmsConfig | null {
  const raw = env.HMS_SERVICE_ACCOUNT_FILE ? readFileSync(env.HMS_SERVICE_ACCOUNT_FILE, 'utf8') : env.HMS_SERVICE_ACCOUNT
  if (!raw) return null
  const sa = JSON.parse(raw) as { project_id?: string; key_id?: string; sub_account?: string; private_key?: string }
  if (!sa.project_id || !sa.key_id || !sa.sub_account || !sa.private_key) return null
  return { projectId: sa.project_id, keyId: sa.key_id, subAccount: sa.sub_account, key: createPrivateKey(sa.private_key) }
}

/** Push Kit 鉴权 JWT：PS256，iss 为服务账号 sub_account，kid 为密钥 ID，有效期 1 小时 */
export function hmsJwt(cfg: Pick<HmsConfig, 'keyId' | 'subAccount' | 'key'>, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ kid: cfg.keyId, typ: 'JWT', alg: 'PS256' }))
  const claims = b64url(
    JSON.stringify({ aud: 'https://oauth-login.cloud.huawei.com/oauth2/v3/token', iss: cfg.subAccount, iat: nowSec, exp: nowSec + 3600 }),
  )
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), {
    key: cfg.key,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: 32,
  })
  return `${head}.${claims}.${b64url(sig)}`
}

export function hmsPayload(token: string, msg: PushMessage) {
  return {
    payload: {
      notification: {
        category: 'WORK',
        title: msg.title,
        body: msg.body || msg.title,
        clickAction: { actionType: 0, data: msg.data ?? {} },
      },
    },
    target: { token: [token] },
  }
}

/** APNs 提供方令牌：ES256，iss=Team ID，kid=Key ID；Apple 要求 20–60 分钟内复用 */
export function apnsJwt(cfg: Pick<ApnsConfig, 'keyId' | 'teamId' | 'key'>, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }))
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec }))
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key: cfg.key, dsaEncoding: 'ieee-p1363' })
  return `${head}.${claims}.${b64url(sig)}`
}

/** Google OAuth2 服务账号断言：RS256，换取 firebase.messaging 访问令牌 */
export function fcmAssertion(cfg: Pick<FcmConfig, 'clientEmail' | 'key'>, nowSec = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  )
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), cfg.key)
  return `${head}.${claims}.${b64url(sig)}`
}

export function apnsPayload(msg: PushMessage) {
  return { aps: { alert: { title: msg.title, ...(msg.body ? { body: msg.body } : {}) }, sound: 'default' }, ...(msg.data ?? {}) }
}

export function fcmPayload(token: string, msg: PushMessage) {
  return {
    message: {
      token,
      notification: { title: msg.title, ...(msg.body ? { body: msg.body } : {}) },
      data: msg.data ?? {},
      android: { priority: 'HIGH', notification: { sound: 'default' } },
    },
  }
}

@Injectable()
export class DevicePushService implements OnModuleDestroy {
  private readonly logger = new Logger('DevicePush')
  private apns: ApnsConfig | null | undefined
  private fcm: FcmConfig | null | undefined
  private hms: HmsConfig | null | undefined
  private hmsToken: { value: string; at: number } | null = null
  private apnsToken: { value: string; at: number } | null = null
  private fcmToken: { value: string; exp: number } | null = null
  private session: http2.ClientHttp2Session | null = null

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.session?.close()
  }

  private apnsConfig() {
    if (this.apns === undefined) {
      try {
        this.apns = loadApnsConfig()
      } catch (e) {
        this.logger.error(`APNs config invalid: ${(e as Error).message}`)
        this.apns = null
      }
    }
    return this.apns
  }

  private fcmConfig() {
    if (this.fcm === undefined) {
      try {
        this.fcm = loadFcmConfig()
      } catch (e) {
        this.logger.error(`FCM config invalid: ${(e as Error).message}`)
        this.fcm = null
      }
    }
    return this.fcm
  }

  private hmsConfig() {
    if (this.hms === undefined) {
      try {
        this.hms = loadHmsConfig()
      } catch (e) {
        this.logger.error(`HMS Push config invalid: ${(e as Error).message}`)
        this.hms = null
      }
    }
    return this.hms
  }

  status() {
    const apns = this.apnsConfig()
    return {
      apns: apns ? { configured: true, bundleId: apns.bundleId, production: apns.host.includes('api.push') } : { configured: false },
      fcm: this.fcmConfig() ? { configured: true, projectId: this.fcm!.projectId } : { configured: false },
      hms: this.hmsConfig() ? { configured: true, projectId: this.hms!.projectId } : { configured: false },
    }
  }

  async register(tenantId: string, userId: string, platform: 'ios' | 'android' | 'harmony', token: string, appVersion?: string) {
    // 同一设备换账号登录时，令牌归属新账号
    return this.prisma.deviceToken.upsert({
      where: { token },
      update: { tenantId, userId, platform, appVersion: appVersion ?? null, lastSeenAt: new Date() },
      create: { tenantId, userId, platform, token, appVersion: appVersion ?? null },
      select: { id: true, platform: true, lastSeenAt: true },
    })
  }

  async unregister(userId: string, token: string) {
    const r = await this.prisma.deviceToken.deleteMany({ where: { userId, token } })
    return { removed: r.count }
  }

  /** 推送给某个用户的全部设备；失效令牌自动删除。未配置凭证时什么也不做 */
  async sendToUser(tenantId: string, userId: string, msg: PushMessage) {
    const apns = this.apnsConfig()
    const fcm = this.fcmConfig()
    const hms = this.hmsConfig()
    if (!apns && !fcm && !hms) return { sent: 0, removed: 0 }
    const devices = await this.prisma.deviceToken.findMany({ where: { tenantId, userId } })
    let sent = 0
    const invalid: string[] = []
    for (const d of devices) {
      let r: SendResult = 'error'
      if (d.platform === 'ios' && apns) r = await this.sendApns(apns, d.token, msg)
      else if (d.platform === 'android' && fcm) r = await this.sendFcm(fcm, d.token, msg)
      else if (d.platform === 'harmony' && hms) r = await this.sendHms(hms, d.token, msg)
      else continue
      if (r === 'ok') sent++
      if (r === 'invalid-token') invalid.push(d.token)
    }
    if (invalid.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: invalid } } })
    return { sent, removed: invalid.length }
  }

  private apnsBearer(cfg: ApnsConfig) {
    const now = Date.now()
    if (!this.apnsToken || now - this.apnsToken.at > 50 * 60_000) {
      this.apnsToken = { value: apnsJwt(cfg), at: now }
    }
    return this.apnsToken.value
  }

  private apnsSession(host: string) {
    if (!this.session || this.session.closed || this.session.destroyed) {
      this.session = http2.connect(host)
      this.session.on('error', (e) => this.logger.warn(`APNs session error: ${e.message}`))
      this.session.unref()
    }
    return this.session
  }

  async sendApns(cfg: ApnsConfig, token: string, msg: PushMessage): Promise<SendResult> {
    const body = JSON.stringify(apnsPayload(msg))
    try {
      const { status, reason } = await new Promise<{ status: number; reason?: string }>((resolve, reject) => {
        const req = this.apnsSession(cfg.host).request({
          ':method': 'POST',
          ':path': `/3/device/${token}`,
          authorization: `bearer ${this.apnsBearer(cfg)}`,
          'apns-topic': cfg.bundleId,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        })
        let status = 0
        let raw = ''
        req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL))
        req.on('response', (h) => (status = Number(h[':status'])))
        req.on('data', (c: Buffer) => (raw += c.toString()))
        req.on('end', () => resolve({ status, reason: raw ? (JSON.parse(raw) as { reason?: string }).reason : undefined }))
        req.on('error', reject)
        req.end(body)
      })
      if (status === 200) return 'ok'
      if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic') {
        return 'invalid-token'
      }
      this.logger.warn(`APNs ${status} ${reason ?? ''}`)
      return 'error'
    } catch (e) {
      this.logger.warn(`APNs send failed: ${(e as Error).message}`)
      this.session?.destroy()
      this.session = null
      return 'error'
    }
  }

  async sendHms(cfg: HmsConfig, token: string, msg: PushMessage): Promise<SendResult> {
    const now = Date.now()
    if (!this.hmsToken || now - this.hmsToken.at > 50 * 60_000) this.hmsToken = { value: hmsJwt(cfg), at: now }
    try {
      const res = await fetch(`https://push-api.cloud.huawei.com/v3/${cfg.projectId}/messages:send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.hmsToken.value}`,
          // 0 = 通知栏消息
          'push-type': '0',
        },
        body: JSON.stringify(hmsPayload(token, msg)),
        signal: AbortSignal.timeout(10_000),
      })
      const json = (await res.json().catch(() => ({}))) as { code?: string; msg?: string }
      if (res.ok && json.code === '80000000') return 'ok'
      // 80300007：令牌全部无效（卸载、令牌过期或不属于本应用）
      if (json.code === '80300007') return 'invalid-token'
      this.logger.warn(`HMS Push ${res.status} ${json.code ?? ''} ${json.msg ?? ''}`)
      return 'error'
    } catch (e) {
      this.logger.warn(`HMS Push send failed: ${(e as Error).message}`)
      return 'error'
    }
  }

  private async fcmAccessToken(cfg: FcmConfig) {
    const now = Date.now()
    if (this.fcmToken && this.fcmToken.exp - 60_000 > now) return this.fcmToken.value
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: fcmAssertion(cfg),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
    if (!res.ok || !json.access_token) throw new Error(`oauth ${res.status} ${json.error ?? ''}`)
    this.fcmToken = { value: json.access_token, exp: now + (json.expires_in ?? 3600) * 1000 }
    return json.access_token
  }

  async sendFcm(cfg: FcmConfig, token: string, msg: PushMessage): Promise<SendResult> {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this.fcmAccessToken(cfg)}` },
        body: JSON.stringify(fcmPayload(token, msg)),
        signal: AbortSignal.timeout(10_000),
      })
      if (res.ok) return 'ok'
      const err = (await res.json().catch(() => ({}))) as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> }
      }
      const code = err.error?.details?.find((d) => d.errorCode)?.errorCode ?? err.error?.status
      if (res.status === 404 || code === 'UNREGISTERED') return 'invalid-token'
      this.logger.warn(`FCM ${res.status} ${code ?? ''}`)
      return 'error'
    } catch (e) {
      this.logger.warn(`FCM send failed: ${(e as Error).message}`)
      return 'error'
    }
  }
}
