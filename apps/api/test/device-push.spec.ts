import { constants, generateKeyPairSync, verify } from 'crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  apnsJwt,
  apnsPayload,
  DevicePushService,
  fcmAssertion,
  fcmPayload,
  hmsJwt,
  hmsPayload,
  loadHmsConfig,
  loadApnsConfig,
  loadFcmConfig,
} from '../src/modules/notify/device-push.service'

const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = (k: { export: (o: object) => string | Buffer }) => String(k.export({ type: 'pkcs8', format: 'pem' }))

const parts = (jwt: string) => jwt.split('.').map((p, i) => (i < 2 ? JSON.parse(Buffer.from(p, 'base64url').toString()) : p))

describe('device push', () => {
  it('builds an ES256 APNs provider token Apple can verify', () => {
    const jwt = apnsJwt({ keyId: 'KID123', teamId: 'TEAM45', key: ec.privateKey }, 1700000000)
    const [head, claims] = parts(jwt)
    expect(head).toEqual({ alg: 'ES256', kid: 'KID123' })
    expect(claims).toEqual({ iss: 'TEAM45', iat: 1700000000 })
    const [h, c, s] = jwt.split('.')
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true)
  })

  it('builds an RS256 Google service-account assertion for FCM', () => {
    const jwt = fcmAssertion({ clientEmail: 'svc@p.iam.gserviceaccount.com', key: rsa.privateKey }, 1700000000)
    const [head, claims] = parts(jwt)
    expect(head).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(claims).toMatchObject({
      iss: 'svc@p.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: 1700003600,
    })
    const [h, c, s] = jwt.split('.')
    expect(verify('sha256', Buffer.from(`${h}.${c}`), rsa.publicKey, Buffer.from(s, 'base64url'))).toBe(true)
  })

  it('reads credentials from env, accepting \\n-escaped PEM on one line', () => {
    expect(loadApnsConfig({})).toBeNull()
    const oneLine = pem(ec.privateKey).replace(/\n/g, '\\n')
    const apns = loadApnsConfig({ APNS_KEY: oneLine, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T', APNS_PRODUCTION: 'true' })
    expect(apns?.bundleId).toBe('com.itecent.crm')
    expect(apns?.host).toBe('https://api.push.apple.com')
    expect(loadApnsConfig({ APNS_KEY: oneLine, APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' })?.host).toBe('https://api.sandbox.push.apple.com')

    expect(loadFcmConfig({})).toBeNull()
    const sa = JSON.stringify({ project_id: 'demo-p', client_email: 'svc@x', private_key: pem(rsa.privateKey) })
    expect(loadFcmConfig({ FCM_SERVICE_ACCOUNT: sa })?.projectId).toBe('demo-p')
  })

  it('shapes APNs and FCM payloads with navigation data', () => {
    const msg = { title: 'T', body: 'B', data: { entityType: 'LEAD', entityId: 'l1' } }
    expect(apnsPayload(msg)).toEqual({ aps: { alert: { title: 'T', body: 'B' }, sound: 'default' }, entityType: 'LEAD', entityId: 'l1' })
    expect(fcmPayload('tok', msg).message).toMatchObject({ token: 'tok', notification: { title: 'T', body: 'B' }, data: msg.data })
  })

  it('sends to every device of the user and removes invalid tokens', async () => {
    const prisma = {
      deviceToken: {
        findMany: vi.fn().mockResolvedValue([
          { platform: 'ios', token: 'ios-ok' },
          { platform: 'ios', token: 'ios-dead' },
          { platform: 'android', token: 'and-ok' },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }
    const svc = new DevicePushService(prisma as never)
    // 已配置两种通道（用测试密钥），发送本身打桩
    vi.stubEnv('APNS_KEY', pem(ec.privateKey))
    vi.stubEnv('APNS_KEY_ID', 'K')
    vi.stubEnv('APNS_TEAM_ID', 'T')
    vi.stubEnv('FCM_SERVICE_ACCOUNT', JSON.stringify({ project_id: 'p', client_email: 'e', private_key: pem(rsa.privateKey) }))
    vi.spyOn(svc, 'sendApns').mockImplementation(async (_c, token) => (token === 'ios-dead' ? 'invalid-token' : 'ok'))
    vi.spyOn(svc, 'sendFcm').mockResolvedValue('ok')
    const r = await svc.sendToUser('t1', 'u1', { title: 'hi' })
    expect(r).toEqual({ sent: 2, removed: 1 })
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['ios-dead'] } } })
    expect(svc.status()).toMatchObject({ apns: { configured: true }, fcm: { configured: true, projectId: 'p' } })
    vi.unstubAllEnvs()
  })

  it('signs Huawei Push Kit JWTs with PS256 for the service account', () => {
    const jwt = hmsJwt({ keyId: 'K1', subAccount: 'sub-123', key: rsa.privateKey }, 1700000000)
    const [head, claims] = parts(jwt)
    expect(head).toEqual({ kid: 'K1', typ: 'JWT', alg: 'PS256' })
    expect(claims).toEqual({ aud: 'https://oauth-login.cloud.huawei.com/oauth2/v3/token', iss: 'sub-123', iat: 1700000000, exp: 1700003600 })
    const [h, c, s] = jwt.split('.')
    expect(
      verify('sha256', Buffer.from(`${h}.${c}`), { key: rsa.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, Buffer.from(s, 'base64url')),
    ).toBe(true)
    const sa = JSON.stringify({ project_id: 'p1', key_id: 'K1', sub_account: 'sub-123', private_key: pem(rsa.privateKey) })
    expect(loadHmsConfig({ HMS_SERVICE_ACCOUNT: sa })?.projectId).toBe('p1')
    expect(hmsPayload('tok', { title: 'T', data: { entityId: 'x' } })).toEqual({
      payload: { notification: { category: 'WORK', title: 'T', body: 'T', clickAction: { actionType: 0, data: { entityId: 'x' } } } },
      target: { token: ['tok'] },
    })
  })

  it('sends HarmonyOS pushes and treats code 80300007 as an invalid token', async () => {
    const svc = new DevicePushService({} as never)
    const cfg = { projectId: 'p1', keyId: 'K1', subAccount: 'sub', key: rsa.privateKey }
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: '80000000', msg: 'Success' }), { status: 200 }))
    expect(await svc.sendHms(cfg, 'tok', { title: 'hi' })).toBe('ok')
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://push-api.cloud.huawei.com/v3/p1/messages:send')
    expect((init.headers as Record<string, string>)['push-type']).toBe('0')
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer ey/)
    spy.mockResolvedValue(new Response(JSON.stringify({ code: '80300007', msg: 'All the tokens are invalid' }), { status: 400 }))
    expect(await svc.sendHms(cfg, 'dead', { title: 'hi' })).toBe('invalid-token')
    vi.restoreAllMocks()
  })

  it('does nothing (and never queries devices) when no channel is configured', async () => {
    const prisma = { deviceToken: { findMany: vi.fn() } }
    const svc = new DevicePushService(prisma as never)
    vi.stubEnv('APNS_KEY', '')
    vi.stubEnv('FCM_SERVICE_ACCOUNT', '')
    expect(await svc.sendToUser('t', 'u', { title: 'x' })).toEqual({ sent: 0, removed: 0 })
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
