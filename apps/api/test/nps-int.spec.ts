import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('NPS closed-loop integration', () => {
  let token = ''
  let accountId = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    expect(token).toBeTruthy()

    // 取一个客户用于 NPS 记录
    const list = await request(BASE)
      .get('/api/v1/accounts?pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const items = list.body.data?.items ?? list.body.data ?? []
    accountId = items[0]?.id
    expect(accountId).toBeTruthy()
  })

  it('returns nps trend with monthly buckets', async () => {
    const res = await request(BASE)
      .get('/api/v1/nps/trend?months=6')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.months).toBe(6)
    expect(res.body.data.items).toHaveLength(6)
    const b = res.body.data.items[0]
    expect(b).toHaveProperty('month')
    expect(b).toHaveProperty('nps')
    expect(b).toHaveProperty('avg')
    expect(b).toHaveProperty('count')
    expect(b).toHaveProperty('promoters')
    expect(b).toHaveProperty('detractors')
  })

  it('records a low-score NPS and surfaces it in alerts', async () => {
    const create = await request(BASE)
      .post('/api/v1/nps')
      .set('Authorization', `Bearer ${token}`)
      .send({
        accountId,
        score: 4,
        comment: `集成测试低分-${Date.now()}`,
        contactName: '测试联系人',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    expect(create.body.code).toBe(0)
    expect(Number(create.body.data.score)).toBe(4)

    const alerts = await request(BASE)
      .get('/api/v1/nps/alerts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(alerts.body.code).toBe(0)
    expect(alerts.body.data.total).toBeGreaterThan(0)
    const hit = alerts.body.data.items.find(
      (x: { accountId: string }) => x.accountId === accountId,
    )
    expect(hit).toBeTruthy()
    expect(Number(hit.score)).toBeLessThanOrEqual(6)
  })

  it('returns account-level nps history', async () => {
    const res = await request(BASE)
      .get(`/api/v1/nps/account/${accountId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.accountId).toBe(accountId)
    expect(res.body.data.total).toBeGreaterThan(0)
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(res.body.data.items[0]).toHaveProperty('score')
  })

  it('creates follow-up activity for low NPS', async () => {
    const res = await request(BASE)
      .post('/api/v1/nps/followup')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId, note: '集成测试回访' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    expect(res.body.code).toBe(0)
    expect(res.body.data.ok).toBe(true)
    expect(res.body.data.activityId).toBeTruthy()
    expect(res.body.data.dueAt).toBeTruthy()
  })

  it('rejects invalid followup account', async () => {
    const res = await request(BASE)
      .post('/api/v1/nps/followup')
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId: 'no-such-account-id' })
    expect([400, 404]).toContain(res.status)
    expect(res.body.code).not.toBe(0)
  })
})
