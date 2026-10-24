import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('customer success & marketing integration', () => {
  let token = ''
  let accountId = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
    const acc = await request(BASE).get('/api/v1/accounts?pageSize=1').set(auth()).expect(200)
    accountId = acc.body.data.items[0].id
  })

  it('email tracking counts opens and clicks without losing updates', async () => {
    const sent = await request(BASE)
      .post('/api/v1/email-sends')
      .set(auth())
      .send({ to: 'int@example.com', subject: 'int-邮件', body: '<a href="https://example.com/x">x</a>' })
    expect([200, 201]).toContain(sent.status)
    const id = sent.body.data.id
    expect(sent.body.data.html).toContain(`/api/v1/track/open/${id}.gif`)
    expect(sent.body.data.html).toContain(`/api/v1/track/click/${id}?u=`)

    // 公开端点，无需登录；并发打开不丢计数
    await Promise.all([1, 2, 3, 4, 5].map(() => request(BASE).get(`/api/v1/track/open/${id}.gif`).expect(200)))
    await request(BASE).get(`/api/v1/track/click/${id}?u=${encodeURIComponent('https://example.com/x')}`).expect(302)

    let row: { openCount: number; clickCount: number; status: string; openedAt: string | null } | undefined
    for (let i = 0; i < 10; i++) {
      // 追踪写入是异步的，稍等再读
      await new Promise((r) => setTimeout(r, 100))
      const list = await request(BASE).get('/api/v1/email-sends').set(auth()).expect(200)
      row = list.body.data.items.find((x: { id: string }) => x.id === id)
      if (row && row.openCount === 5 && row.clickCount === 1) break
    }
    expect(row?.openCount).toBe(5)
    expect(row?.clickCount).toBe(1)
    expect(row?.status).toBe('CLICKED')
    expect(row?.openedAt).toBeTruthy()
    const eng = await request(BASE).get('/api/v1/email-engagement').set(auth()).expect(200)
    expect(eng.body.data.total).toBeGreaterThan(0)
  })

  it('meeting action items toggle individually', async () => {
    const m = await request(BASE)
      .post('/api/v1/meetings')
      .set(auth())
      .send({ title: `int-会议-${Date.now()}`, entityType: 'ACCOUNT', entityId: accountId, actions: '发方案\n约演示' })
    expect([200, 201]).toContain(m.status)
    expect(m.body.data.actionList.map((a: { text: string }) => a.text)).toEqual(['发方案', '约演示'])
    const mid = m.body.data.id

    const t = await request(BASE)
      .post('/api/v1/meeting-actions/toggle')
      .set(auth())
      .send({ meetingId: mid, index: 1 })
      .expect(201)
    expect(t.body.data.action).toMatchObject({ text: '约演示', done: true })
    await request(BASE)
      .post('/api/v1/meeting-actions/toggle')
      .set(auth())
      .send({ meetingId: mid, index: 5 })
      .expect(422)

    const list = await request(BASE)
      .get(`/api/v1/meetings?entityType=ACCOUNT&entityId=${accountId}`)
      .set(auth())
      .expect(200)
    const row = list.body.data.items.find((x: { id: string }) => x.id === mid)
    expect(row.actionList.map((a: { done: boolean }) => a.done)).toEqual([false, true])

    await request(BASE).delete(`/api/v1/meetings/${mid}`).set(auth()).expect(200)
    await request(BASE)
      .post('/api/v1/meeting-actions/toggle')
      .set(auth())
      .send({ meetingId: mid, index: 0 })
      .expect(404)
  })

  it('NPS scores feed account history and alerts', async () => {
    await request(BASE)
      .post('/api/v1/nps')
      .set(auth())
      .send({ accountId, score: 2, comment: 'int-低分' })
      .expect(201)
    const hist = await request(BASE).get(`/api/v1/nps/account/${accountId}`).set(auth()).expect(200)
    expect(hist.body.data.items[0].comment).toBe('int-低分')
    const alerts = await request(BASE).get('/api/v1/nps/alerts').set(auth()).expect(200)
    const a = alerts.body.data.items.find((x: { accountId: string }) => x.accountId === accountId)
    expect(a.level).toBe('HIGH')
  })

  it('partners CRUD', async () => {
    const pt = await request(BASE)
      .post('/api/v1/partners')
      .set(auth())
      .send({ name: `int-伙伴-${Date.now()}`, region: '华东' })
    expect([200, 201]).toContain(pt.status)
    await request(BASE).put(`/api/v1/partners/${pt.body.data.id}`).set(auth()).send({ region: '华南' }).expect(200)
    const portal = await request(BASE).get(`/api/v1/partners/${pt.body.data.id}/portal`).set(auth()).expect(200)
    expect(portal.body.data.partner.region).toBe('华南')
    await request(BASE).delete(`/api/v1/partners/${pt.body.data.id}`).set(auth()).expect(200)
    await request(BASE).get(`/api/v1/partners/${pt.body.data.id}/portal`).set(auth()).expect(404)
  })

  it('success plan is saved per account and validated', async () => {
    await request(BASE)
      .put(`/api/v1/accounts/${accountId}/success-plan`)
      .set(auth())
      .send({ goals: 'int-目标', adoption: 150, milestones: [{ text: '上线', done: true }] })
      .expect(200)
    const plan = await request(BASE).get(`/api/v1/accounts/${accountId}/success-plan`).set(auth()).expect(200)
    expect(plan.body.data.goals).toBe('int-目标')
    expect(plan.body.data.adoption).toBe(100)
    const health = await request(BASE).get('/api/v1/success-health').set(auth()).expect(200)
    expect(health.body.data.items.some((x: { accountId: string }) => x.accountId === accountId)).toBe(true)
    await request(BASE)
      .put('/api/v1/accounts/missing-account/success-plan')
      .set(auth())
      .send({ goals: 'x' })
      .expect(404)
  })

  it('segments CRUD and autoOutreach flag', async () => {
    const sg = await request(BASE)
      .post('/api/v1/segments')
      .set(auth())
      .send({ name: `int-分群-${Date.now()}`, level: 'NONEXISTENT' })
    expect([200, 201]).toContain(sg.status)
    const upd = await request(BASE)
      .put(`/api/v1/segments/${sg.body.data.id}`)
      .set(auth())
      .send({ autoOutreach: true })
      .expect(200)
    expect(upd.body.data.autoOutreach).toBe(true)
    const members = await request(BASE).get(`/api/v1/segments/${sg.body.data.id}/members`).set(auth()).expect(200)
    expect(members.body.data.total).toBe(0)
    await request(BASE).delete(`/api/v1/segments/${sg.body.data.id}`).set(auth()).expect(200)
    await request(BASE).get(`/api/v1/segments/${sg.body.data.id}/members`).set(auth()).expect(404)
  })
})
