import { describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const PASS = process.env.PASS || 'Demo@12345'

async function auth(email: string) {
  const res = await request(BASE).post('/api/v1/auth/login').send({ email, password: PASS })
  expect(res.status).toBe(200)
  return { Authorization: `Bearer ${res.body.data.accessToken}` }
}

describe('AI assistant', () => {
  it('stores provider settings without returning the key, isolates tenants and falls back to the mock', async () => {
    const admin = await auth('admin@demo.com')
    const before = (await request(BASE).get('/api/v1/ai/config').set(admin).expect(200)).body.data
    expect(before.apiKey).toBeUndefined()

    const opps = (await request(BASE).get('/api/v1/opportunities?pageSize=1').set(admin).expect(200)).body.data.items
    let oppId: string | undefined = opps[0]?.id
    let created = false
    if (!oppId) {
      const accountId = (await request(BASE).post('/api/v1/accounts').set(admin).send({ name: `ai-客户-${Date.now()}` })).body.data.id
      oppId = (await request(BASE).post('/api/v1/opportunities').set(admin).send({ name: 'ai-opp', accountId, amount: '100', expectedCloseDate: '2026-12-31' })).body.data.id
      created = true
    }

    // 另一个租户的管理员拿不到这条商机
    const acme = await auth('admin@acme.com')
    expect((await request(BASE).post('/api/v1/ai/summarize').set(acme).send({ entityType: 'OPPORTUNITY', entityId: oppId })).status).toBe(404)

    if (before.provider === 'mock') {
      try {
        const saved = await request(BASE)
          .put('/api/v1/ai/config')
          .set(admin)
          .send({ provider: 'openai', baseUrl: 'https://127.0.0.1:9/v1', model: 'int-model', apiKey: 'sk-int-secret' })
          .expect(200)
        expect(saved.body.data).toMatchObject({ provider: 'openai', model: 'int-model', hasKey: true })
        expect(JSON.stringify(saved.body)).not.toContain('sk-int-secret')

        // 外部接口不可达：退回内置模拟，并标明来源
        const s = await request(BASE).post('/api/v1/ai/summarize').set(admin).send({ entityType: 'OPPORTUNITY', entityId: oppId }).expect(201)
        expect(s.body.data.source).toBe('mock')
        expect(s.body.data.content).toBeTruthy()
        const test = await request(BASE).post('/api/v1/ai/config/test').set(admin).expect(201)
        expect(test.body.data.ok).toBe(false)

        expect((await request(BASE).put('/api/v1/ai/config').set(admin).send({ provider: 'openai', baseUrl: 'http://insecure.example/v1' })).status).toBe(400)
        const rep = await auth('rep@demo.com')
        expect((await request(BASE).put('/api/v1/ai/config').set(rep).send({ provider: 'mock' })).status).toBe(403)
      } finally {
        await request(BASE).put('/api/v1/ai/config').set(admin).send({ provider: 'mock' })
      }
    }
    const risk = await request(BASE).post('/api/v1/ai/risk').set(admin).send({ opportunityId: oppId }).expect(201)
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(risk.body.data.level)
    if (created) await request(BASE).delete(`/api/v1/opportunities/${oppId}`).set(admin)
  })
})
