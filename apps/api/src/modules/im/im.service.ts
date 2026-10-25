import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { BizException, ErrorCodes } from '@zhixiao-crm/shared'
import { hashPassword } from '../../common/password'
import { PrismaService } from '../../common/prisma/prisma.service'
import { seal, unseal } from '../../common/secret-box'
import { tr } from '../../common/locale'
import { AuthService } from '../auth/auth.service'
import { ExtDept, ExtLoginUser, ExtUser, IM_PROVIDERS, ImAppConfig, imClient, ImClient, ImProvider } from './providers'

const KEY = 'im.apps'
const STATE_TTL_MS = 10 * 60_000
/** 一次同步最多把多少比例的已绑定用户停用；超过视为应用可见范围不完整，不停用 */
const MAX_DISABLE_RATIO = 0.3

export interface StoredApp {
  appId: string
  agentId?: string
  secretSealed: string
  enabled: boolean
  /** 每天自动同步通讯录 */
  syncDaily?: boolean
}

export interface SyncResult {
  at: string
  ok: boolean
  error?: string
  departments?: { created: number; updated: number }
  users?: { matched: number; created: number; disabled: number; skippedDisable?: number }
}

export interface Stored {
  apps?: Partial<Record<ImProvider, StoredApp>>
  lastSync?: Partial<Record<ImProvider, SyncResult>>
}

const CODE_PREFIX: Record<ImProvider, string> = { wechat_work: 'wx', dingtalk: 'dd', feishu: 'fs' }

/** 手机号比较时去掉国家码与符号 */
export function normalizeMobile(v?: string | null): string {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length > 11 && d.startsWith('86') ? d.slice(2) : d
}

@Injectable()
export class ImService {
  private readonly logger = new Logger('Im')

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** 测试替身入口：同步与登录都通过它取客户端 */
  client(provider: ImProvider, cfg: ImAppConfig): ImClient {
    return imClient(provider, cfg)
  }

  private async stored(tenantId: string) {
    const row = await this.prisma.setting.findFirst({ where: { tenantId, key: KEY, scope: 'TENANT' } })
    return { id: row?.id, value: ((row?.value ?? {}) as Stored) }
  }

  private async save(tenantId: string, id: string | undefined, value: Stored) {
    if (id) await this.prisma.setting.update({ where: { id }, data: { value: value as never } })
    else await this.prisma.setting.create({ data: { tenantId, key: KEY, scope: 'TENANT', value: value as never } })
  }

  async view(tenantId: string) {
    const { value } = await this.stored(tenantId)
    return {
      apps: Object.fromEntries(
        IM_PROVIDERS.map((p) => {
          const a = value.apps?.[p]
          return [
            p,
            a
              ? { appId: a.appId, agentId: a.agentId ?? '', enabled: a.enabled, syncDaily: Boolean(a.syncDaily), hasSecret: unseal(a.secretSealed) !== null }
              : null,
          ]
        }),
      ),
      lastSync: value.lastSync ?? {},
    }
  }

