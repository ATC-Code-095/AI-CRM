import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('templates & knowledge integration', () => {
  let token = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('contract template content keeps version history and approval log', async () => {
    const created = await request(BASE)
      .post('/api/v1/contract-templates')
      .set(auth())
      .send({ name: `int-合同模板-${Date.now()}` })
    expect([200, 201]).toContain(created.status)
    const id = created.body.data.id
    expect(created.body.data.defaultDuration).toBe('12')

    for (const html of ['<p>v1</p>', '<p>v2</p>', '<p>v3</p>']) {
      await request(BASE)
        .put(`/api/v1/contract-templates/${id}/content`)
        .set(auth())
        .send({ content: html })
        .expect(200)
    }
    const c = await request(BASE).get(`/api/v1/contract-templates/${id}/content`).set(auth()).expect(200)
    expect(c.body.data.content).toBe('<p>v3</p>')
    expect(c.body.data.history.map((h: { content: string }) => h.content)).toEqual(['<p>v2</p>', '<p>v1</p>'])

    await request(BASE)
      .post(`/api/v1/contract-templates/${id}/approve`)
      .set(auth())
      .send({ action: 'SUBMIT' })
      .expect(201)
    const approved = await request(BASE)
      .post(`/api/v1/contract-templates/${id}/approve`)
      .set(auth())
      .send({ action: 'APPROVE', note: 'ok' })
      .expect(201)
    expect(approved.body.data.approveStatus).toBe('APPROVED')
    expect(approved.body.data.published).toBe(true)
    expect(approved.body.data.approveLog.map((l: { action: string }) => l.action)).toEqual(['APPROVE', 'SUBMIT'])

    // 列表不再携带大段正文
    const list = await request(BASE).get('/api/v1/contract-templates').set(auth()).expect(200)
    const row = list.body.data.items.find((x: { id: string }) => x.id === id)
    expect(row).toBeTruthy()
    expect(row.content).toBeUndefined()

    await request(BASE).delete(`/api/v1/contract-templates/${id}`).set(auth()).expect(200)
    await request(BASE).get(`/api/v1/contract-templates/${id}/content`).set(auth()).expect(404)
  })

  it('contract stores its template id and can be created from a template', async () => {
    const tpl = await request(BASE)
      .post('/api/v1/contract-templates')
      .set(auth())
      .send({ name: `int-建合同模板-${Date.now()}` })
    const acc = await request(BASE).get('/api/v1/accounts?pageSize=1').set(auth()).expect(200)
    const c = await request(BASE)
      .post('/api/v1/contracts')
      .set(auth())
      .send({ title: 'int-模板合同', accountId: acc.body.data.items[0].id, templateId: tpl.body.data.id })
    expect([200, 201]).toContain(c.status)
    expect(c.body.data.templateId).toBe(tpl.body.data.id)

    await request(BASE)
      .patch(`/api/v1/contracts/${c.body.data.id}`)
      .set(auth())
      .send({ templateId: 'missing-template' })
      .expect(404)
    const detail = await request(BASE).get(`/api/v1/contracts/${c.body.data.id}`).set(auth()).expect(200)
    expect(detail.body.data.templateId).toBe(tpl.body.data.id)
    expect(String(detail.body.data.remark ?? '')).not.toContain('template:')
  })

  it('quote templates keep their lines', async () => {
    const prod = await request(BASE).get('/api/v1/products?pageSize=1').set(auth()).expect(200)
    const productId = prod.body.data.items[0].id
    const t = await request(BASE)
      .post('/api/v1/quote-templates')
      .set(auth())
      .send({ name: `int-报价模板-${Date.now()}`, lines: [{ productId, qty: '2', discountRate: '0.1' }] })
    expect([200, 201]).toContain(t.status)
    const list = await request(BASE).get('/api/v1/quote-templates').set(auth()).expect(200)
    const row = list.body.data.items.find((x: { id: string }) => x.id === t.body.data.id)
    expect(row.lines).toEqual([{ productId, qty: '2', discountRate: '0.1' }])
  })

  it('knowledge articles support search, update and delete', async () => {
    const tag = `int${Date.now()}`
    const a = await request(BASE)
      .post('/api/v1/knowledge')
      .set(auth())
      .send({ title: `${tag} 异议处理`, category: 'objection', content: '价格太贵怎么办', tags: tag })
    expect([200, 201]).toContain(a.status)
    const found = await request(BASE).get(`/api/v1/knowledge?q=${tag}`).set(auth()).expect(200)
    expect(found.body.data.items[0].id).toBe(a.body.data.id)
    expect(found.body.data.items[0]._score).toBeGreaterThan(0)

    await request(BASE)
      .put(`/api/v1/knowledge/${a.body.data.id}`)
      .set(auth())
      .send({ content: '强调 ROI' })
      .expect(200)
    const byCat = await request(BASE).get('/api/v1/knowledge?category=objection').set(auth()).expect(200)
    const row = byCat.body.data.items.find((x: { id: string }) => x.id === a.body.data.id)
    expect(row.content).toBe('强调 ROI')

    await request(BASE).delete(`/api/v1/knowledge/${a.body.data.id}`).set(auth()).expect(200)
    const gone = await request(BASE).get(`/api/v1/knowledge?q=${tag}`).set(auth()).expect(200)
    expect(gone.body.data.items).toHaveLength(0)
  })

  it('email templates render variables; activity templates include builtins', async () => {
    const t = await request(BASE)
      .post('/api/v1/email-templates')
      .set(auth())
      .send({ name: `int-邮件-${Date.now()}`, subject: '致{客户名称}', body: '金额 {金额}' })
    expect([200, 201]).toContain(t.status)
    const pv = await request(BASE)
      .post(`/api/v1/email-templates/${t.body.data.id}/preview`)
      .set(auth())
      .send({ vars: { 客户名称: '甲公司', 金额: '100' } })
      .expect(201)
    expect(pv.body.data).toEqual({ subject: '致甲公司', body: '金额 100' })
    await request(BASE).delete(`/api/v1/email-templates/${t.body.data.id}`).set(auth()).expect(200)
    await request(BASE)
      .post(`/api/v1/email-templates/${t.body.data.id}/preview`)
      .set(auth())
      .send({})
      .expect(404)

    const name = `int-话术-${Date.now()}`
    await request(BASE).post('/api/v1/templates').set(auth()).send({ name, content: '您好' }).expect(201)
    const acts = await request(BASE).get('/api/v1/templates').set(auth()).expect(200)
    const items = acts.body.data.items as { name: string; isBuiltin: boolean }[]
    expect(items.some((x) => x.isBuiltin)).toBe(true)
    expect(items.find((x) => x.name === name)?.isBuiltin).toBe(false)
  })
})
