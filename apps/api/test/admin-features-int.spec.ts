import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const PASS = process.env.PASS || 'Demo@12345'

const ok2xx = (r: { status: number; body: unknown }) => {
  if (r.status !== 200 && r.status !== 201) throw new Error(`status ${r.status} ${JSON.stringify(r.body)}`)
}

async function session(email: string) {
  const res = await request(BASE).post('/api/v1/auth/login').send({ email, password: PASS }).expect(200)
  return { id: res.body.data.user.id as string, auth: { Authorization: `Bearer ${res.body.data.accessToken}` } }
}

/**
 * 演示组织：rep@demo.com（唯一 SALES_REP）→ manager@demo.com → admin@demo.com（唯一超级管理员）
 * 不修改租户业务参数（本库同时被线上使用），只验证默认配置下的行为。
 */
describe('admin reset password, lead auto-assign, upload limit, contract approval', () => {
  let admin: Awaited<ReturnType<typeof session>>
  let mgr: Awaited<ReturnType<typeof session>>
  let rep: Awaited<ReturnType<typeof session>>
  let acme: Awaited<ReturnType<typeof session>>

  beforeAll(async () => {
    ;[admin, mgr, rep, acme] = await Promise.all(
      ['admin@demo.com', 'manager@demo.com', 'rep@demo.com', 'admin@acme.com'].map(session),
    )
  })

  describe('管理员重置他人密码', () => {
    it('管理员重置后本人用新密码登录，再恢复', async () => {
      const tmp = `Reset@${Date.now()}`
      await request(BASE).post(`/api/v1/users/${rep.id}/reset-password`).set(admin.auth).send({ newPassword: tmp }).expect(ok2xx)
      try {
        expect((await request(BASE).post('/api/v1/auth/login').send({ email: 'rep@demo.com', password: PASS })).status).not.toBe(200)
        await request(BASE).post('/api/v1/auth/login').send({ email: 'rep@demo.com', password: tmp }).expect(200)
      } finally {
        await request(BASE).post(`/api/v1/users/${rep.id}/reset-password`).set(admin.auth).send({ newPassword: PASS }).expect(ok2xx)
      }
      await request(BASE).post('/api/v1/auth/login').send({ email: 'rep@demo.com', password: PASS }).expect(200)
    })

    it('无用户编辑权限不能重置；不能跨租户；密码至少 8 位', async () => {
      expect((await request(BASE).post(`/api/v1/users/${mgr.id}/reset-password`).set(rep.auth).send({ newPassword: 'Whatever@1234' })).status).toBe(403)
      expect((await request(BASE).post(`/api/v1/users/${rep.id}/reset-password`).set(acme.auth).send({ newPassword: 'Whatever@1234' })).status).toBe(404)
      expect((await request(BASE).post(`/api/v1/users/${rep.id}/reset-password`).set(admin.auth).send({ newPassword: 'short' })).status).toBe(400)
    })
  })

  describe('线索自动分配（默认 LOAD_BALANCE、创建即分配）', () => {
    it('管理员录入的线索分给销售，销售收到通知', async () => {
      const name = `自动分配-${Date.now()}`
      const lead = await request(BASE).post('/api/v1/leads').set(admin.auth).send({ name, source: 'OTHER' }).expect(ok2xx)
      expect(lead.body.data.ownerId).toBe(rep.id)
      const n = await request(BASE).get('/api/v1/notifications?pageSize=20').set(rep.auth).expect(200)
      expect((n.body.data.items as Array<{ entityId?: string }>).some((x) => x.entityId === lead.body.data.id)).toBe(true)
    })

    it('销售自己录入的线索仍归本人', async () => {
      const lead = await request(BASE).post('/api/v1/leads').set(rep.auth).send({ name: `本人线索-${Date.now()}`, source: 'PHONE' }).expect(ok2xx)
      expect(lead.body.data.ownerId).toBe(rep.id)
    })

    it('管理员（非销售角色）导入的线索分给销售', async () => {
      const name = `导入分配-${Date.now()}`
      await request(BASE).post('/api/v1/import/leads').set(admin.auth).send({ csv: `name,phone\n${name},13500000000` }).expect(ok2xx)
      const list = await request(BASE).get(`/api/v1/leads?q=${encodeURIComponent(name)}`).set(admin.auth).expect(200)
      const id = list.body.data.items[0]?.id as string
      expect(id).toBeTruthy()
      // 列表不返回负责人字段，取详情核对
      const detail = await request(BASE).get(`/api/v1/leads/${id}`).set(admin.auth).expect(200)
      expect(detail.body.data.ownerId).toBe(rep.id)
    })
  })

  it('超过附件大小上限返回 413（默认 10 MB）', async () => {
    const res = await request(BASE)
      .post('/api/v1/files')
      .set(admin.auth)
      .field('entityType', 'ACCOUNT')
      .field('entityId', 'size-check')
      .attach('file', Buffer.alloc(11 * 1024 * 1024, 1), { filename: 'big.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(413)
  })

  describe('合同金额审批（默认 ≥ 10 万）', () => {
    async function contractOf(total: 'big' | 'small') {
      const H = admin.auth
      const acc = await request(BASE).post('/api/v1/accounts').set(H).send({ name: `合同审批-${Date.now()}` }).expect(ok2xx)
      const prod = await request(BASE)
        .post('/api/v1/products')
        .set(H)
        .send({ code: `CA${Date.now()}`, name: `合同审批产品-${Date.now()}`, standardPrice: total === 'big' ? '120000.00' : '5000.00' })
        .expect(ok2xx)
      const q = await request(BASE)
        .post('/api/v1/quotes')
        .set(H)
        .send({ accountId: acc.body.data.id, subject: `合同审批-${Date.now()}`, lines: [{ productId: prod.body.data.id, qty: '1', discountRate: '0' }] })
        .expect(ok2xx)
      await request(BASE).post(`/api/v1/quotes/${q.body.data.id}/submit`).set(H).expect(ok2xx)
      await request(BASE).post(`/api/v1/quotes/${q.body.data.id}/accept`).set(H).expect(ok2xx)
      const c = await request(BASE).post(`/api/v1/quotes/${q.body.data.id}/to-contract`).set(H).expect(ok2xx)
      // 测试产品用完即停用，避免出现在产品目录里、被其他脚本取作「第一个产品」
      await request(BASE).patch(`/api/v1/products/${prod.body.data.id}`).set(H).send({ isActive: false }).expect(ok2xx)
      return c.body.data as { id: string }
    }

    it('达到金额的合同先审批，全部通过后自动生效', async () => {
      const c = await contractOf('big')
      const e1 = await request(BASE).post(`/api/v1/contracts/${c.id}/effective`).set(mgr.auth).expect(ok2xx)
      expect(e1.body.data.status).toBe('APPROVING')
      expect((await request(BASE).post(`/api/v1/contracts/${c.id}/effective`).set(mgr.auth)).status).toBe(409)
      const todo = await request(BASE).get('/api/v1/approvals/todo?pageSize=50').set(admin.auth).expect(200)
      const inst = (todo.body.data.items as Array<{ id: string; entityId: string }>).find((x) => x.entityId === c.id)
      expect(inst).toBeTruthy()
      await request(BASE).post(`/api/v1/approvals/${inst!.id}/approve`).set(admin.auth).send({ comment: '同意' }).expect(ok2xx)
      const after = await request(BASE).get(`/api/v1/contracts/${c.id}`).set(admin.auth).expect(200)
      expect(after.body.data.status).toBe('EFFECTIVE')
    })

    it('驳回后可重新提交', async () => {
      const c = await contractOf('big')
      await request(BASE).post(`/api/v1/contracts/${c.id}/effective`).set(mgr.auth).expect(ok2xx)
      const todo = await request(BASE).get('/api/v1/approvals/todo?pageSize=50').set(admin.auth).expect(200)
      const inst = (todo.body.data.items as Array<{ id: string; entityId: string }>).find((x) => x.entityId === c.id)
      await request(BASE).post(`/api/v1/approvals/${inst!.id}/reject`).set(admin.auth).send({ comment: '金额需复核' }).expect(ok2xx)
      expect((await request(BASE).get(`/api/v1/contracts/${c.id}`).set(admin.auth)).body.data.status).toBe('REJECTED')
      const again = await request(BASE).post(`/api/v1/contracts/${c.id}/effective`).set(mgr.auth).expect(ok2xx)
      expect(again.body.data.status).toBe('APPROVING')
    })

    it('金额以下的合同直接生效', async () => {
      const c = await contractOf('small')
      const e = await request(BASE).post(`/api/v1/contracts/${c.id}/effective`).set(mgr.auth).expect(ok2xx)
      expect(e.body.data.status).toBe('EFFECTIVE')
    })
  })
})