  async saveApp(
    tenantId: string,
    provider: ImProvider,
    body: { appId: string; agentId?: string; secret?: string; enabled: boolean; syncDaily?: boolean },
  ) {
    const { id, value } = await this.stored(tenantId)
    const prev = value.apps?.[provider]
    const secretSealed = body.secret ? seal(body.secret.trim()) : prev?.secretSealed
    if (!secretSealed) throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('请填写应用密钥', 'Enter the app secret'))
    if (provider === 'wechat_work' && body.enabled && !body.agentId) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('企业微信需要填写应用 AgentId', 'WeCom needs the app AgentId'))
    }
    value.apps = {
      ...(value.apps ?? {}),
      [provider]: { appId: body.appId.trim(), agentId: body.agentId?.trim() || undefined, secretSealed, enabled: body.enabled, syncDaily: Boolean(body.syncDaily) },
    }
    await this.save(tenantId, id, value)
    return this.view(tenantId)
  }

  private async appConfig(tenantId: string, provider: ImProvider, requireEnabled = true): Promise<ImAppConfig> {
    const { value } = await this.stored(tenantId)
    const a = value.apps?.[provider]
    if (!a || (requireEnabled && !a.enabled)) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('该平台尚未配置或未启用', 'This platform is not configured or not enabled'))
    }
    const secret = unseal(a.secretSealed)
    if (!secret) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('应用密钥无法读取，请重新填写', 'The app secret cannot be read; enter it again'))
    }
    return { appId: a.appId, agentId: a.agentId, secret }
  }

  async test(tenantId: string, provider: ImProvider) {
    try {
      await this.client(provider, await this.appConfig(tenantId, provider, false)).ping()
      return { ok: true }
    } catch (e) {
      if (e instanceof BizException) throw e
      return { ok: false, error: (e as Error).message }
    }
  }

  // ================= 通讯录同步 =================

  /**
   * 同步部门树与成员：
   * - 部门按平台 ID 新建或更新（名称、上级）；
   * - 成员按「已绑定 → 邮箱 → 手机」匹配在职 / 停用的 CRM 用户，更新部门并绑定；
   * - CRM 里没有的人建为「停用」账号，由管理员启用并分配角色；
   * - 平台上离职、被禁用或已不在通讯录的已绑定用户停用（超过 30% 时视为可见范围不完整，跳过停用）。
   */
  async sync(tenantId: string, provider: ImProvider): Promise<SyncResult> {
    const result: SyncResult = { at: new Date().toISOString(), ok: false }
    try {
      const client = this.client(provider, await this.appConfig(tenantId, provider))
      const depts = await client.listDepartments()
      const users = await client.listUsers(depts)
      result.departments = await this.syncDepartments(tenantId, provider, depts)
      result.users = await this.syncUsers(tenantId, provider, users)
      result.ok = true
    } catch (e) {
      result.error = (e as Error).message
      this.logger.warn(`${provider} sync failed for ${tenantId}: ${result.error}`)
    }
    const { id, value } = await this.stored(tenantId)
    value.lastSync = { ...(value.lastSync ?? {}), [provider]: result }
    await this.save(tenantId, id, value)
    return result
  }

  private async syncDepartments(tenantId: string, provider: ImProvider, depts: ExtDept[]) {
    const byExt = new Map(depts.map((d) => [d.id, d]))
    const existing = await this.prisma.department.findMany({ where: { tenantId, externalProvider: provider } })
    const local = new Map(existing.map((d) => [d.externalId!, d]))
    const resolved = new Map<string, { id: string; path: string } | null>()
    let created = 0
    let updated = 0

    // 自上而下处理：父部门先于子部门；名称为空的根部门不建，其子部门作为顶级部门
    const resolve = async (extId: string | null, depth = 0): Promise<{ id: string; path: string } | null> => {
      if (!extId || depth > 50) return null
      if (resolved.has(extId)) return resolved.get(extId)!
      const d = byExt.get(extId)
      if (!d || !d.name) {
        resolved.set(extId, null)
        return null
      }
      const parent = await resolve(d.parentId, depth + 1)
      const path = `${parent?.path ?? ''}/${d.name}`
      const cur = local.get(d.id)
      let row: { id: string; path: string }
      if (cur) {
        if (cur.name !== d.name || cur.parentId !== (parent?.id ?? null) || cur.path !== path || cur.deletedAt) {
          row = await this.prisma.department.update({
            where: { id: cur.id },
            data: { name: d.name, parentId: parent?.id ?? null, path, sortOrder: d.order, deletedAt: null },
            select: { id: true, path: true },
          })
          updated++
        } else row = { id: cur.id, path: cur.path }
      } else {
        row = await this.prisma.department.create({
          data: {
            tenantId,
            name: d.name,
            code: `${CODE_PREFIX[provider]}-${d.id}`.slice(0, 64),
            parentId: parent?.id ?? null,
            path,
            sortOrder: d.order,
            externalProvider: provider,
            externalId: d.id,
          },
          select: { id: true, path: true },
        })
        created++
      }
      resolved.set(extId, row)
      return row
    }
    for (const d of depts) await resolve(d.id)
    return { created, updated }
  }

  private async syncUsers(tenantId: string, provider: ImProvider, users: ExtUser[]) {
    const [identities, crmUsers, depts] = await Promise.all([
      this.prisma.userIdentity.findMany({ where: { tenantId, provider } }),
      this.prisma.user.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, email: true, phone: true, status: true, departmentId: true } }),
      this.prisma.department.findMany({ where: { tenantId, externalProvider: provider }, select: { id: true, externalId: true } }),
    ])
    const byIdentity = new Map(identities.map((i) => [i.externalId, i.userId]))
    const boundUsers = new Set(identities.map((i) => i.userId))
    const byEmail = new Map(crmUsers.map((u) => [u.email.toLowerCase(), u]))
    const byMobile = new Map(crmUsers.filter((u) => u.phone).map((u) => [normalizeMobile(u.phone), u]))
    const crmById = new Map(crmUsers.map((u) => [u.id, u]))
    const deptOf = new Map(depts.map((d) => [d.externalId!, d.id]))
    let matched = 0
    let created = 0
    const seen = new Set<string>()
    const toDisable: string[] = []

    for (const u of users) {
      seen.add(u.id)
      let userId = byIdentity.get(u.id)
      if (!userId) {
        const hit =
          (u.email && byEmail.get(u.email.toLowerCase())) || (u.mobile && byMobile.get(normalizeMobile(u.mobile))) || undefined
        // 已绑定其他平台账号的同一 CRM 用户不重复绑定到另一个平台账号
        if (hit && !boundUsers.has(hit.id)) userId = hit.id
      }
      const departmentId = u.deptIds.map((d) => deptOf.get(d)).find(Boolean) ?? null
      if (userId) {
        matched++
        const cur = crmById.get(userId)
        if (cur && departmentId && cur.departmentId !== departmentId) {
          await this.prisma.user.update({ where: { id: userId }, data: { departmentId } })
        }
        if (!u.active && cur?.status === 'ACTIVE') toDisable.push(userId)
      } else if (u.active) {
        // CRM 里没有的人：建为停用账号，只能由管理员启用；无邮箱时用占位邮箱（只能扫码登录）
        const email = (u.email || `${CODE_PREFIX[provider]}.${u.id}@sso.invalid`).toLowerCase()
        if (byEmail.has(email)) continue
        const row = await this.prisma.user.create({
          data: {
            tenantId,
            email,
            passwordHash: await hashPassword(randomBytes(24).toString('base64url')),
            name: u.name,
            phone: u.mobile ?? null,
            status: 'DISABLED',
            departmentId,
            dataScope: 'SELF',
          },
          select: { id: true, email: true, phone: true, status: true, departmentId: true },
        })
        byEmail.set(email, row)
        crmById.set(row.id, row)
        userId = row.id
        created++
      } else continue
      if (!byIdentity.has(u.id)) {
        await this.prisma.userIdentity.upsert({
          where: { userId_provider: { userId, provider } },
          update: { externalId: u.id },
          create: { tenantId, userId, provider, externalId: u.id },
        })
        byIdentity.set(u.id, userId)
        boundUsers.add(userId)
      }
    }

    // 已绑定但这次不在通讯录里的（离职或移出应用可见范围）
    for (const i of identities) {
      if (!seen.has(i.externalId) && crmById.get(i.userId)?.status === 'ACTIVE') toDisable.push(i.userId)
    }
    const unique = [...new Set(toDisable)]
    let skippedDisable = 0
    if (unique.length && (users.length === 0 || unique.length > Math.max(3, identities.length * MAX_DISABLE_RATIO))) {
      skippedDisable = unique.length
    } else if (unique.length) {
      await this.prisma.user.updateMany({ where: { id: { in: unique }, tenantId }, data: { status: 'DISABLED' } })
    }
    return { matched, created, disabled: skippedDisable ? 0 : unique.length, ...(skippedDisable ? { skippedDisable } : {}) }
  }

  /** 每天 02:30 为开启「每日同步」的租户同步通讯录 */
  @Cron('30 2 * * *')
  async dailySync() {
    const rows = await this.prisma.setting.findMany({ where: { key: KEY, scope: 'TENANT' } })
    for (const r of rows) {
      const apps = ((r.value ?? {}) as Stored).apps ?? {}
      for (const p of IM_PROVIDERS) {
        if (apps[p]?.enabled && apps[p]?.syncDaily) await this.sync(r.tenantId, p)
      }
    }
  }

  // ================= 扫码登录与绑定 =================

  private stateKey() {
    return `crm-sso:${process.env.JWT_ACCESS_SECRET ?? 'dev-access-change-me'}`
  }

  /** 签名的 state：防止伪造与跨站请求，10 分钟有效 */
  signState(payload: { tid: string; p: ImProvider; bind?: string }) {
    const body = Buffer.from(JSON.stringify({ ...payload, n: randomBytes(8).toString('hex'), exp: Date.now() + STATE_TTL_MS })).toString('base64url')
    const mac = createHmac('sha256', this.stateKey()).update(body).digest('base64url')
    return `${body}.${mac}`
  }

  verifyState(state: string): { tid: string; p: ImProvider; bind?: string } {
    const [body, mac] = String(state).split('.')
    const expect = createHmac('sha256', this.stateKey()).update(body ?? '').digest('base64url')
    if (!body || !mac || mac.length !== expect.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) {
      throw new UnauthorizedException('invalid state')
    }
    const v = JSON.parse(Buffer.from(body, 'base64url').toString()) as { tid: string; p: ImProvider; bind?: string; exp: number }
    if (v.exp < Date.now()) throw new UnauthorizedException('state expired')
    return v
  }

  /** 登录页：某租户启用了哪些扫码登录（不需要登录）；未指定租户且只有一个租户启用时用它 */
  async providersFor(tenantCode?: string) {
    let tenantId: string | undefined
    if (tenantCode) {
      tenantId = (await this.prisma.tenant.findUnique({ where: { code: tenantCode }, select: { id: true } }))?.id
      if (!tenantId) return { tenant: null, providers: [] }
    } else {
      const rows = await this.prisma.setting.findMany({ where: { key: KEY, scope: 'TENANT' }, select: { tenantId: true, value: true } })
      const enabled = rows.filter((r) => Object.values(((r.value ?? {}) as Stored).apps ?? {}).some((a) => a?.enabled))
      if (enabled.length !== 1) return { tenant: null, providers: [] }
      tenantId = enabled[0].tenantId
    }
    const { value } = await this.stored(tenantId)
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { code: true } })
    return { tenant: tenant?.code ?? null, providers: IM_PROVIDERS.filter((p) => value.apps?.[p]?.enabled) }
  }

  async startUrl(tenantCode: string | undefined, provider: ImProvider, redirectUri: string, bindUserId?: string, bindTenantId?: string) {
    let tenantId = bindTenantId
    if (!tenantId) {
      const info = await this.providersFor(tenantCode)
      if (!info.tenant || !info.providers.includes(provider)) {
        throw new BizException(ErrorCodes.UNPROCESSABLE, tr('该企业未启用此登录方式', 'This sign-in method is not enabled for the organization'))
      }
      tenantId = (await this.prisma.tenant.findUnique({ where: { code: info.tenant }, select: { id: true } }))!.id
    }
    const cfg = await this.appConfig(tenantId, provider)
    const state = this.signState({ tid: tenantId, p: provider, ...(bindUserId ? { bind: bindUserId } : {}) })
    return { url: this.client(provider, cfg).authorizeUrl(redirectUri, state) }
  }

  /**
   * 回调：用授权码换平台用户。绑定模式（state 里带用户）把账号绑到该用户；
   * 登录模式按「已绑定 → 邮箱 → 手机」找本租户在职用户，找到即登录并自动绑定，找不到拒绝（不建账号）。
   */
  async callback(provider: ImProvider, code: string, state: string, redirectUri: string) {
    const st = this.verifyState(state)
    if (st.p !== provider) throw new UnauthorizedException('invalid state')
    const cfg = await this.appConfig(st.tid, provider)
    let ext: ExtLoginUser
    try {
      ext = await this.client(provider, cfg).exchangeCode(code, redirectUri)
    } catch (e) {
      this.logger.warn(`${provider} code exchange failed: ${(e as Error).message}`)
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('平台身份验证失败，请重新扫码', 'The platform could not verify your identity; scan again'))
    }

    if (st.bind) {
      await this.bind(st.tid, st.bind, provider, ext.id)
      return { bound: true, provider }
    }

    const identity = await this.prisma.userIdentity.findUnique({
      where: { tenantId_provider_externalId: { tenantId: st.tid, provider, externalId: ext.id } },
    })
    let userId = identity?.userId
    if (!userId) {
      const active = await this.prisma.user.findMany({
        where: { tenantId: st.tid, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, email: true, phone: true },
      })
      const hit =
        (ext.email && active.find((u) => u.email.toLowerCase() === ext.email!.toLowerCase())) ||
        (ext.mobile && active.find((u) => u.phone && normalizeMobile(u.phone) === normalizeMobile(ext.mobile))) ||
        undefined
      if (!hit) {
        throw new BizException(
          ErrorCodes.FORBIDDEN,
          tr(
            '没有与该账号对应的 CRM 用户：请联系管理员同步通讯录，或先用密码登录后在「我的」中绑定',
            'No CRM user matches this account. Ask your administrator to sync the directory, or sign in with your password and link the account under Me.',
          ),
        )
      }
      userId = hit.id
      await this.bind(st.tid, userId, provider, ext.id)
    }
    return this.auth.loginAsUser(userId, st.tid, `LOGIN_SSO_${provider.toUpperCase()}`)
  }

  async bind(tenantId: string, userId: string, provider: ImProvider, externalId: string) {
    const taken = await this.prisma.userIdentity.findUnique({
      where: { tenantId_provider_externalId: { tenantId, provider, externalId } },
    })
    if (taken && taken.userId !== userId) {
      throw new BizException(ErrorCodes.CONFLICT, tr('该平台账号已绑定其他 CRM 用户', 'This platform account is already linked to another CRM user'))
    }
    await this.prisma.userIdentity.upsert({
      where: { userId_provider: { userId, provider } },
      update: { externalId },
      create: { tenantId, userId, provider, externalId },
    })
  }

  async myIdentities(tenantId: string, userId: string) {
    const [rows, info] = await Promise.all([
      this.prisma.userIdentity.findMany({ where: { tenantId, userId }, select: { provider: true, createdAt: true } }),
      this.stored(tenantId),
    ])
    return {
      identities: rows,
      available: IM_PROVIDERS.filter((p) => info.value.apps?.[p]?.enabled),
    }
  }

  async unbind(tenantId: string, userId: string, provider: ImProvider) {
    const r = await this.prisma.userIdentity.deleteMany({ where: { tenantId, userId, provider } })
    return { removed: r.count }
  }
}
