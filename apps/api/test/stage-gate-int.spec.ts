import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const EMAIL = process.env.EMAIL || 'admin@demo.com'
const PASS = process.env.PASS || 'Demo@12345'

/**
 * 阶段门禁（Validation Rules）集成测试
 *
 * 规则：推进到「谈判」需 金额 / 预计成交日 / 下一步动作 / 客户联系人（决策链）。
 * 缺失时返回 42200 且一次性列出全部缺失项；补齐后同一操作应成功。
 */
describe('opportunity stage gate', () => {
  let token = ''
  let accountId = ''
  let oppId = ''
  let negotiationStageId = ''

  beforeAll(async () => {
    const login = await request(BASE)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASS })
      .expect(200)
    token = login.body.data.accessToken

    // 新建一个干净的客户 + 商机（金额与预计成交日齐备，故意缺「下一步动作」）
    const acc = await request(BASE)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `阶段门禁测试-${Date.now()}` })
      .expect(201)
    accountId = acc.body.data.id

    const opp = await request(BASE)
      .post('/api/v1/opportunities')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `门禁商机-${Date.now()}`,
        accountId,
        amount: '50000',
        expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      })
      .expect(201)
    oppId = opp.body.data.id

    const pipelines = await request(BASE)
      .get('/api/v1/pipelines')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    const stages = pipelines.body.data?.[0]?.stages ?? []
    negotiationStageId = stages.find((s: { code: string }) => s.code === 'NEGOTIATION')?.id ?? ''
  })

  it('缺「下一步动作」与「联系人」时拒绝推进到谈判', async () => {
    const res = await request(BASE)
      .patch(`/api/v1/opportunities/${oppId}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stageId: negotiationStageId })
    expect(res.status).toBe(422)
    const message: string = res.body.message ?? ''
    expect(message).toContain('谈判')
    expect(message).toContain('下一步动作')
    expect(message).toContain('客户联系人')
  })

  it('补齐门禁字段后推进成功', async () => {
    await request(BASE)
      .patch(`/api/v1/opportunities/${oppId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nextStep: '确认预算与决策链' })
      .expect(200)

    await request(BASE)
      .post(`/api/v1/accounts/${accountId}/contacts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '门禁测试联系人', decisionRole: 'ECONOMIC' })
      .expect(201)

    const res = await request(BASE)
      .patch(`/api/v1/opportunities/${oppId}/stage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stageId: negotiationStageId, note: 'gate test' })
      .expect(200)
    expect(res.body.data.stage.code).toBe('NEGOTIATION')
  })
})
