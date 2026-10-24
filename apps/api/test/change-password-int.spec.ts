import { describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const REP_EMAIL = process.env.REP_EMAIL || 'rep@demo.com'
const REP_PASS = process.env.REP_PASS || 'Demo@12345'

const ok2xx = (r: { status: number; body: unknown }) => {
  if (r.status !== 200 && r.status !== 201) throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
}

async function login(email: string, password: string) {
  return request(BASE).post('/api/v1/auth/login').send({ email, password })
}

async function tokenOf(email: string, password: string) {
  const res = await login(email, password)
  expect(res.status).toBe(200)
  return res.body.data.accessToken as string
}

/** 非管理员角色（SALES_REP）也能修改自己的密码与偏好；只影响本人 */
describe('self-service password & preferences (sales rep)', () => {
  it('changes own password, old one stops working, then restores', async () => {
    const token = await tokenOf(REP_EMAIL, REP_PASS)
    const tmp = `Tmp@${Date.now()}`

    await request(BASE)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: REP_PASS, newPassword: tmp })
      .expect(ok2xx)

    try {
      expect((await login(REP_EMAIL, REP_PASS)).status).not.toBe(200)
      expect((await login(REP_EMAIL, tmp)).status).toBe(200)
    } finally {
      // 恢复种子密码，避免影响其他用例与演示
      const t2 = await tokenOf(REP_EMAIL, tmp)
      await request(BASE)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${t2}`)
        .send({ oldPassword: tmp, newPassword: REP_PASS })
        .expect(ok2xx)
    }
    expect((await login(REP_EMAIL, REP_PASS)).status).toBe(200)
  })

  it('rejects a wrong old password without changing anything', async () => {
    const token = await tokenOf(REP_EMAIL, REP_PASS)
    const r = await request(BASE)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'Wrong@123456', newPassword: 'Whatever@123456' })
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(r.status).not.toBe(403)
    expect((await login(REP_EMAIL, REP_PASS)).status).toBe(200)
  })

  it('requires login', async () => {
    const r = await request(BASE)
      .post('/api/v1/auth/change-password')
      .send({ oldPassword: REP_PASS, newPassword: 'Whatever@123456' })
    expect(r.status).toBe(401)
  })

  it('saves own preferences and validates the payload', async () => {
    const token = await tokenOf(REP_EMAIL, REP_PASS)
    const saved = await request(BASE)
      .post('/api/v1/auth/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ locale: 'zh-CN', timezone: 'Asia/Shanghai' })
      .expect(ok2xx)
    expect(saved.body.data.locale).toBe('zh-CN')

    const badLocale = await request(BASE)
      .post('/api/v1/auth/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ locale: 'xx-XX' })
    expect(badLocale.status).toBe(400)

    // 不能借偏好接口改其他字段（如角色、状态）
    const extra = await request(BASE)
      .post('/api/v1/auth/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ locale: 'zh-CN', status: 'DISABLED' })
    expect(extra.status).toBe(400)
  })
})
