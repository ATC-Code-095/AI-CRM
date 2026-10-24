import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('audit integration', () => {
  let token = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('login creates LOGIN audit', async () => {
    await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    const logs = await request(BASE)
      .get('/api/v1/audit-logs?pageSize=20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const actions = logs.body.data.items.map((x: { action: string }) => x.action)
    expect(actions).toContain('LOGIN')
  })

  it('account update writes UPDATE audit with before/after', async () => {
    // 自建客户：不依赖列表第一条（group-finance 用例会临时限定管理员可见主体，列表可能为空）
    const acc = await request(BASE)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `审计集成-${Date.now()}` })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
      })
    const id = acc.body.data.id
    await request(BASE)
      .patch(`/api/v1/accounts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage: 'AT_RISK' })
      .expect(200)
    const logs = await request(BASE)
      .get('/api/v1/audit-logs?pageSize=10&entity=ACCOUNT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const row = logs.body.data.items.find(
      (x: { action: string; entityId: string }) =>
        x.action === 'UPDATE' && x.entityId === id,
    )
    expect(row).toBeTruthy()
    expect(row.after?.stage).toBe('AT_RISK')
  })
})
