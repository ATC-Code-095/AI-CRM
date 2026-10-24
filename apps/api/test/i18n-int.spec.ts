import { describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const PASS = process.env.PASS || 'Demo@12345'

async function tokenOf(email: string) {
  const res = await request(BASE).post('/api/v1/auth/login').send({ email, password: PASS })
  expect(res.status).toBe(200)
  return {
    token: res.body.data.accessToken as string,
    userId: res.body.data.user.id as string,
  }
}

/** 服务端按界面语言生成文字：X-UI-Locale 决定接口返回的说明与错误提示，通知按接收人的语言存储 */
describe('server-side i18n', () => {
  it('translates system stage names and generated report text for English requests', async () => {
    const { token } = await tokenOf('admin@demo.com')
    const auth = { Authorization: `Bearer ${token}` }

    const en = await request(BASE).get('/api/v1/pipelines').set(auth).set('X-UI-Locale', 'en-US').expect(200)
    const enText = JSON.stringify(en.body.data)
    expect(enText).toContain('Prospecting')
    expect(enText).not.toContain('初步接洽')

    const zh = await request(BASE).get('/api/v1/pipelines').set(auth).set('X-UI-Locale', 'zh-CN').expect(200)
    expect(JSON.stringify(zh.body.data)).toContain('初步接洽')

    const conv = await request(BASE).get('/api/v1/reports/stage-conversion?days=90').set(auth).set('X-UI-Locale', 'en-US').expect(200)
    expect(JSON.stringify(conv.body.data)).not.toMatch(/初步接洽|需求确认/)

    const brief = await request(BASE).get('/api/v1/reports/sales-brief').set(auth).set('X-UI-Locale', 'en-US')
    if (brief.status === 200) {
      expect(brief.body.data.text).toContain('Sales brief')
      expect(brief.body.data.text).not.toMatch(/[一-鿿]{2}/)
    }
  })

  it('returns error messages in the request language', async () => {
    const { token } = await tokenOf('admin@demo.com')
    const auth = { Authorization: `Bearer ${token}` }
    const en = await request(BASE).put('/api/v1/reports/commission/rules').set(auth).set('X-UI-Locale', 'en-US').send({ tiers: [] })
    expect(en.status).toBeGreaterThanOrEqual(400)
    expect(en.body.message).toBe('Commission tiers cannot be empty')

    const zh = await request(BASE).put('/api/v1/reports/commission/rules').set(auth).send({ tiers: [] })
    expect(zh.body.message).toBe('佣金阶梯不能为空')
  })

  it('stores notifications in the recipient language, not the sender language', async () => {
    const admin = await tokenOf('admin@demo.com')
    const rep = await tokenOf('rep@demo.com')
    const adminAuth = { Authorization: `Bearer ${admin.token}` }
    const repAuth = { Authorization: `Bearer ${rep.token}` }

    // 销售把自己的语言设为英文；管理员用中文界面分配线索
    await request(BASE).post('/api/v1/auth/preferences').set(repAuth).send({ locale: 'en-US' }).expect(201)
    try {
      const lead = await request(BASE)
        .post('/api/v1/leads')
        .set(adminAuth)
        .send({ name: `i18n-通知-${Date.now()}`, source: 'OTHER' })
      expect([200, 201]).toContain(lead.status)
      const leadId = lead.body.data.id as string
      await request(BASE)
        .post(`/api/v1/leads/${leadId}/assign`)
        .set(adminAuth)
        .set('X-UI-Locale', 'zh-CN')
        .send({ ownerId: rep.userId })
        .expect((r) => expect([200, 201]).toContain(r.status))

      const list = await request(BASE).get('/api/v1/notifications?pageSize=20').set(repAuth).expect(200)
      const n = (list.body.data.items as { entityId: string; title: string }[]).find((x) => x.entityId === leadId)
      expect(n?.title).toBe('A lead has been assigned to you')

      await request(BASE).delete(`/api/v1/leads/${leadId}`).set(adminAuth)
    } finally {
      await request(BASE).post('/api/v1/auth/preferences').set(repAuth).send({ locale: 'zh-CN' })
    }
  })
})
