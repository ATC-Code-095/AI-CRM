import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('group finance integration', () => {
  let token = ''
  let otherToken = ''
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` })
  const year = String(new Date().getFullYear())
  let entA = ''
  let entB = ''

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    const other = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@acme.com', password: PASS })
    otherToken = other.body?.data?.accessToken ?? ''

    const stamp = Date.now()
    const a = await request(BASE)
      .post('/api/v1/group/entities')
      .set(auth())
      .send({ name: `int-主体A-${stamp}`, type: 'SUBSIDIARY' })
    const b = await request(BASE)
      .post('/api/v1/group/entities')
      .set(auth())
      .send({ name: `int-主体B-${stamp}`, type: 'SUBSIDIARY' })
    expect([200, 201]).toContain(a.status)
    entA = a.body.data.id
    entB = b.body.data.id
  })

  const budgetOf = async (entityId: string) => {
    const r = await request(BASE).get('/api/v1/group/budgets').set(auth()).expect(200)
    return (r.body.data.items as { entityId: string; year: string; budgetAmount: string; expenseAmount: string }[]).find(
      (b) => b.entityId === entityId && b.year === year,
    )
  }

  it('re-saving a budget keeps the accumulated expense', async () => {
    await request(BASE)
      .post('/api/v1/group/budgets')
      .set(auth())
      .send({ entityId: entA, year, budgetAmount: '100000', expenseAmount: '0' })
    const claim = await request(BASE)
      .post('/api/v1/group/expense-claims')
      .set(auth())
      .send({ entityId: entA, category: '差旅', amount: '1200', title: 'int-报销' })
    await request(BASE)
      .post(`/api/v1/group/expense-claims/${claim.body.data.id}/approve`)
      .set(auth())
      .send({ action: 'APPROVED' })
      .expect(201)
    expect((await budgetOf(entA))?.expenseAmount).toBe('1200.00')

    // 前端编辑预算会带上表单里的 expenseAmount，不应清零已累计费用
    await request(BASE)
      .post('/api/v1/group/budgets')
      .set(auth())
      .send({ entityId: entA, year, budgetAmount: '150000', expenseAmount: '0' })
    const b = await budgetOf(entA)
    expect(b?.budgetAmount).toBe('150000.00')
    expect(b?.expenseAmount).toBe('1200.00')
  })

  it('claim approval posts to budget exactly once', async () => {
    const before = Number((await budgetOf(entA))?.expenseAmount ?? 0)
    const claim = await request(BASE)
      .post('/api/v1/group/expense-claims')
      .set(auth())
      .send({ entityId: entA, category: '市场', amount: '800', title: 'int-重复审批', status: 'APPROVED' })
    // 新建忽略客户端传入的状态
    expect(claim.body.data.status).toBe('SUBMITTED')
    const id = claim.body.data.id
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        request(BASE)
          .post(`/api/v1/group/expense-claims/${id}/approve`)
          .set(auth())
          .send({ action: 'APPROVED' }),
      ),
    )
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(results.filter((r) => r.status === 409)).toHaveLength(2)
    expect(Number((await budgetOf(entA))?.expenseAmount)).toBe(before + 800)
  })

  it('large claim posts to budget only after level-2 approval', async () => {
    const before = Number((await budgetOf(entA))?.expenseAmount ?? 0)
    const claim = await request(BASE)
      .post('/api/v1/group/expense-claims')
      .set(auth())
      .send({ entityId: entA, category: '研发', amount: '60000', title: 'int-大额报销' })
    const id = claim.body.data.id
    await request(BASE)
      .post(`/api/v1/group/expense-claims/${id}/approve`)
      .set(auth())
      .send({ action: 'APPROVED' })
      .expect(201)
    expect(Number((await budgetOf(entA))?.expenseAmount)).toBe(before)

    await request(BASE)
      .post(`/api/v1/group/expense-claims/${id}/approve-level2`)
      .set(auth())
      .send({ action: 'APPROVED' })
      .expect(201)
    expect(Number((await budgetOf(entA))?.expenseAmount)).toBe(before + 60000)

    await request(BASE)
      .post(`/api/v1/group/expense-claims/${id}/approve-level2`)
      .set(auth())
      .send({ action: 'APPROVED' })
      .expect(409)
    const list = await request(BASE).get('/api/v1/group/expense-claims').set(auth()).expect(200)
    const row = list.body.data.items.find((x: { id: string }) => x.id === id)
    expect(row.decidedBy).toBeTruthy()
    expect(row.level2By).toBeTruthy()
  })

  it('fund transfer needs approval before it counts in the cash pool', async () => {
    const pool = async () => {
      const r = await request(BASE).get('/api/v1/group/cash-pool').set(auth()).expect(200)
      return r.body.data.items.find((x: { id: string }) => x.id === entB)
    }
    const before = Number((await pool())?.transferIn ?? 0)
    const t = await request(BASE)
      .post('/api/v1/group/fund-transfer')
      .set(auth())
      .send({ fromEntityId: entA, toEntityId: entB, amount: '5000' })
    expect(t.body.data.status).toBe('SUBMITTED')
    expect(Number((await pool())?.transferIn)).toBe(before)

    await request(BASE)
      .post(`/api/v1/group/fund-transfers/${t.body.data.id}/approve`)
      .set(auth())
      .send({ action: 'APPROVED' })
      .expect(201)
    expect(Number((await pool())?.transferIn)).toBe(before + 5000)
    await request(BASE)
      .post(`/api/v1/group/fund-transfers/${t.body.data.id}/approve`)
      .set(auth())
      .send({ action: 'REJECTED' })
      .expect(409)
  })

  it('settlement numbers are unique and status only moves forward', async () => {
    const created = await Promise.all(
      [1, 2, 3].map((i) =>
        request(BASE)
          .post('/api/v1/group/settlements')
          .set(auth())
          .send({ fromEntityId: entA, toEntityId: entB, amount: String(100 * i), title: `int-结算${i}` }),
      ),
    )
    const nos = created.map((r) => r.body.data.settleNo)
    expect(new Set(nos).size).toBe(3)
    const id = created[0].body.data.id
    await request(BASE)
      .post(`/api/v1/group/settlements/${id}/status`)
      .set(auth())
      .send({ status: 'SETTLED' })
      .expect(201)
    await request(BASE)
      .post(`/api/v1/group/settlements/${id}/status`)
      .set(auth())
      .send({ status: 'DRAFT' })
      .expect(409)
    await request(BASE)
      .post(`/api/v1/group/settlements/${id}/status`)
      .set(auth())
      .send({ status: 'PAID' })
      .expect(422)
    await request(BASE)
      .post(`/api/v1/group/settlements/${id}/status`)
      .set(auth())
      .send({ status: 'CONFIRMED' })
      .expect(409)
    const print = await request(BASE).get(`/api/v1/group/settlements/${id}/print`).set(auth()).expect(200)
    expect(print.body.data.fromName).toContain('int-主体A')
  })

  it('expense allocation lines add up to the total', async () => {
    const r = await request(BASE)
      .post('/api/v1/group/allocate-expense')
      .set(auth())
      .send({ totalAmount: '100', note: 'int-分摊' })
      .expect(201)
    const sum = (r.body.data.items as { amount: string }[]).reduce((a, x) => a + Number(x.amount), 0)
    expect(sum.toFixed(2)).toBe('100.00')
    const hist = await request(BASE).get('/api/v1/group/expense-history').set(auth()).expect(200)
    expect(hist.body.data.items[0].note).toBe('int-分摊')
  })

  it('rejects references to another tenant', async () => {
    if (!otherToken) return
    const foreign = await request(BASE)
      .post('/api/v1/group/entities')
      .set(auth(otherToken))
      .send({ name: 'int-acme-主体' })
    expect([200, 201]).toContain(foreign.status)
    await request(BASE)
      .post('/api/v1/group/budgets')
      .set(auth())
      .send({ entityId: foreign.body.data.id, year, budgetAmount: '1' })
      .expect(404)
    await request(BASE)
      .put(`/api/v1/group/entities/${foreign.body.data.id}`)
      .set(auth())
      .send({ name: 'hijack' })
      .expect(404)
    await request(BASE).delete(`/api/v1/group/entities/${foreign.body.data.id}`).set(auth(otherToken))
  })

  it('user entity scope restricts the account list', async () => {
    const acc = await request(BASE)
      .post('/api/v1/accounts')
      .set(auth())
      .send({ name: `int-scope-客户-${Date.now()}` })
    expect([200, 201]).toContain(acc.status)
    const accountId = acc.body.data.id
    await request(BASE)
      .post('/api/v1/group/account-entities')
      .set(auth())
      .send({ accountId, entityId: entB })
      .expect(201)
    const me = await request(BASE).get('/api/v1/auth/me').set(auth()).expect(200)
    const userId = me.body.data.id

    // 管理员被限定只看主体 A：归属主体 B 的客户应不可见
    await request(BASE)
      .post('/api/v1/group/user-scopes')
      .set(auth())
      .send({ userId, entityIds: [entA] })
      .expect(201)
    try {
      const list = await request(BASE)
        .get(`/api/v1/accounts?q=${encodeURIComponent(acc.body.data.name)}`)
        .set(auth())
        .expect(200)
      expect(list.body.data.items.map((x: { id: string }) => x.id)).not.toContain(accountId)
    } finally {
      await request(BASE)
        .post('/api/v1/group/user-scopes')
        .set(auth())
        .send({ userId, entityIds: [] })
        .expect(201)
    }
    const list = await request(BASE)
      .get(`/api/v1/accounts?q=${encodeURIComponent(acc.body.data.name)}`)
      .set(auth())
      .expect(200)
    expect(list.body.data.items.map((x: { id: string }) => x.id)).toContain(accountId)
  })
})
