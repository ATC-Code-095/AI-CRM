import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const PASS = process.env.PASS || 'Demo@12345'

const ok2xx = (r: { status: number; body: unknown }) => {
  if (r.status !== 200 && r.status !== 201) throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
}

async function session(email: string) {
  const res = await request(BASE).post('/api/v1/auth/login').send({ email, password: PASS }).expect(200)
  const token = res.body.data.accessToken as string
  return { token, id: res.body.data.user.id as string, auth: { Authorization: `Bearer ${token}` } }
}

/** 演示组织：rep@demo.com → manager@demo.com → admin@demo.com（唯一超级管理员） */
describe('quote approval chain & notifications', () => {
  let admin: Awaited<ReturnType<typeof session>>
  let mgr: Awaited<ReturnType<typeof session>>
  let rep: Awaited<ReturnType<typeof session>>
  let fin: Awaited<ReturnType<typeof session>>
  let productId = ''

  beforeAll(async () => {
    ;[admin, mgr, rep, fin] = await Promise.all(
      ['admin@demo.com', 'manager@demo.com', 'rep@demo.com', 'finance@demo.com'].map(session),
    )
    productId = (await request(BASE).get('/api/v1/products?pageSize=1').set(admin.auth)).body.data.items[0].id
  })

  async function discountedQuote(who: typeof rep) {
    const acc = await request(BASE).post('/api/v1/accounts').set(who.auth).send({ name: `审批链-${Date.now()}` }).expect(ok2xx)
    const q = await request(BASE)
      .post('/api/v1/quotes')
      .set(who.auth)
      .send({ accountId: acc.body.data.id, subject: `审批链-${Date.now()}`, lines: [{ productId, qty: '1', discountRate: '0.3' }] })
      .expect(ok2xx)
    return q.body.data as { id: string }
  }

  async function approvalOf(quoteId: string, who: typeof admin) {
    const mine = await request(BASE).get('/api/v1/approvals/mine?pageSize=50').set(who.auth).expect(200)
    const inst = (mine.body.data.items as Array<{ id: string; entityId: string }>).find((x) => x.entityId === quoteId)
    expect(inst).toBeTruthy()
    return (await request(BASE).get(`/api/v1/approvals/${inst!.id}`).set(admin.auth).expect(200)).body.data as {
      id: string
      steps: Array<{ stepIndex: number; approverId: string }>
    }
  }

  it('销售提交：第 1 级交给经理，第 2 级交给经理的上级', async () => {
    const q = await discountedQuote(rep)
    await request(BASE).post(`/api/v1/quotes/${q.id}/submit`).set(rep.auth).expect(ok2xx)
    const inst = await approvalOf(q.id, rep)
    expect(inst.steps.map((s) => s.approverId)).toEqual([mgr.id, admin.id])

    await request(BASE).post(`/api/v1/approvals/${inst.id}/approve`).set(mgr.auth).send({ comment: '同意' }).expect(ok2xx)
    // 经理不能代批第 2 级
    const again = await request(BASE).post(`/api/v1/approvals/${inst.id}/approve`).set(mgr.auth).send({ comment: '同意' })
    expect(again.status).toBe(403)
    await request(BASE).post(`/api/v1/approvals/${inst.id}/approve`).set(admin.auth).send({ comment: '同意' }).expect(ok2xx)
    const quote = await request(BASE).get(`/api/v1/quotes/${q.id}`).set(rep.auth).expect(200)
    expect(quote.body.data.status).toBe('APPROVED')
  })

  it('经理提交：上级就是唯一超级管理员时只审一次', async () => {
    const q = await discountedQuote(mgr)
    await request(BASE).post(`/api/v1/quotes/${q.id}/submit`).set(mgr.auth).expect(ok2xx)
    const inst = await approvalOf(q.id, mgr)
    expect(inst.steps.map((s) => s.approverId)).toEqual([admin.id])
  })

  it('唯一超级管理员不能审批自己的报价：提交被拒绝，报价仍为草稿', async () => {
    const q = await discountedQuote(admin)
    const res = await request(BASE).post(`/api/v1/quotes/${q.id}/submit`).set(admin.auth)
    expect(res.status).toBe(422)
    const quote = await request(BASE).get(`/api/v1/quotes/${q.id}`).set(admin.auth).expect(200)
    expect(quote.body.data.status).toBe('DRAFT')
  })

  it('财务可以读写自己的通知', async () => {
    await request(BASE).get('/api/v1/notifications?pageSize=5').set(fin.auth).expect(200)
    await request(BASE).get('/api/v1/notifications/unread-count').set(fin.auth).expect(200)
    await request(BASE).get('/api/v1/notifications/preferences').set(fin.auth).expect(200)
    await request(BASE).put('/api/v1/notifications/preferences').set(fin.auth).send({ mutedTypes: [] }).expect(ok2xx)
    await request(BASE).post('/api/v1/notifications/read-all').set(fin.auth).expect(ok2xx)
  })

  it('通知只针对本人：不能把别人的通知标为已读，偏好入参受校验，未登录 401', async () => {
    // 别人的通知：接口按本人过滤，不报错但不产生任何改动
    const unread = await request(BASE).get('/api/v1/notifications?unreadOnly=true&pageSize=1').set(admin.auth).expect(200)
    const nid = unread.body.data.items?.[0]?.id as string | undefined
    if (nid) {
      await request(BASE).post(`/api/v1/notifications/${nid}/read`).set(fin.auth)
      const still = await request(BASE).get('/api/v1/notifications?unreadOnly=true&pageSize=100').set(admin.auth).expect(200)
      expect((still.body.data.items as Array<{ id: string }>).map((n) => n.id)).toContain(nid)
    }
    const bad = await request(BASE).put('/api/v1/notifications/preferences').set(fin.auth).send({ mutedTypes: 'ALL' })
    expect(bad.status).toBe(400)
    const anon = await request(BASE).get('/api/v1/notifications/unread-count')
    expect(anon.status).toBe(401)
  })
})
