import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const REP_EMAIL = process.env.REP_EMAIL || 'rep@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

/** 销售角色的日常读取权限（迁移 20261022100000_sales_read_permissions 已应用） */
describe('sales rep read access', () => {
  let token = ''
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const res = await request(BASE).post('/api/v1/auth/login').send({ email: REP_EMAIL, password: PASS }).expect(200)
    token = res.body.data.accessToken
  })

  it('reads the user directory with id and name only', async () => {
    const res = await request(BASE).get('/api/v1/users/options').set(auth()).expect(200)
    const items = res.body.data.items as Record<string, unknown>[]
    expect(items.length).toBeGreaterThan(0)
    for (const u of items) expect(Object.keys(u).sort()).toEqual(['id', 'name'])
  })

  it('still cannot read the full user list', async () => {
    const res = await request(BASE).get('/api/v1/users?pageSize=5').set(auth())
    expect(res.status).toBe(403)
  })

  it('user directory requires login', async () => {
    const res = await request(BASE).get('/api/v1/users/options')
    expect(res.status).toBe(401)
  })

  it('reads custom field definitions', async () => {
    await request(BASE).get('/api/v1/field-definitions').set(auth()).expect(200)
  })

  it('reads goals', async () => {
    await request(BASE).get('/api/v1/goals').set(auth()).expect(200)
  })

  it('still cannot change custom fields or goals', async () => {
    const f = await request(BASE).post('/api/v1/field-definitions').set(auth()).send({ entity: 'LEAD', apiName: 'x', label: 'x', dataType: 'string' })
    expect(f.status).toBe(403)
    const g = await request(BASE).post('/api/v1/goals').set(auth()).send({ periodKey: '2026-10', metric: 'REVENUE', target: '1' })
    expect(g.status).toBe(403)
  })
})
