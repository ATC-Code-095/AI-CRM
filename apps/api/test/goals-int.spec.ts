import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('goals integration', () => {
  let token = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('create and list goal', async () => {
    const periodKey = new Date().toISOString().slice(0, 7)
    const created = await request(BASE)
      .post('/api/v1/goals')
      .set('Authorization', `Bearer ${token}`)
      .send({ metric: 'WON_AMOUNT', periodKey, targetAmount: '88888' })
    expect([200, 201]).toContain(created.status)
    expect(created.body.data.metric).toBe('WON_AMOUNT')

    const list = await request(BASE)
      .get(`/api/v1/goals?periodKey=${periodKey}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.data.length).toBeGreaterThan(0)
  })
})
