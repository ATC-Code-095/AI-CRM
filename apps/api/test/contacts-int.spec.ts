import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('contacts integration', () => {
  let token = ''
  let accountId = ''
  let contactId = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    // 自建隔离客户，避免与并行用例（如 stage-gate）争抢最新客户导致门禁误判
    const acc = await request(BASE)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `联系人集成-${Date.now()}` })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    accountId = acc.body.data.id
    expect(accountId).toBeTruthy()
  })

  it('create, update, delete contact', async () => {
    const created = await request(BASE)
      .post(`/api/v1/accounts/${accountId}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '集成联系人', mobile: '13800000001', isPrimary: false })
    expect([200, 201]).toContain(created.status)
    contactId = created.body.data.id

    const updated = await request(BASE)
      .patch(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '经理' })
      .expect(200)
    expect(updated.body.data.title).toBe('经理')

    const del = await request(BASE)
      .delete(`/api/v1/contacts/${contactId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(del.body.code).toBe(0)
  })
})
