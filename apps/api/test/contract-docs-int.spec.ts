import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('contract & quote documents integration', () => {
  let token = ''
  let accountId = ''
  let productId = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })

  const newQuote = async (extra: Record<string, unknown> = {}) => {
    const q = await request(BASE)
      .post('/api/v1/quotes')
      .set(auth())
      .send({
        accountId,
        subject: `int-报价-${Date.now()}`,
        lines: [{ productId, qty: '1', discountRate: '0' }],
        ...extra,
      })
    expect([200, 201]).toContain(q.status)
    return q.body.data as { id: string; version: number; status: string }
  }

  /** 报价 → 审批通过 → 接受 → 转合同 */
  const newContract = async () => {
    const q = await newQuote()
    await request(BASE).post(`/api/v1/quotes/${q.id}/submit`).set(auth()).expect(201)
    await request(BASE).post(`/api/v1/quotes/${q.id}/accept`).set(auth()).expect(201)
    const ct = await request(BASE).post(`/api/v1/quotes/${q.id}/to-contract`).set(auth())
    expect([200, 201]).toContain(ct.status)
    return ct.body.data as { id: string; total: string; contractNo: string }
  }

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    const acc = await request(BASE).get('/api/v1/accounts?pageSize=1').set(auth()).expect(200)
    accountId = acc.body.data.items[0].id
    const prod = await request(BASE).get('/api/v1/products?pageSize=1').set(auth()).expect(200)
    productId = prod.body.data.items[0].id
  })

  it('concurrent invoices never exceed the contract total', async () => {
    const c = await newContract()
    const total = Number(c.total)
    expect(total).toBeGreaterThan(0)
    const part = (total * 0.6).toFixed(2)
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        request(BASE)
          .post('/api/v1/invoices')
          .set(auth())
          .send({ contractId: c.id, invoiceNo: `INT-${Date.now()}-${i}`, amount: part }),
      ),
    )
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    const list = await request(BASE).get(`/api/v1/invoices?contractId=${c.id}`).set(auth()).expect(200)
    expect(list.body.data.items).toHaveLength(1)
    const inv = list.body.data.items[0]
    expect(inv.contractNo).toBe(c.contractNo)
    expect(inv.amount).toBe(part)

    // 作废后不能再恢复为已开具；作废释放额度
    await request(BASE)
      .post(`/api/v1/invoices/${inv.id}/status`)
      .set(auth())
      .send({ status: 'VOID', remark: 'int' })
      .expect(201)
    await request(BASE)
      .post(`/api/v1/invoices/${inv.id}/status`)
      .set(auth())
      .send({ status: 'ISSUED' })
      .expect(422)
    await request(BASE)
      .post(`/api/v1/invoices/${inv.id}/status`)
      .set(auth())
      .send({ status: 'REVERSED' })
      .expect(409)
    await request(BASE)
      .post('/api/v1/invoices')
      .set(auth())
      .send({ contractId: c.id, invoiceNo: `INT-${Date.now()}-x`, amount: part })
      .expect(201)
  })

  it('change order adjusts contract total once and only from PENDING', async () => {
    const c = await newContract()
    const co = await request(BASE)
      .post('/api/v1/change-orders')
      .set(auth())
      .send({ contractId: c.id, title: 'int-增购', reason: 'r', amountDelta: '100' })
    expect([200, 201]).toContain(co.status)
    expect(co.body.data.status).toBe('PENDING')
    const results = await Promise.all(
      [1, 2].map(() =>
        request(BASE)
          .post(`/api/v1/change-orders/${co.body.data.id}/decide`)
          .set(auth())
          .send({ action: 'APPROVE' }),
      ),
    )
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(results.filter((r) => r.status === 409)).toHaveLength(1)
    const after = await request(BASE).get(`/api/v1/contracts/${c.id}`).set(auth()).expect(200)
    expect(Number(after.body.data.total)).toBeCloseTo(Number(c.total) + 100, 2)
    const list = await request(BASE).get(`/api/v1/change-orders?contractId=${c.id}`).set(auth()).expect(200)
    expect(list.body.data.items[0].decidedBy).toBeTruthy()
  })

  it('seals are stored and listed', async () => {
    const name = `int-印章-${Date.now()}`
    const s = await request(BASE).post('/api/v1/esign/seals').set(auth()).send({ name, party: 'A' })
    expect([200, 201]).toContain(s.status)
    const list = await request(BASE).get('/api/v1/esign/seals').set(auth()).expect(200)
    const row = list.body.data.items.find((x: { name: string }) => x.name === name)
    expect(row.party).toBe('A')
    expect(row.type).toBe('COMPANY')
  })

  it('projects link quotes by projectId', async () => {
    const pj = await request(BASE)
      .post('/api/v1/projects')
      .set(auth())
      .send({ name: `int-项目-${Date.now()}`, budget: '1000' })
    expect([200, 201]).toContain(pj.status)
    const pid = pj.body.data.id
    const q = await newQuote({ projectId: pid })
    const detail = await request(BASE).get(`/api/v1/projects/${pid}`).set(auth()).expect(200)
    expect(detail.body.data.quotes.map((x: { id: string }) => x.id)).toContain(q.id)
    expect(detail.body.data.summary.budget).toBe('1000.00')

    await request(BASE)
      .put(`/api/v1/projects/${pid}/milestones`)
      .set(auth())
      .send({ milestones: [{ text: '启动', done: true }, { text: '验收', done: false }] })
      .expect(200)
    const list = await request(BASE).get('/api/v1/projects').set(auth()).expect(200)
    const row = list.body.data.items.find((x: { id: string }) => x.id === pid)
    expect(row.milestones).toHaveLength(2)

    const bad = await request(BASE)
      .post('/api/v1/quotes')
      .set(auth())
      .send({ accountId, subject: 'int-bad', lines: [], projectId: 'missing-project' })
    expect(bad.status).toBe(404)

    await request(BASE).delete(`/api/v1/projects/${pid}`).set(auth()).expect(200)
    await request(BASE).get(`/api/v1/projects/${pid}`).set(auth()).expect(404)
  })

  it('share link requires an approved quote; public accept respects status', async () => {
    const draft = await newQuote()
    await request(BASE).post(`/api/v1/quotes/${draft.id}/share-link`).set(auth()).expect(422)
    await request(BASE).post(`/api/v1/quotes/${draft.id}/email`).set(auth()).send({ to: '' }).expect(422)

    await request(BASE).post(`/api/v1/quotes/${draft.id}/submit`).set(auth()).expect(201)
    const detail = await request(BASE).get(`/api/v1/quotes/${draft.id}`).set(auth()).expect(200)
    expect(detail.body.data.status).toBe('APPROVED')
    const link = await request(BASE).post(`/api/v1/quotes/${draft.id}/share-link`).set(auth()).expect(201)
    const shareToken = link.body.data.token as string
    expect(shareToken.length).toBeGreaterThan(20)

    const pub = await request(BASE).get(`/api/v1/public/quotes/${shareToken}`).expect(200)
    expect(pub.body.data.status).toBe('APPROVED')
    await request(BASE)
      .post(`/api/v1/public/quotes/${shareToken}/accept`)
      .send({ name: 'int 客户' })
      .expect(201)
    const again = await request(BASE)
      .post(`/api/v1/public/quotes/${shareToken}/accept`)
      .send({ name: 'int 客户' })
      .expect(201)
    expect(again.body.data.message).toBe('已确认过')
    await request(BASE).get('/api/v1/public/quotes/qs-not-a-real-token').expect(404)
  })

  it('editing quote lines records a version snapshot', async () => {
    const q = await newQuote()
    await request(BASE)
      .put(`/api/v1/quotes/${q.id}/lines`)
      .set(auth())
      .send({ lines: [{ productId, qty: '2', discountRate: '0' }], version: q.version })
      .expect(200)
    // 旧版本号再提交应冲突
    await request(BASE)
      .put(`/api/v1/quotes/${q.id}/lines`)
      .set(auth())
      .send({ lines: [{ productId, qty: '3', discountRate: '0' }], version: q.version })
      .expect(409)
    const hist = await request(BASE).get(`/api/v1/quotes/${q.id}/history`).set(auth()).expect(200)
    expect(hist.body.data.total).toBe(1)
    expect(hist.body.data.items[0].version).toBe(q.version)
    expect(Number(hist.body.data.items[0].lines[0].qty)).toBe(1)
  })
})
