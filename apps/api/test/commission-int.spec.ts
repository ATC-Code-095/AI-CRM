import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('commission center integration', () => {
  let token = ''
  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    expect(token).toBeTruthy()
  })

  it('reads commission rules with default tiers', async () => {
    const res = await request(BASE)
      .get('/api/v1/reports/commission/rules')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.tiers)).toBe(true)
    expect(res.body.data.tiers.length).toBeGreaterThan(0)
    expect(res.body.data.mode).toMatch(/TIERED|FLAT/)
  })

  it('saves tiered commission rules and reads back', async () => {
    const tiers = [
      { min: 0, max: 50000, rate: 0.03 },
      { min: 50000, max: 200000, rate: 0.05 },
      { min: 200000, max: null, rate: 0.08 },
    ]
    const save = await request(BASE)
      .put('/api/v1/reports/commission/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiers })
      .expect(200)
    expect(save.body.code).toBe(0)
    expect(save.body.data.mode).toBe('TIERED')
    expect(save.body.data.tiers).toHaveLength(3)

    const read = await request(BASE)
      .get('/api/v1/reports/commission/rules')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(read.body.data.tiers).toHaveLength(3)
    expect(Number(read.body.data.tiers[0].rate)).toBeCloseTo(0.03, 5)
    expect(Number(read.body.data.tiers[2].rate)).toBeCloseTo(0.08, 5)
  })

  it('returns commission report with rows and lines', async () => {
    const now = new Date()
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const res = await request(BASE)
      .get(`/api/v1/reports/commission?periodKey=${periodKey}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.periodKey).toBe(periodKey)
    expect(res.body.data.mode).toBe('TIERED')
    expect(Array.isArray(res.body.data.rows)).toBe(true)
    expect(res.body.data.rows.length).toBeGreaterThan(0)
    const row = res.body.data.rows[0]
    expect(row).toHaveProperty('commission')
    expect(row).toHaveProperty('receivedAmount')
    expect(row).toHaveProperty('status')
    expect(Array.isArray(row.lines)).toBe(true)
  })

  it('exports commission csv', async () => {
    const now = new Date()
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const res = await request(BASE)
      .get(`/api/v1/reports/commission?periodKey=${periodKey}&export=csv`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(String(res.text)).toContain('name')
    expect(String(res.text)).toContain('commission')
  })

  it('updates payout status', async () => {
    const now = new Date()
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    await request(BASE)
      .get(`/api/v1/reports/commission?periodKey=${periodKey}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const me = await request(BASE)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const userId = me.body.data.id
    const res = await request(BASE)
      .post('/api/v1/reports/commission/payout')
      .set('Authorization', `Bearer ${token}`)
      .send({ periodKey, userId, status: 'CONFIRMED', note: '集成测试确认' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    expect(res.body.code).toBe(0)
    expect(res.body.data.status).toBe('CONFIRMED')
    expect(res.body.data.userId).toBe(userId)

    const after = await request(BASE)
      .get(`/api/v1/reports/commission?periodKey=${periodKey}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const row = after.body.data.rows.find((r: { userId: string }) => r.userId === userId)
    expect(row.status).toBe('CONFIRMED')
  })

  it('rejects invalid payout status', async () => {
    const me = await request(BASE)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const res = await request(BASE)
      .post('/api/v1/reports/commission/payout')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: me.body.data.id, status: 'INVALID' })
    expect([400, 422]).toContain(res.status)
    expect(res.body.code).not.toBe(0)
  })
})
