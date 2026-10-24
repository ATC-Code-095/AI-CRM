import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('decision chain integration', () => {
  let token = ''
  let accountId = ''
  let contactId = ''
  let contact2Id = ''

  beforeAll(async () => {
    const login = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = login.body.data.accessToken

    const acc = await request(BASE)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `决策链测试-${Date.now()}` })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    accountId = acc.body.data.id

    const c1 = await request(BASE)
      .post(`/api/v1/accounts/${accountId}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '决策人甲', decisionRole: 'ECONOMIC', isPrimary: true, title: 'CFO' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    contactId = c1.body.data.id

    const c2 = await request(BASE)
      .post(`/api/v1/accounts/${accountId}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '教练乙', decisionRole: 'CHAMPION', title: '项目经理' })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    contact2Id = c2.body.data.id
  })

  it('returns decision chain with roles and influence', async () => {
    const res = await request(BASE)
      .get(`/api/v1/accounts/${accountId}/decision-chain`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    const d = res.body.data
    expect(d.accountId).toBe(accountId)
    expect(d.total).toBe(2)
    expect(d.hasEconomic).toBe(true)
    expect(d.hasChampion).toBe(true)
    expect(d.roleCount.ECONOMIC).toBe(1)
    expect(Array.isArray(d.items)).toBe(true)
    expect(d.items[0]).toHaveProperty('influence')
    expect(d.items[0]).toHaveProperty('decisionRole')
  })

  it('updates influence and role via contact patch', async () => {
    const res = await request(BASE)
      .patch(`/api/v1/contacts/${contact2Id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ influence: 80, decisionRole: 'TECH' })
      .expect(200)
    expect(res.body.code).toBe(0)
    expect(Number(res.body.data.influence)).toBe(80)
    expect(res.body.data.decisionRole).toBe('TECH')

    const chain = await request(BASE)
      .get(`/api/v1/accounts/${accountId}/decision-chain`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const row = chain.body.data.items.find((x: { id: string }) => x.id === contact2Id)
    expect(Number(row.influence)).toBe(80)
    expect(row.decisionRole).toBe('TECH')
  })

  it('rejects influence outside 0-100', async () => {
    const res = await request(BASE)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ influence: 150 })
    expect([400, 422]).toContain(res.status)
    expect(res.body.code).not.toBe(0)
  })

  it('switches primary contact', async () => {
    const res = await request(BASE)
      .patch(`/api/v1/contacts/${contact2Id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPrimary: true })
      .expect(200)
    expect(res.body.data.isPrimary).toBe(true)

    const chain = await request(BASE)
      .get(`/api/v1/accounts/${accountId}/decision-chain`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const primaries = chain.body.data.items.filter((x: { isPrimary: boolean }) => x.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0].id).toBe(contact2Id)
  })

  it('returns 404 for missing account decision chain', async () => {
    const res = await request(BASE)
      .get('/api/v1/accounts/no-such-id/decision-chain')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })
})
