import { JwtService } from '@nestjs/jwt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaService } from '../src/common/prisma/prisma.service'
import { AuthService } from '../src/modules/auth/auth.service'
import { ImService } from '../src/modules/im/im.service'
import type { ExtDept, ExtLoginUser, ExtUser, ImAppConfig, ImClient, ImProvider } from '../src/modules/im/providers'

/** 假平台：通讯录与扫码结果可在用例中修改 */
const directory: { depts: ExtDept[]; users: ExtUser[]; login: ExtLoginUser | null } = { depts: [], users: [], login: null }

class FakeClient implements ImClient {
  async ping() {}
  async listDepartments() {
    return directory.depts
  }
  async listUsers() {
    return directory.users
  }
  authorizeUrl(redirectUri: string, state: string) {
    return `https://fake.example/auth?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
  }
  async exchangeCode() {
    if (!directory.login) throw new Error('bad code')
    return directory.login
  }
}

class TestImService extends ImService {
  client(_p: ImProvider, _c: ImAppConfig): ImClient {
    return new FakeClient()
  }
}

const prisma = new PrismaService()
const im = new TestImService(prisma, new AuthService(prisma, new JwtService({})))
const P: ImProvider = 'wechat_work'
const REDIRECT = 'https://crm.example.com/login/sso/wechat_work'
let tenantId = ''
const code = `im-int-${Date.now()}`

async function user(email: string, extra: Record<string, unknown> = {}) {
  return prisma.user.create({ data: { tenantId, email, passwordHash: 'x', name: email, status: 'ACTIVE', ...extra } })
}

describe('directory sync and scan login', () => {
  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { code, name: 'IM 集成测试' } })).id
  })

  afterAll(async () => {
    await prisma.userIdentity.deleteMany({ where: { tenantId } })
    await prisma.auditLog.deleteMany({ where: { tenantId } })
    await prisma.userRole.deleteMany({ where: { user: { tenantId } } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.department.deleteMany({ where: { tenantId, parentId: { not: null } } })
    await prisma.department.deleteMany({ where: { tenantId } })
    await prisma.setting.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  it('stores app settings without exposing the secret', async () => {
    const v = await im.saveApp(tenantId, P, { appId: 'corp', agentId: '1000002', secret: 'TOP-SECRET', enabled: true })
    expect(v.apps.wechat_work).toMatchObject({ appId: 'corp', agentId: '1000002', enabled: true, hasSecret: true })
    expect(JSON.stringify(v)).not.toContain('TOP-SECRET')
    expect(await im.providersFor(code)).toEqual({ tenant: code, providers: ['wechat_work'] })
  })

  it('syncs departments, matches users by email / mobile, creates new people disabled and disables leavers', async () => {
    const alice = await user(`alice-${code}@x.com`)
    const bob = await user(`bob-${code}@x.com`, { phone: '13800000009' })
    directory.depts = [
      { id: '1', parentId: null, name: '总公司', order: 1 },
      { id: '2', parentId: '1', name: '华东销售', order: 2 },
    ]
    directory.users = [
      { id: 'alice', name: 'Alice', email: `ALICE-${code}@x.com`, deptIds: ['2'], active: true },
      { id: 'bob', name: 'Bob', mobile: '+86 138-0000-0009', deptIds: ['1'], active: true },
      { id: 'carol', name: 'Carol', deptIds: ['2'], active: true },
    ]
    const r1 = await im.sync(tenantId, P)
    expect(r1).toMatchObject({ ok: true, departments: { created: 2, updated: 0 }, users: { matched: 2, created: 1, disabled: 0 } })

    const sales = await prisma.department.findFirstOrThrow({ where: { tenantId, externalProvider: P, externalId: '2' } })
    expect(sales.path).toBe('/总公司/华东销售')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.id } })).departmentId).toBe(sales.id)
    const carol = await prisma.user.findFirstOrThrow({ where: { tenantId, email: 'wx.carol@sso.invalid' } })
    expect(carol.status).toBe('DISABLED')
    expect(await prisma.userIdentity.count({ where: { tenantId, provider: P } })).toBe(3)

    // 第二次：部门改名、Bob 离职；不应重复建人
    directory.depts[1].name = '华东大区'
    directory.users[1].active = false
    const r2 = await im.sync(tenantId, P)
    expect(r2).toMatchObject({ ok: true, departments: { created: 0, updated: 1 }, users: { matched: 3, created: 0, disabled: 1 } })
    expect((await prisma.department.findUniqueOrThrow({ where: { id: sales.id } })).path).toBe('/总公司/华东大区')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bob.id } })).status).toBe('DISABLED')
    await prisma.user.update({ where: { id: bob.id }, data: { status: 'ACTIVE' } })
  })

  it('refuses to mass-disable when the directory suddenly comes back empty', async () => {
    const saved = directory.users
    directory.users = []
    const r = await im.sync(tenantId, P)
    expect(r.users).toMatchObject({ disabled: 0 })
    expect(r.users?.skippedDisable).toBeGreaterThan(0)
    expect(await prisma.user.count({ where: { tenantId, status: 'ACTIVE' } })).toBe(2)
    directory.users = saved
  })

  it('signs in through a bound identity, binds by email on first scan, and rejects unknown accounts', async () => {
    const { url } = await im.startUrl(code, P, REDIRECT)
    const state = new URL(url).searchParams.get('state')!

    directory.login = { id: 'alice' }
    const login = await im.callback(P, 'C', state, REDIRECT)
    expect('accessToken' in login && login.accessToken).toBeTruthy()
    expect('user' in login && login.user.email).toBe(`alice-${code}@x.com`)

    const dave = await user(`dave-${code}@x.com`)
    directory.login = { id: 'dave-ext', email: `dave-${code}@x.com` }
    await im.callback(P, 'C', state, REDIRECT)
    expect(await prisma.userIdentity.findFirst({ where: { tenantId, provider: P, externalId: 'dave-ext' } })).toMatchObject({ userId: dave.id })

    directory.login = { id: 'stranger', email: 'nobody@else.com' }
    await expect(im.callback(P, 'C', state, REDIRECT)).rejects.toMatchObject({ code: 40300 })

    // 停用账号即使已绑定也不能登录
    directory.login = { id: 'carol' }
    await expect(im.callback(P, 'C', state, REDIRECT)).rejects.toThrow('user inactive')

    const tampered = state.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))
    await expect(im.callback(P, 'C', tampered, REDIRECT)).rejects.toThrow('invalid state')
  })

  it('binds a platform account to the signed-in user and refuses one already taken', async () => {
    const erin = await user(`erin-${code}@x.com`)
    const { url } = await im.startUrl(undefined, P, REDIRECT, erin.id, tenantId)
    const state = new URL(url).searchParams.get('state')!
    directory.login = { id: 'erin-ext' }
    expect(await im.callback(P, 'C', state, REDIRECT)).toEqual({ bound: true, provider: P })
    expect((await im.myIdentities(tenantId, erin.id)).identities).toHaveLength(1)

    directory.login = { id: 'alice' }
    await expect(im.callback(P, 'C', state, REDIRECT)).rejects.toMatchObject({ code: 40900 })
    expect(await im.unbind(tenantId, erin.id, P)).toEqual({ removed: 1 })
  })
})
