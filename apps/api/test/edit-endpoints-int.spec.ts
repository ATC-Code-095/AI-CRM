import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('edit endpoints integration', () => {
  let token = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('patch campaign', async () => {
    const created = await request(BASE)
      .post('/api/v1/campaigns')
      .set(auth())
      .send({ name: `int-campaign-${Date.now()}` })
    expect([200, 201]).toContain(created.status)
    const id = created.body.data.id as string

    const updated = await request(BASE)
      .patch(`/api/v1/campaigns/${id}`)
      .set(auth())
      .send({ name: 'int-campaign-renamed', description: 'edited' })
      .expect(200)
    expect(updated.body.data.name).toBe('int-campaign-renamed')
    expect(updated.body.data.description).toBe('edited')
  })

  it('patch webhook', async () => {
    const created = await request(BASE)
      .post('/api/v1/webhooks')
      .set(auth())
      .send({ url: 'https://example.com/hook', events: ['*'] })
    expect([200, 201]).toContain(created.status)
    const id = created.body.data.id as string

    const updated = await request(BASE)
      .patch(`/api/v1/webhooks/${id}`)
      .set(auth())
      .send({ url: 'https://example.com/hook2', events: ['lead.created'] })
      .expect(200)
    expect(updated.body.data.url).toBe('https://example.com/hook2')
    expect(updated.body.data.events).toEqual(['lead.created'])

    await request(BASE).delete(`/api/v1/webhooks/${id}`).set(auth())
  })

  it('patch ticket recalculates SLA on severity change', async () => {
    const acc = await request(BASE).get('/api/v1/accounts?pageSize=1').set(auth()).expect(200)
    const accountId = acc.body.data.items[0].id as string
    const created = await request(BASE)
      .post('/api/v1/tickets')
      .set(auth())
      .send({ title: 'int-ticket', accountId, type: 'ISSUE', severity: 'LOW' })
    expect([200, 201]).toContain(created.status)
    const t = created.body.data

    const updated = await request(BASE)
      .patch(`/api/v1/tickets/${t.id}`)
      .set(auth())
      .send({ title: 'int-ticket-edited', severity: 'URGENT' })
      .expect(200)
    expect(updated.body.data.title).toBe('int-ticket-edited')
    expect(new Date(updated.body.data.dueAt).getTime()).toBeLessThan(new Date(t.dueAt).getTime())

    // 编辑不允许变更客户
    await request(BASE)
      .patch(`/api/v1/tickets/${t.id}`)
      .set(auth())
      .send({ accountId: 'other' })
      .expect(400)
  })

  it('renewal playbook round-trip', async () => {
    const acc = await request(BASE).get('/api/v1/accounts?pageSize=1').set(auth()).expect(200)
    const accountId = acc.body.data.items[0].id as string

    await request(BASE)
      .put('/api/v1/settings/renewal-playbook')
      .set(auth())
      .send({ accountId, steps: { usage: true, health: false } })
      .expect(200)
    const got = await request(BASE)
      .get(`/api/v1/settings/renewal-playbook?accountId=${accountId}`)
      .set(auth())
      .expect(200)
    expect(got.body.data.steps).toEqual({ usage: true, health: false })

    await request(BASE)
      .put('/api/v1/settings/renewal-playbook')
      .set(auth())
      .send({ accountId: 'missing-account', steps: {} })
      .expect(404)
  })
})

describe('settings whitelist', () => {
  let token = ''
  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('only exposes and accepts known config keys', async () => {
    const auth = { Authorization: `Bearer ${token}` }
    await request(BASE)
      .patch('/api/v1/settings')
      .set(auth)
      .send({ key: 'finance.invoices', value: [] })
      .expect(404)
    await request(BASE)
      .patch('/api/v1/settings')
      .set(auth)
      .send({ key: 'esign.provider', value: {} })
      .expect(404)
    await request(BASE)
      .patch('/api/v1/settings')
      .set(auth)
      .send({ key: 'discount_approval_threshold', value: '0.2' })
      .expect(200)
    const list = await request(BASE).get('/api/v1/settings').set(auth).expect(200)
    const keys = (list.body.data as { key: string }[]).map((x) => x.key)
    expect(keys).toContain('discount_approval_threshold')
    expect(keys).toContain('feature.ai')
    expect(keys).not.toContain('esign.provider')
    expect(keys.some((k) => k.startsWith('health.trend.') || k === 'nps.scores')).toBe(false)
  })
})
