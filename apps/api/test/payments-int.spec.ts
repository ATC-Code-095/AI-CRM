import { describe, expect, it, beforeAll } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('payments integration', () => {
  let token = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('list payments shape', async () => {
    const res = await request(BASE)
      .get('/api/v1/payments?pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(typeof res.body.data.total).toBe('number')
  })

  it('rate limit headers on login', async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
    expect(res.headers['x-ratelimit-limit']).toBeTruthy()
    expect(res.headers['x-ratelimit-remaining']).toBeTruthy()
  })
})
