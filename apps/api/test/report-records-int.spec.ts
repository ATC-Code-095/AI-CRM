import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

describe('report & opportunity records integration', () => {
  let token = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const res = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = res.body.data.accessToken
  })

  it('forecast commit is one row per user per month', async () => {
    const month = '2031-01'
    for (const commitAmount of ['100', '250.5']) {
      await request(BASE)
        .post('/api/v1/opportunities/forecast-commit')
        .set(auth())
        .send({ month, commitAmount, bestAmount: '300', worstAmount: '50' })
        .expect(201)
    }
    const list = await request(BASE).get(`/api/v1/opportunities/forecast-commits?month=${month}`).set(auth()).expect(200)
    expect(list.body.data.items).toHaveLength(1)
    expect(list.body.data.items[0].commitAmount).toBe('250.50')
    expect(list.body.data.totals.bestAmount).toBe('300.00')

    await request(BASE)
      .post('/api/v1/opportunities/forecast-commit')
      .set(auth())
      .send({ month, commitAmount: 'abc' })
      .expect(400)
    const bias = await request(BASE).get(`/api/v1/reports/forecast-bias?month=${month}`).set(auth()).expect(200)
    expect(bias.status).toBe(200)
  })

  it('battlecard is saved per opportunity and shown on the board', async () => {
    const opps = await request(BASE).get('/api/v1/opportunities?pageSize=1').set(auth()).expect(200)
    const oppId = opps.body.data.items[0].id
    const actions = [{ text: 'int-约决策人', done: false }]
    await request(BASE)
      .put(`/api/v1/opportunities/${oppId}/battlecard`)
      .set(auth())
      .send({ competitors: 'int-竞品', winThemes: 'ROI', actions })
      .expect(200)
    const bc = await request(BASE).get(`/api/v1/opportunities/${oppId}/battlecard`).set(auth()).expect(200)
    expect(bc.body.data.competitors).toBe('int-竞品')
    expect(bc.body.data.actions).toEqual(actions)
    expect(bc.body.data.updatedBy).toBeTruthy()
    await request(BASE).get('/api/v1/reports/battlecard-board').set(auth()).expect(200)
    await request(BASE).get('/api/v1/opportunities/missing-opp/battlecard').set(auth()).expect(404)
  })

  it('health trends record one snapshot per day', async () => {
    const acc = await request(BASE).get('/api/v1/accounts?pageSize=1').set(auth()).expect(200)
    const accountId = acc.body.data.items[0].id
    const first = await request(BASE).get(`/api/v1/reports/health-trend/${accountId}`).set(auth()).expect(200)
    const second = await request(BASE).get(`/api/v1/reports/health-trend/${accountId}`).set(auth()).expect(200)
    const today = new Date().toISOString().slice(0, 10)
    expect(second.body.data.points.length).toBe(first.body.data.points.length)
    expect(second.body.data.points.at(-1).date).toBe(today)
    expect(second.body.data.points.at(-1)).toHaveProperty('level')

    const funnel = await request(BASE).get('/api/v1/reports/funnel-health-trend').set(auth()).expect(200)
    expect(funnel.body.data.points.at(-1).date).toBe(today)
    const team = await request(BASE).get('/api/v1/reports/team-health-trend').set(auth()).expect(200)
    expect(team.body.data.points.some((p: { date: string }) => p.date === today)).toBe(true)
  })

  it('health report job runs for the tenant', async () => {
    const r = await request(BASE).post('/api/v1/jobs/health-report').set(auth())
    expect([200, 201]).toContain(r.status)
    expect(['HEALTHY', 'ATTENTION']).toContain(r.body.data.status)
  })
})
