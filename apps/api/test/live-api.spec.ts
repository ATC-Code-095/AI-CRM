import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('api integration (live server)', () => {
  let token = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    expect(token).toBeTruthy()
  })

  it('health', async () => {
    const res = await request(BASE).get('/api/v1/health').expect(200)
    expect(res.body.code).toBe(0)
    expect(res.body.data.db).toBe('up')
  })

  it('unauthorized without token', async () => {
    const res = await request(BASE).get('/api/v1/leads').expect(401)
    expect(res.body.code).toBe(40100)
  })

  it('me returns permissions', async () => {
    const res = await request(BASE)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.data.email).toBe(EMAIL)
    expect(Array.isArray(res.body.data.permissions)).toBe(true)
  })

  it('create lead then list', async () => {
    const name = `集成测试-${Date.now()}`
    const created = await request(BASE)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, source: 'PHONE' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    expect(created.body.data.name).toBe(name)

    const list = await request(BASE)
      .get(`/api/v1/leads?q=${encodeURIComponent(name)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(list.body.data.total).toBeGreaterThan(0)
  })

  afterAll(() => {
    // no-op
  })
})

describe('import integration', () => {
  let token = ''
  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('import leads csv', async () => {
    const res = await request(BASE)
      .post('/api/v1/import/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv: `name,phone\n导入E2E-${Date.now()},13900000001\n导入E2E2-${Date.now()},13900000002` })
    expect([200, 201]).toContain(res.status)
    expect(res.body.data.ok).toBeGreaterThanOrEqual(1)
  })
})
