import { describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const PASS = process.env.PASS || 'Demo@12345'

async function auth(email: string) {
  const res = await request(BASE).post('/api/v1/auth/login').send({ email, password: PASS })
  expect(res.status).toBe(200)
  return { Authorization: `Bearer ${res.body.data.accessToken}` }
}

const ok = (r: { status: number; body: unknown }) => {
  if (r.status !== 200 && r.status !== 201) throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
}

/** 多币种：外币单据按汇率折算本位币，报表按本位币汇总 */
describe('multi-currency', () => {
  it('converts foreign-currency documents to the base currency and totals reports in base', async () => {
    const admin = await auth('admin@demo.com')
    const overview = (await request(BASE).get('/api/v1/currency').set(admin).expect(200)).body.data
    expect(overview.base).toMatch(/^[A-Z]{3}$/)
    const cur = overview.base === 'CHF' ? 'SEK' : 'CHF'

    // 没有汇率的外币：拒绝
    const accountId = (
      await request(BASE)
        .post('/api/v1/accounts')
        .set(admin)
        .send({ name: `fx-客户-${Date.now()}` })
        .expect(ok)
    ).body.data.id as string
    const noRate = await request(BASE)
      .post('/api/v1/opportunities')
      .set(admin)
      .set('X-UI-Locale', 'en-US')
      .send({ name: 'fx-no-rate', accountId, amount: '100', currency: cur, expectedCloseDate: '2026-12-31' })
    expect(noRate.status).toBe(422)
    expect(noRate.body.message).toContain(cur)

    const rate = await request(BASE)
      .post('/api/v1/currency/rates')
      .set(admin)
      .send({ currency: cur, rate: '8', effectiveDate: '2000-01-01' })
      .expect(ok)
    const created: { opp?: string; contract?: string } = {}
    try {
      const before = (await request(BASE).get('/api/v1/reports/dashboard').set(admin).expect(200)).body.data
      const opp = await request(BASE)
        .post('/api/v1/opportunities')
        .set(admin)
        .send({ name: `fx-${cur}-商机`, accountId, amount: '1000', currency: cur, expectedCloseDate: '2026-12-31' })
        .expect(ok)
      created.opp = opp.body.data.id
      const detail = (await request(BASE).get(`/api/v1/opportunities/${created.opp}`).set(admin).expect(200)).body.data
      expect(detail.currency).toBe(cur)
      expect(Number(detail.amount)).toBe(1000)
      expect(Number(detail.amountBase)).toBe(8000)

      // 报表：开放商机金额按本位币增加 8000
      const after = (await request(BASE).get('/api/v1/reports/dashboard').set(admin).expect(200)).body.data
      expect(Number(after.openAmount) - Number(before.openAmount)).toBeCloseTo(8000, 2)

      // 合同：不填币种时沿用关联商机的币种
      const contract = await request(BASE)
        .post('/api/v1/contracts')
        .set(admin)
        .send({ title: `fx-${cur}-合同`, accountId, opportunityId: created.opp })
        .expect(ok)
      created.contract = contract.body.data.id
      expect(contract.body.data.currency).toBe(cur)

      // 有汇率时不能再改本位币
      const lock = await request(BASE).put('/api/v1/currency/base').set(admin).send({ currency: 'JPY' })
      expect(lock.status).toBe(409)

      // 销售没有维护汇率的权限，但能读取可选币种
      const rep = await auth('rep@demo.com')
      expect((await request(BASE).get('/api/v1/currency').set(rep)).status).toBe(200)
      expect((await request(BASE).post('/api/v1/currency/rates').set(rep).send({ currency: 'USD', rate: '7', effectiveDate: '2026-01-01' })).status).toBe(403)
    } finally {
      if (created.contract) await request(BASE).delete(`/api/v1/contracts/${created.contract}`).set(admin)
      if (created.opp) await request(BASE).delete(`/api/v1/opportunities/${created.opp}`).set(admin)
      await request(BASE).delete(`/api/v1/currency/rates/${rate.body.data.id}`).set(admin)
      await request(BASE).delete(`/api/v1/accounts/${accountId}`).set(admin)
    }
  })
})
