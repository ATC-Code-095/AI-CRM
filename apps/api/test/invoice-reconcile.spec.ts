import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('invoice reconcile integration', () => {
  let token = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    expect(token).toBeTruthy()
  })

  it('returns three-way recon summary and rows', async () => {
    const res = await request(BASE)
      .get('/api/v1/invoices/reconcile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(res.body.code).toBe(0)
    const d = res.body.data
    expect(d.summary).toBeTruthy()
    expect(d.summary).toHaveProperty('contractTotal')
    expect(d.summary).toHaveProperty('invoicedAmount')
    expect(d.summary).toHaveProperty('receivedAmount')
    expect(d.summary).toHaveProperty('gap')
    expect(d.summary).toHaveProperty('issueCount')
    expect(Array.isArray(d.items)).toBe(true)
    if (d.items.length) {
      const row = d.items[0]
      expect(row).toHaveProperty('contractNo')
      expect(row).toHaveProperty('contractTotal')
      expect(row).toHaveProperty('invoicedAmount')
      expect(row).toHaveProperty('receivedAmount')
      expect(row).toHaveProperty('flags')
      expect(row).toHaveProperty('level')
      expect(['OK', 'WARN', 'RISK']).toContain(row.level)
    }
  })

  it('filters only issues when onlyIssues=1', async () => {
    const all = await request(BASE)
      .get('/api/v1/invoices/reconcile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const issues = await request(BASE)
      .get('/api/v1/invoices/reconcile?onlyIssues=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    expect(issues.body.code).toBe(0)
    for (const row of issues.body.data.items) {
      expect(row.flags.length).toBeGreaterThan(0)
    }
    expect(issues.body.data.items.length).toBeLessThanOrEqual(all.body.data.items.length)
    expect(issues.body.data.summary.issueCount).toBe(issues.body.data.items.length)
  })

  it('exports reconcile csv', async () => {
    const res = await request(BASE)
      .get('/api/v1/invoices/reconcile?export=csv')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const text = String(res.text)
    expect(text).toContain('contractNo')
    expect(text).toContain('invoicedAmount')
    expect(text).toContain('receivedAmount')
    expect(text).toContain('flags')
  })

  it('creates invoice then recon reflects it', async () => {
    // 找一个有合同额的合同
    const contracts = await request(BASE)
      .get('/api/v1/contracts?pageSize=20')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const items = contracts.body.data?.items ?? []
    const c = items.find((x: { id: string; total: string }) => Number(x.total) > 1000)
    expect(c).toBeTruthy()

    const before = await request(BASE)
      .get('/api/v1/invoices/reconcile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const beforeRow = before.body.data.items.find(
      (r: { contractId: string }) => r.contractId === c.id,
    )
    const beforeInvoiced = Number(beforeRow?.invoicedAmount ?? 0)

    const inv = await request(BASE)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        contractId: c.id,
        invoiceNo: `INV-RECON-${Date.now()}`,
        amount: '100.00',
        type: 'VAT_SPECIAL',
        remark: '对账集成测试',
      })
      .expect((r) => {
        if (r.status !== 200 && r.status !== 201) {
          throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
        }
      })
    expect(inv.body.code).toBe(0)

    const after = await request(BASE)
      .get('/api/v1/invoices/reconcile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const afterRow = after.body.data.items.find(
      (r: { contractId: string }) => r.contractId === c.id,
    )
    expect(afterRow).toBeTruthy()
    expect(Number(afterRow.invoicedAmount)).toBeCloseTo(beforeInvoiced + 100, 2)
  })
})
