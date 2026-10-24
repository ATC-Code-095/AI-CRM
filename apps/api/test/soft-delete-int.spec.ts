import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

/** 发布检查单：软删除数据不出现在默认列表，详情返回不存在 */
describe('soft delete hides records', () => {
  let token = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })
  const ok = (r: { status: number; body: unknown }) => {
    if (r.status !== 200 && r.status !== 201) throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
  }

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  async function listNames(path: string, q: string) {
    const res = await request(BASE).get(path).query({ q, pageSize: 50 }).set(auth()).expect(200)
    return (res.body.data.items as Array<{ name: string }>).map((i) => i.name)
  }

  it('lead: gone from list and detail after delete', async () => {
    const name = `软删线索-${Date.now()}`
    const created = await request(BASE).post('/api/v1/leads').set(auth()).send({ name, source: 'OTHER' }).expect(ok)
    const id = created.body.data.id as string
    expect(await listNames('/api/v1/leads', name)).toContain(name)

    await request(BASE).delete(`/api/v1/leads/${id}`).set(auth()).expect(ok)
    expect(await listNames('/api/v1/leads', name)).not.toContain(name)
    const detail = await request(BASE).get(`/api/v1/leads/${id}`).set(auth())
    expect(detail.status).toBe(404)
  })

  it('account and its contact: gone from lists after delete', async () => {
    const name = `软删客户-${Date.now()}`
    const acc = await request(BASE).post('/api/v1/accounts').set(auth()).send({ name }).expect(ok)
    const accountId = acc.body.data.id as string
    const contactName = `软删联系人-${Date.now()}`
    const ct = await request(BASE)
      .post(`/api/v1/accounts/${accountId}/contacts`)
      .set(auth())
      .send({ name: contactName })
      .expect(ok)
    const contactId = ct.body.data.id as string
    expect(await listNames('/api/v1/accounts', name)).toContain(name)
    expect(await listNames('/api/v1/contacts', contactName)).toContain(contactName)

    await request(BASE).delete(`/api/v1/contacts/${contactId}`).set(auth()).expect(ok)
    expect(await listNames('/api/v1/contacts', contactName)).not.toContain(contactName)

    await request(BASE).delete(`/api/v1/accounts/${accountId}`).set(auth()).expect(ok)
    expect(await listNames('/api/v1/accounts', name)).not.toContain(name)
    const detail = await request(BASE).get(`/api/v1/accounts/${accountId}`).set(auth())
    expect(detail.status).toBe(404)
  })
})
