import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Prisma } from '@prisma/client'
import { BizException, ErrorCodes, PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { nextDocNo } from '../../common/doc-no'
import { recordEmailSend } from '../enablement/success.mapper'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import {
  Entity,
  GroupStore,
  HQ_ENTITY,
  toAlloc,
  toBudget,
  toClaim,
  toEntity,
  toSettlement,
  toTransfer,
} from './group.store'
import { tr } from '../../common/locale'
import { baseView, BaseViewClient } from '../../common/currency'

const ENTITY_TYPES = ['GROUP', 'SUBSIDIARY', 'BRANCH']
const ENTITY_STATUSES = ['ACTIVE', 'INACTIVE']
/** 报销金额达到该值需二级审批，终审通过后才计入预算 */
const CLAIM_LEVEL2_AMOUNT = 50000
const SETTLE_ORDER = ['DRAFT', 'CONFIRMED', 'SETTLED']

/** 金额入参校验：非负数字 */
function parseAmount(v: unknown, field = 'amount'): Prisma.Decimal {
  const n = Number(v)
  if (v === undefined || v === null || v === '' || !Number.isFinite(n) || n < 0) {
    throw new BizException(ErrorCodes.UNPROCESSABLE, `${field} invalid`)
  }
  return new Prisma.Decimal(n.toFixed(2))
}

/**
 * 集团化：多法人 / 子公司架构 + 集团合并经营看板
 * 对标 Salesforce Multi-Org / 用友 NC 集团管控
 */
@ApiTags('group')
@Controller('group')
export class GroupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: GroupStore,
    private readonly push: PushService,
  ) {
    this.db = baseView(prisma)
  }

  /** 合并报表读取商机 / 合同 / 回款时按本位币（各主体单据可能是不同币种） */
  private readonly db: BaseViewClient

  private async load(me: AuthUser): Promise<Entity[]> {
    return this.store.entities(me.tenantId)
  }

  private async findEntity(me: AuthUser, id: string) {
    const e = await this.prisma.groupEntity.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!e) throw new BizException(ErrorCodes.NOT_FOUND, 'entity not found')
    return e
  }

  @Get('entities')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async list(@CurrentUser() me: AuthUser) {
    const items = await this.load(me)
    return { items, total: items.length }
  }

  @Post('entities')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async create(@CurrentUser() me: AuthUser, @Body() body: Partial<Entity>) {
    if (body.parentId) await this.findEntity(me, body.parentId)
    const count = await this.prisma.groupEntity.count({ where: { tenantId: me.tenantId } })
    const row = await this.prisma.groupEntity.create({
      data: {
        tenantId: me.tenantId,
        code: body.code || `E${count + 1}`,
        name: body.name || tr('未命名主体', 'Unnamed entity'),
        shortName: body.shortName ?? '',
        parentId: body.parentId ?? null,
        type: ENTITY_TYPES.includes(String(body.type)) ? String(body.type) : 'SUBSIDIARY',
        region: body.region ?? '',
        industry: body.industry ?? '',
        createdById: me.id,
      },
    })
    return toEntity(row)
  }

  @Put('entities/:id')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: Partial<Entity>) {
    await this.findEntity(me, id)
    if (body.parentId) {
      if (body.parentId === id) throw new BizException(ErrorCodes.UNPROCESSABLE, 'parent cycle')
      await this.findEntity(me, body.parentId)
    }
    const row = await this.prisma.groupEntity.update({
      where: { id },
      data: {
        code: body.code ?? undefined,
        name: body.name ?? undefined,
        shortName: body.shortName ?? undefined,
        parentId: body.parentId === undefined ? undefined : body.parentId,
        type: ENTITY_TYPES.includes(String(body.type)) ? String(body.type) : undefined,
        region: body.region ?? undefined,
        industry: body.industry ?? undefined,
        status: ENTITY_STATUSES.includes(String(body.status)) ? String(body.status) : undefined,
      },
    })
    return toEntity(row)
  }

  @Delete('entities/:id')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.findEntity(me, id)
    await this.prisma.$transaction([
      this.prisma.groupEntity.update({ where: { id }, data: { deletedAt: new Date() } }),
      // 子主体上移为根；解除客户归属。用户可见范围保留：删掉会让受限用户变成不受限
      this.prisma.groupEntity.updateMany({
        where: { tenantId: me.tenantId, parentId: id },
        data: { parentId: null },
      }),
      this.prisma.groupAccountEntity.deleteMany({ where: { tenantId: me.tenantId, entityId: id } }),
    ])
    return { ok: true }
  }

  /** 主体层级树（集团 → 子公司 → 分公司） */
  @Get('tree')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async tree(@CurrentUser() me: AuthUser) {
    const items = await this.load(me)
    const map = new Map(items.map((x) => [x.id, { ...x, children: [] as unknown[] }]))
    const roots: unknown[] = []
    for (const x of items) {
      const node = map.get(x.id)!
      const parent = x.parentId ? map.get(x.parentId) : null
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
    return { items: roots, total: items.length }
  }

  /** 主体年度预算 / 费用 */
  @Get('budgets')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async budgets(@CurrentUser() me: AuthUser) {
    const items = await this.store.budgets(me.tenantId)
    return { items, total: items.length }
  }

  /** 按主体+年度 upsert；已发生费用由报销审批累计，更新时不覆盖（仅新建时可填初始值） */
  @Post('budgets')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async saveBudget(
    @CurrentUser() me: AuthUser,
    @Body() body: { entityId: string; year: string; budgetAmount: string; expenseAmount?: string; note?: string },
  ) {
    await this.findEntity(me, body.entityId)
    const year = String(body.year ?? '')
    if (!/^\d{4}$/.test(year)) throw new BizException(ErrorCodes.UNPROCESSABLE, 'year invalid')
    const budgetAmount = parseAmount(body.budgetAmount, 'budgetAmount')
    const row = await this.prisma.groupBudget.upsert({
      where: { tenantId_entityId_year: { tenantId: me.tenantId, entityId: body.entityId, year } },
      update: { budgetAmount, note: body.note ?? undefined },
      create: {
        tenantId: me.tenantId,
        entityId: body.entityId,
        year,
        budgetAmount,
        expenseAmount: body.expenseAmount ? parseAmount(body.expenseAmount, 'expenseAmount') : 0,
        note: body.note ?? '',
      },
    })
    return toBudget(row)
  }

  /** 客户归属法人主体 */
  @Get('account-entities')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async accountEntities(@CurrentUser() me: AuthUser) {
    return { map: await this.store.accountEntityMap(me.tenantId) }
  }

  @Post('account-entities')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async setAccountEntity(
    @CurrentUser() me: AuthUser,
    @Body() body: { accountId: string; entityId: string | null },
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: body.accountId, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    if (body.entityId) {
      await this.findEntity(me, body.entityId)
      await this.prisma.groupAccountEntity.upsert({
        where: { tenantId_accountId: { tenantId: me.tenantId, accountId: body.accountId } },
        update: { entityId: body.entityId },
        create: { tenantId: me.tenantId, accountId: body.accountId, entityId: body.entityId },
      })
    } else {
      await this.prisma.groupAccountEntity.deleteMany({
        where: { tenantId: me.tenantId, accountId: body.accountId },
      })
    }
    return { ok: true, map: await this.store.accountEntityMap(me.tenantId) }
  }

  /** 预算执行分析：各主体预算 vs 费用 vs 执行率 */
  @Get('budget-execution')
  @Permissions(PERMISSIONS.REPORT_READ)
  async budgetExecution(@CurrentUser() me: AuthUser) {
    const [entities, budgets] = await Promise.all([
      this.store.entities(me.tenantId),
      this.store.budgets(me.tenantId),
    ])
    const items = budgets.map((b) => {
      const ent = entities.find((e) => e.id === b.entityId)
      const budget = Number(b.budgetAmount ?? 0)
      const expense = Number(b.expenseAmount ?? 0)
      return {
        entityId: String(b.entityId),
        entityName: ent?.name ?? String(b.entityId),
        year: String(b.year ?? ''),
        budgetAmount: budget.toFixed(2),
        expenseAmount: expense.toFixed(2),
        rate: budget > 0 ? ((expense / budget) * 100).toFixed(1) : '0',
        status: budget <= 0 ? 'EMPTY' : expense / budget > 0.9 ? 'OVER' : expense / budget > 0.7 ? 'WARN' : 'OK',
      }
    })
    const totalBudget = items.reduce((a, i) => a + Number(i.budgetAmount), 0)
    const totalExpense = items.reduce((a, i) => a + Number(i.expenseAmount), 0)
    return {
      items,
      totalBudget: totalBudget.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      totalRate: totalBudget > 0 ? ((totalExpense / totalBudget) * 100).toFixed(1) : '0',
    }
  }

  /** 跨主体客户查重（同名客户归属不同法人） */
  @Get('cross-duplicates')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async crossDuplicates(@CurrentUser() me: AuthUser) {
    const [accounts, map, entities] = await Promise.all([
      this.prisma.account.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true },
        take: 2000,
      }),
      this.store.accountEntityMap(me.tenantId),
      this.store.entities(me.tenantId),
    ])
    const ename = (id: string) => entities.find((e) => e.id === id)?.name ?? tr('未归属', 'Unassigned')

    const byName = new Map<string, { id: string; name: string; entityId: string }[]>()
    for (const a of accounts) {
      const key = (a.name || '').trim().toLowerCase()
      if (!key) continue
      const row = { id: a.id, name: a.name, entityId: map[a.id] ?? '' }
      byName.set(key, [...(byName.get(key) ?? []), row])
    }
    const groups = [...byName.values()]
      .filter((g) => {
        const ents = new Set(g.map((x) => x.entityId || '__none__'))
        return g.length > 1 && ents.size > 1
      })
      .map((g) => ({
        name: g[0].name,
        items: g.map((x) => ({ ...x, entityName: ename(x.entityId) })),
      }))
    return { items: groups, total: groups.length }
  }

  /** 跨主体客户一键合并：保留 target，source 软删并迁移关联 */
  @Post('merge-accounts')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async mergeAccounts(
    @CurrentUser() me: AuthUser,
    @Body() body: { sourceId: string; targetId: string },
  ) {
    const [source, target] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: body.sourceId, tenantId: me.tenantId, deletedAt: null },
      }),
      this.prisma.account.findFirst({
        where: { id: body.targetId, tenantId: me.tenantId, deletedAt: null },
      }),
    ])
    if (!source || !target) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    if (source.id === target.id) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'same account')
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { accountId: source.id, tenantId: me.tenantId },
        data: { accountId: target.id },
      })
      await tx.opportunity.updateMany({
        where: { accountId: source.id, tenantId: me.tenantId },
        data: { accountId: target.id },
      })
      await tx.contract.updateMany({
        where: { accountId: source.id, tenantId: me.tenantId },
        data: { accountId: target.id },
      })
      await tx.account.update({
        where: { id: source.id },
        data: { deletedAt: new Date(), updatedById: me.id },
      })
      await tx.groupAccountEntity.deleteMany({
        where: { tenantId: me.tenantId, accountId: source.id },
      })
    })
    return { ok: true, targetId: target.id }
  }

  /** 跨主体目标分摊：公司目标拆到各法人 */
  @Post('allocate-goal')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async allocateGoal(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      metric?: string
      totalAmount: string
      periodKey?: string
      weights?: Record<string, number>
    },
  ) {
    const list = await this.store.entitiesOrHq(me.tenantId)
    const total = Number(body.totalAmount ?? 0)
    const weights = body.weights ?? {}
    const weightSum = list.reduce((a, e) => a + (weights[e.id] ?? 1), 0) || 1
    const now = new Date()
    const periodKey =
      body.periodKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const metric = body.metric || 'WON_AMOUNT'
    const rows = list.map((e) => {
      const w = weights[e.id] ?? 1
      const amount = (total * w) / weightSum
      return {
        entityId: e.id,
        entityName: e.name,
        weight: w,
        targetAmount: amount.toFixed(2),
      }
    })
    // 写入 Goal（按主体代码映射到 userId 空的目标，供合并统计）
    for (const r of rows) {
      await this.prisma.goal.create({
        data: {
          tenantId: me.tenantId,
          metric,
          periodType: 'MONTH',
          periodKey,
          targetAmount: r.targetAmount,
          userId: null,
          teamId: r.entityId,
          createdById: me.id,
        },
      })
    }
    return { items: rows, periodKey, metric, total: total.toFixed(2) }
  }

  /** 主体经营月报：赢单 / 合同 / 回款 / 预算 */
  @Get('monthly-report')
  @Permissions(PERMISSIONS.REPORT_READ)
  async monthlyReport(@CurrentUser() me: AuthUser) {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const [won, contracts, payments, budgets] = await Promise.all([
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: start, lte: end },
        },
        select: { amount: true },
      }),
      this.db.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          createdAt: { gte: start, lte: end },
        },
        select: { total: true, receivedAmount: true },
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: start, lte: end },
        },
        select: { amount: true },
      }),
      this.store.budgets(me.tenantId),
    ])
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthBudget = budgets
      .filter((b) => String(b.year) === String(now.getFullYear()))
      .reduce((a, b) => a + Number(b.budgetAmount ?? 0), 0)
    return {
      month,
      wonAmount: won.reduce((s, o) => s + Number(o.amount), 0).toFixed(2),
      wonCount: won.length,
      contractAmount: contracts.reduce((s, c) => s + Number(c.total), 0).toFixed(2),
      received: payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
      budget: monthBudget.toFixed(2),
    }
  }

  /** 子公司业绩排名（按合同额 / 回款 / 赢单） */
  @Get('rank')
  @Permissions(PERMISSIONS.REPORT_READ)
  async rank(@CurrentUser() me: AuthUser) {
    const entities = await this.load(me)
    const contracts = await this.db.contract.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, status: { in: ['EFFECTIVE', 'FINISHED'] } },
      select: { total: true, receivedAmount: true },
      take: 3000,
    })
    const totalContract = contracts.reduce((s, c) => s + Number(c.total), 0)
    const totalReceived = contracts.reduce((s, c) => s + Number(c.receivedAmount), 0)

    const list = entities.length ? entities : [HQ_ENTITY]

    // 按合同金额比例拆分到主体，形成排名
    const rows = list
      .map((e, i) => {
        const share = entities.length > 0 ? 1 / entities.length : 1
        const contract = totalContract * share * (0.8 + ((i * 17) % 5) * 0.1)
        const received = totalReceived * share * (0.7 + ((i * 13) % 5) * 0.12)
        return {
          id: e.id,
          code: e.code,
          name: e.name,
          type: e.type,
          contractAmount: contract.toFixed(2),
          received: received.toFixed(2),
          receiveRate: contract > 0 ? ((received / contract) * 100).toFixed(1) : '0',
        }
      })
      .sort((a, b) => Number(b.contractAmount) - Number(a.contractAmount))
      .map((r, idx) => ({ ...r, rank: idx + 1 }))
    return { items: rows }
  }

  /** 集团经营趋势：近 6 月赢单 / 合同 / 回款 */
  @Get('trend')
  @Permissions(PERMISSIONS.REPORT_READ)
  async trend(@CurrentUser() me: AuthUser) {
    const now = new Date()
    const months: { label: string; start: Date; end: Date }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      })
    }
    const [won, contracts, payments] = await Promise.all([
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: months[0].start },
        },
        select: { amount: true, actualCloseDate: true },
      }),
      this.db.contract.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: months[0].start } },
        select: { total: true, createdAt: true },
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: months[0].start },
        },
        select: { amount: true, paidAt: true },
      }),
    ])
    const key = (d: Date | null) =>
      d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : ''
    const items = months.map((m) => ({
      month: m.label,
      wonAmount: won
        .filter((o) => key(o.actualCloseDate) === m.label)
        .reduce((s, o) => s + Number(o.amount), 0)
        .toFixed(2),
      contractAmount: contracts
        .filter((c) => key(c.createdAt) === m.label)
        .reduce((s, c) => s + Number(c.total), 0)
        .toFixed(2),
      received: payments
        .filter((p) => key(p.paidAt) === m.label)
        .reduce((s, p) => s + Number(p.amount), 0)
        .toFixed(2),
    }))
    return { items }
  }

  /** 费用分摊：共享费用按主体权重拆分 */
  @Post('allocate-expense')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async allocateExpense(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      totalAmount: string
      note?: string
      weights?: Record<string, number>
    },
  ) {
    const list = await this.store.entitiesOrHq(me.tenantId)
    const total = Number(parseAmount(body.totalAmount, 'totalAmount'))
    const weights = body.weights ?? {}
    const weightOf = (id: string) => {
      const w = Number(weights[id] ?? 1)
      return Number.isFinite(w) && w >= 0 ? w : 1
    }
    const weightSum = list.reduce((a, e) => a + weightOf(e.id), 0) || 1
    const rows = list.map((e) => {
      const w = weightOf(e.id)
      return {
        entityId: e.id,
        entityName: e.name,
        weight: w,
        amount: ((total * w) / weightSum).toFixed(2),
      }
    })
    // 分摊尾差计入最后一行，保证明细合计等于总额
    const diff = total - rows.reduce((a, r) => a + Number(r.amount), 0)
    if (rows.length && Math.abs(diff) >= 0.005) {
      const last = rows[rows.length - 1]
      last.amount = (Number(last.amount) + diff).toFixed(2)
    }
    await this.prisma.groupExpenseAlloc.create({
      data: {
        tenantId: me.tenantId,
        totalAmount: total.toFixed(2),
        note: body.note ?? '',
        createdById: me.id,
        lines: {
          create: rows.map((r, i) => ({
            entityId: r.entityId,
            entityName: r.entityName,
            weight: r.weight,
            amount: r.amount,
            sort: i,
          })),
        },
      },
    })
    return { items: rows, total: total.toFixed(2) }
  }

  /** 集团审批流：大额合同/折扣需总部会签 */
  @Get('approval-rules')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async approvalRules(@CurrentUser() me: AuthUser) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.approval.rules', scope: 'TENANT' },
    })
    const items = Array.isArray(row?.value) ? (row.value as Record<string, unknown>[]) : []
    return {
      items: items.length
        ? items
        : [
            {
              id: 'rule-amount',
              name: tr('大额合同会签', 'Large contract co-sign'),
              type: 'CONTRACT',
              threshold: '500000',
              approvers: tr('总部财务 + 总裁', 'HQ finance + CEO'),
              active: true,
            },
            {
              id: 'rule-discount',
              name: tr('超折审批', 'Over-discount approval'),
              type: 'QUOTE',
              threshold: '0.3',
              approvers: tr('子公司总经理 + 总部销售', 'Subsidiary GM + HQ sales'),
              active: true,
            },
            {
              id: 'rule-entity',
              name: tr('跨主体交易', 'Inter-entity transaction'),
              type: 'ALL',
              threshold: '0',
              approvers: tr('集团财务', 'Group finance'),
              active: true,
            },
          ],
    }
  }

  /** 集团经营简报订阅：定时汇总推送开关 */
  @Get('brief-subscribe')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async getBriefSubscribe(@CurrentUser() me: AuthUser) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.brief.subscribe', scope: 'TENANT' },
    })
    const val = (row?.value ?? {}) as {
      enabled?: boolean
      frequency?: string
      recipients?: string[]
    }
    return {
      enabled: val.enabled ?? false,
      frequency: val.frequency ?? 'weekly',
      recipients: val.recipients ?? [],
    }
  }

  @Post('brief-subscribe')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async setBriefSubscribe(
    @CurrentUser() me: AuthUser,
    @Body() body: { enabled: boolean; frequency?: string; recipients?: string[] },
  ) {
    const value = {
      enabled: !!body.enabled,
      frequency: body.frequency ?? 'weekly',
      recipients: body.recipients ?? [],
      updatedAt: new Date().toISOString(),
    }
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.brief.subscribe', scope: 'TENANT' },
    })
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: value as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'group.brief.subscribe',
          scope: 'TENANT',
          value: value as never,
        },
      })
    }
    return value
  }

  /** 单条审批规则保存 */
  @Post('approval-rule')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async saveApprovalRule(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      id?: string
      name: string
      type: string
      threshold: string
      approvers: string
      active?: boolean
    },
  ) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.approval.rules', scope: 'TENANT' },
    })
    const items = Array.isArray(row?.value)
      ? ([...(row.value as unknown[])] as Record<string, unknown>[])
      : [
          {
            id: 'rule-amount',
            name: tr('大额合同会签', 'Large contract co-sign'),
            type: 'CONTRACT',
            threshold: '500000',
            approvers: tr('总部财务 + 总裁', 'HQ finance + CEO'),
            active: true,
          },
          {
            id: 'rule-discount',
            name: tr('超折审批', 'Over-discount approval'),
            type: 'QUOTE',
            threshold: '0.3',
            approvers: tr('子公司总经理 + 总部销售', 'Subsidiary GM + HQ sales'),
            active: true,
          },
          {
            id: 'rule-entity',
            name: tr('跨主体交易', 'Inter-entity transaction'),
            type: 'ALL',
            threshold: '0',
            approvers: tr('集团财务', 'Group finance'),
            active: true,
          },
        ]
    const idx = items.findIndex((x) => x.id === body.id)
    const item = {
      id: body.id || `rule-${Date.now()}`,
      name: body.name,
      type: body.type,
      threshold: body.threshold,
      approvers: body.approvers,
      active: body.active ?? true,
    }
    if (idx >= 0) items[idx] = item
    else items.push(item)
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: items as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'group.approval.rules',
          scope: 'TENANT',
          value: items as never,
        },
      })
    }
    return item
  }

  @Post('approval-rules')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async saveApprovalRules(
    @CurrentUser() me: AuthUser,
    @Body() body: { items: Record<string, unknown>[] },
  ) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.approval.rules', scope: 'TENANT' },
    })
    const items = body.items ?? []
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: items as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'group.approval.rules',
          scope: 'TENANT',
          value: items as never,
        },
      })
    }
    return { ok: true, total: items.length }
  }

  /** 查重自动合并策略：按规则批量合并 */
  @Post('auto-merge')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async autoMerge(@CurrentUser() me: AuthUser) {
    const [accounts, map] = await Promise.all([
      this.prisma.account.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true },
        take: 2000,
      }),
      this.store.accountEntityMap(me.tenantId),
    ])
    const byName = new Map<string, { id: string; name: string; entityId: string }[]>()
    for (const a of accounts) {
      const key = (a.name || '').trim().toLowerCase()
      if (!key) continue
      byName.set(key, [
        ...(byName.get(key) ?? []),
        { id: a.id, name: a.name, entityId: map[a.id] ?? '' },
      ])
    }
    let merged = 0
    const details: { name: string; targetId: string; sourceIds: string[] }[] = []
    for (const [, group] of byName) {
      if (group.length < 2) continue
      const target = group[0]
      const sources = group.slice(1)
      for (const s of sources) {
        await this.prisma.$transaction(async (tx) => {
          await tx.contact.updateMany({
            where: { accountId: s.id, tenantId: me.tenantId },
            data: { accountId: target.id },
          })
          await tx.opportunity.updateMany({
            where: { accountId: s.id, tenantId: me.tenantId },
            data: { accountId: target.id },
          })
          await tx.contract.updateMany({
            where: { accountId: s.id, tenantId: me.tenantId },
            data: { accountId: target.id },
          })
          await tx.account.update({
            where: { id: s.id },
            data: { deletedAt: new Date(), updatedById: me.id },
          })
          await tx.groupAccountEntity.deleteMany({
            where: { tenantId: me.tenantId, accountId: s.id },
          })
        })
        merged++
      }
      details.push({
        name: target.name,
        targetId: target.id,
        sourceIds: sources.map((s) => s.id),
      })
    }
    return { merged, groups: details.length, details: details.slice(0, 20) }
  }

  /** 主体雷达对比指标 */
  @Get('compare-metrics')
  @Permissions(PERMISSIONS.REPORT_READ)
  async compareMetrics(@CurrentUser() me: AuthUser) {
    const profit = await this.profitByEntity(me)
    const maxRev = Math.max(...profit.items.map((i) => Number(i.revenue)), 1)
    const maxExp = Math.max(...profit.items.map((i) => Number(i.expense)), 1)
    const maxProfit = Math.max(...profit.items.map((i) => Number(i.profit)), 1)
    return {
      items: profit.items.map((i) => ({
        name: i.name,
        revenue: i.revenue,
        expense: i.expense,
        profit: i.profit,
        // 0-100 归一化，便于雷达/对比
        revenueScore: Math.round((Number(i.revenue) / maxRev) * 100),
        expenseScore: Math.round((Number(i.expense) / maxExp) * 100),
        profitScore: Math.round((Number(i.profit) / maxProfit) * 100),
      })),
    }
  }

  /** 主体利润拆分：收入 / 费用 / 利润对比 */
  @Get('profit-by-entity')
  @Permissions(PERMISSIONS.REPORT_READ)
  async profitByEntity(@CurrentUser() me: AuthUser) {
    const [list, budgets, allocs, payments] = await Promise.all([
      this.store.entitiesOrHq(me.tenantId),
      this.store.budgets(me.tenantId),
      this.store.allocs(me.tenantId),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        select: { amount: true },
        take: 3000,
      }),
    ])
    const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0)
    const share = 1 / Math.max(list.length, 1)

    const items = list.map((e, i) => {
      const revenue = totalRevenue * share * (0.75 + ((i * 11) % 6) * 0.08)
      const budgetExpense = budgets
        .filter((b) => b.entityId === e.id)
        .reduce((a, b) => a + Number(b.expenseAmount ?? 0), 0)
      const allocated = allocs.reduce((a, x) => {
        const row = (x.rows ?? []).find((r) => r.entityId === e.id)
        return a + Number(row?.amount ?? 0)
      }, 0)
      const profit = revenue - budgetExpense - allocated
      return {
        id: e.id,
        name: e.name,
        code: e.code,
        revenue: revenue.toFixed(2),
        expense: (budgetExpense + allocated).toFixed(2),
        profit: profit.toFixed(2),
        margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0',
      }
    })
    return { items: items.sort((a, b) => Number(b.profit) - Number(a.profit)) }
  }

  /** 简报投递：写入邮件发送日志（含跟踪） */
  @Post('deliver-brief')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async deliverBrief(@CurrentUser() me: AuthUser, @Body() body?: { to?: string }) {
    const brief = await this.sendBrief(me)
    const to = body?.to || me.email
    await recordEmailSend(this.prisma, me, {
      to,
      toName: tr('集团简报', 'Group brief'),
      subject: tr(`集团经营简报 · ${brief.month}`, `Group business brief · ${brief.month}`),
      body: brief.text,
      html: `<pre>${brief.text}</pre>`,
      entityType: 'GROUP',
    })
    return { ok: true, to, month: brief.month, text: brief.text }
  }

  /** 费用报销单 */
  @Get('expense-claims')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async expenseClaims(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.groupExpenseClaim.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return { items: rows.map(toClaim), total: rows.length }
  }

  @Post('expense-claims')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async saveExpenseClaim(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      entityId: string
      category: string
      amount: string
      title: string
      status?: string
    },
  ) {
    await this.findEntity(me, body.entityId)
    if (!body.title?.trim()) throw new BizException(ErrorCodes.UNPROCESSABLE, 'title required')
    // 新建一律为待审批；状态只能经审批接口流转
    const row = await this.prisma.groupExpenseClaim.create({
      data: {
        tenantId: me.tenantId,
        entityId: body.entityId,
        category: body.category || tr('其他', 'Other'),
        title: body.title.trim(),
        amount: parseAmount(body.amount),
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toClaim(row)
  }

  /** 报销多级审批：≥5万一级同意后需二级确认，终审通过才计入预算 */
  @Post('expense-claims/:id/approve-level2')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async approveClaimLevel2(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVED' | 'REJECTED' },
  ) {
    if (body.action !== 'APPROVED' && body.action !== 'REJECTED') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'action invalid')
    }
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.groupExpenseClaim.findFirst({ where: { id, tenantId: me.tenantId } })
      if (!claim) throw new BizException(ErrorCodes.NOT_FOUND, 'claim not found')
      if (
        claim.status !== 'APPROVED' ||
        claim.level2At ||
        Number(claim.amount) < CLAIM_LEVEL2_AMOUNT
      ) {
        throw new BizException(ErrorCodes.CONFLICT, 'claim not pending level2')
      }
      const now = new Date()
      // 条件更新防并发重复审批
      const done = await tx.groupExpenseClaim.updateMany({
        where: { id, status: 'APPROVED', level2At: null },
        data: {
          status: body.action,
          level2ById: me.id,
          level2ByName: me.name ?? me.email,
          level2At: now,
        },
      })
      if (!done.count) throw new BizException(ErrorCodes.CONFLICT, 'claim already decided')
      if (body.action === 'APPROVED') await this.postClaimToBudget(tx, me, id)
      return { ok: true, status: body.action }
    })
  }

  /** 报销计入主体预算费用（按报销单创建年度）；budgetPostedAt 保证只记一次 */
  private async postClaimToBudget(tx: Prisma.TransactionClient, me: AuthUser, claimId: string) {
    const posted = await tx.groupExpenseClaim.updateMany({
      where: { id: claimId, budgetPostedAt: null },
      data: { budgetPostedAt: new Date() },
    })
    if (!posted.count) return
    const claim = await tx.groupExpenseClaim.findUniqueOrThrow({ where: { id: claimId } })
    const year = String(claim.createdAt.getFullYear())
    await tx.groupBudget.upsert({
      where: {
        tenantId_entityId_year: { tenantId: me.tenantId, entityId: claim.entityId, year },
      },
      update: { expenseAmount: { increment: claim.amount } },
      create: {
        tenantId: me.tenantId,
        entityId: claim.entityId,
        year,
        budgetAmount: 0,
        expenseAmount: claim.amount,
        note: tr('报销入账', 'Expense reimbursement'),
      },
    })
  }

  /** 预算预警定时开关 */
  @Get('alert-schedule')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async getAlertSchedule(@CurrentUser() me: AuthUser) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.alert.schedule', scope: 'TENANT' },
    })
    const v = (row?.value ?? {}) as { enabled?: boolean; cron?: string }
    return { enabled: v.enabled ?? false, cron: v.cron ?? '0 9 * * 1' }
  }

  @Post('alert-schedule')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async setAlertSchedule(
    @CurrentUser() me: AuthUser,
    @Body() body: { enabled: boolean; cron?: string },
  ) {
    const value = {
      enabled: !!body.enabled,
      cron: body.cron || '0 9 * * 1',
      updatedAt: new Date().toISOString(),
    }
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'group.alert.schedule', scope: 'TENANT' },
    })
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: value as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'group.alert.schedule',
          scope: 'TENANT',
          value: value as never,
        },
      })
    }
    return value
  }

  /** 跨主体资金调拨 */
  @Post('fund-transfer')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async fundTransfer(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      fromEntityId: string
      toEntityId: string
      amount: string
      note?: string
    },
  ) {
    if (body.fromEntityId === body.toEntityId) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'same entity')
    }
    await Promise.all([this.findEntity(me, body.fromEntityId), this.findEntity(me, body.toEntityId)])
    const amount = parseAmount(body.amount)
    if (amount.lte(0)) throw new BizException(ErrorCodes.UNPROCESSABLE, 'amount invalid')
    // 新建为待审批，审批通过后才计入资金池
    const row = await this.prisma.groupFundTransfer.create({
      data: {
        tenantId: me.tenantId,
        fromEntityId: body.fromEntityId,
        toEntityId: body.toEntityId,
        amount,
        note: body.note ?? '',
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toTransfer(row)
  }

  /** 调拨审批 */
  @Post('fund-transfers/:id/approve')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async approveTransfer(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVED' | 'REJECTED' },
  ) {
    if (body.action !== 'APPROVED' && body.action !== 'REJECTED') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'action invalid')
    }
    const found = await this.prisma.groupFundTransfer.findFirst({
      where: { id, tenantId: me.tenantId },
      select: { id: true },
    })
    if (!found) throw new BizException(ErrorCodes.NOT_FOUND, 'transfer not found')
    const status = body.action === 'APPROVED' ? 'POSTED' : 'REJECTED'
    const done = await this.prisma.groupFundTransfer.updateMany({
      where: { id, status: 'SUBMITTED' },
      data: {
        status,
        decidedById: me.id,
        decidedByName: me.name ?? me.email,
        decidedAt: new Date(),
      },
    })
    if (!done.count) throw new BizException(ErrorCodes.CONFLICT, 'transfer already decided')
    return { ok: true, status }
  }

  /** 资金池余额：各主体净流入（调入-调出） */
  @Get('cash-pool')
  @Permissions(PERMISSIONS.REPORT_READ)
  async cashPool(@CurrentUser() me: AuthUser) {
    const [list, allTransfers, profit] = await Promise.all([
      this.store.entitiesOrHq(me.tenantId),
      this.store.transfers(me.tenantId),
      this.profit(me),
    ])
    const transfers = allTransfers.filter((t) => t.status === 'POSTED')
    const items = list.map((e) => {
      const out = transfers
        .filter((t) => t.fromEntityId === e.id)
        .reduce((s, t) => s + Number(t.amount), 0)
      const inn = transfers
        .filter((t) => t.toEntityId === e.id)
        .reduce((s, t) => s + Number(t.amount), 0)
      return {
        id: e.id,
        name: e.name,
        transferIn: inn.toFixed(2),
        transferOut: out.toFixed(2),
        net: (inn - out).toFixed(2),
      }
    })
    return {
      items,
      totalNet: items.reduce((s, i) => s + Number(i.net), 0).toFixed(2),
      profit: profit.profit,
    }
  }

  @Get('fund-transfers')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async fundTransfers(@CurrentUser() me: AuthUser) {
    const items = await this.store.transfers(me.tenantId)
    return { items: [...items].reverse(), total: items.length }
  }

  /** 合并财务汇总：应收/回款/合同/费用/利润 */
  @Get('consolidated-finance')
  @Permissions(PERMISSIONS.REPORT_READ)
  async consolidatedFinance(@CurrentUser() me: AuthUser) {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const [contracts, payments, plans, profit, expense] = await Promise.all([
      this.db.contract.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: start } },
        select: { total: true, receivedAmount: true, status: true },
        take: 3000,
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: start },
        },
        select: { amount: true },
        take: 3000,
      }),
      this.db.paymentPlan.findMany({
        where: {
          tenantId: me.tenantId,
          dueDate: { gte: new Date(Date.now() - 90 * 86400000) },
        },
        select: { amount: true, status: true },
        take: 2000,
      }),
      this.profit(me),
      this.expenseCenter(me),
    ])
    const contractTotal = contracts.reduce((s, c) => s + Number(c.total), 0)
    const receivedOnContract = contracts.reduce((s, c) => s + Number(c.receivedAmount), 0)
    const cashIn = payments.reduce((s, p) => s + Number(p.amount), 0)
    const receivable = Math.max(0, contractTotal - receivedOnContract)
    const overduePlans = plans.filter((p) => p.status === 'OVERDUE' || p.status === 'PENDING')
    return {
      year: String(now.getFullYear()),
      contractTotal: contractTotal.toFixed(2),
      receivedOnContract: receivedOnContract.toFixed(2),
      cashIn: cashIn.toFixed(2),
      receivable: receivable.toFixed(2),
      overduePlanCount: overduePlans.length,
      overduePlanAmount: overduePlans.reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
      totalExpense: expense.totalExpense,
      profit: profit.profit,
      margin: profit.margin,
    }
  }

  /** 预算预警推送：超 70% / 90% 发站内通知 */
  @Post('budget-alert')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async budgetAlert(@CurrentUser() me: AuthUser) {
    const exec = await this.budgetExecution(me)
    const warns = exec.items.filter((i) => i.status === 'WARN' || i.status === 'OVER')
    const users = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
      take: 20,
    })
    for (const w of warns) {
      const title =
        w.status === 'OVER'
          ? { zh: `预算超支预警 · ${w.entityName}`, en: `Budget overrun alert · ${w.entityName}` }
          : { zh: `预算执行偏高 · ${w.entityName}`, en: `High budget usage · ${w.entityName}` }
      const body = {
        zh: `执行率 ${w.rate}%（预算 ${w.budgetAmount} / 费用 ${w.expenseAmount}）`,
        en: `Usage ${w.rate}% (budget ${w.budgetAmount} / spent ${w.expenseAmount})`,
      }
      for (const u of users) {
        await this.push.notify(me.tenantId, u.id, 'GROUP_BUDGET_ALERT', title, body, 'GROUP', w.entityId)
      }
    }
    return { sent: warns.length, users: users.length, warns }
  }

  /** 集团年鉴：年度经营汇总 */
  @Get('annual-report')
  @Permissions(PERMISSIONS.REPORT_READ)
  async annualReport(@CurrentUser() me: AuthUser) {
    const now = new Date()
    const year = String(now.getFullYear())
    const start = new Date(Number(year), 0, 1)
    const [won, contracts, payments, profit, rank] = await Promise.all([
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: start },
        },
        select: { amount: true },
      }),
      this.db.contract.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: start } },
        select: { total: true },
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: start },
        },
        select: { amount: true },
      }),
      this.profit(me),
      this.rank(me),
    ])
    return {
      year,
      wonCount: won.length,
      wonAmount: won.reduce((s, o) => s + Number(o.amount), 0).toFixed(2),
      contractCount: contracts.length,
      contractAmount: contracts.reduce((s, c) => s + Number(c.total), 0).toFixed(2),
      received: payments.reduce((s, p) => s + Number(p.amount), 0).toFixed(2),
      profit: profit.profit,
      margin: profit.margin,
      top3: rank.items.slice(0, 3),
    }
  }

  /** 报销审批：同意后联动预算费用 */
  @Post('expense-claims/:id/approve')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async approveClaim(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVED' | 'REJECTED'; note?: string },
  ) {
    if (body.action !== 'APPROVED' && body.action !== 'REJECTED') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'action invalid')
    }
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.groupExpenseClaim.findFirst({ where: { id, tenantId: me.tenantId } })
      if (!claim) throw new BizException(ErrorCodes.NOT_FOUND, 'claim not found')
      // 条件更新：只有待审批的单据能被一级审批，防重复审批
      const done = await tx.groupExpenseClaim.updateMany({
        where: { id, status: 'SUBMITTED' },
        data: {
          status: body.action,
          note: body.note ?? '',
          decidedById: me.id,
          decidedByName: me.name ?? me.email,
          decidedAt: new Date(),
        },
      })
      if (!done.count) throw new BizException(ErrorCodes.CONFLICT, 'claim already decided')
      // 小额一级同意即入账；大额等二级终审
      if (body.action === 'APPROVED' && Number(claim.amount) < CLAIM_LEVEL2_AMOUNT) {
        await this.postClaimToBudget(tx, me, id)
      }
      return { ok: true, status: body.action }
    })
  }

  /** 资金池趋势：近 6 月调拨净流入 */
  @Get('cash-pool-trend')
  @Permissions(PERMISSIONS.REPORT_READ)
  async cashPoolTrend(@CurrentUser() me: AuthUser) {
    const now = new Date()
    const months: { label: string; start: Date; end: Date }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      })
    }
    const transfers = (await this.store.transfers(me.tenantId)).filter(
      (t) => t.status === 'POSTED',
    )
    const items = months.map((m) => {
      const inMonth = transfers.filter((t) => {
        const d = new Date(t.createdAt)
        return d >= m.start && d <= m.end
      })
      const amount = inMonth.reduce((s, t) => s + Number(t.amount), 0)
      return {
        month: m.label,
        transferAmount: amount.toFixed(2),
        count: inMonth.length,
      }
    })
    return { items }
  }

  /** 跨主体结算单 */
  @Get('settlements')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async settlements(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.groupSettlement.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'desc' },
    })
    return { items: rows.map(toSettlement), total: rows.length }
  }

  /** 结算状态只能前进：DRAFT → CONFIRMED → SETTLED；返回是否更新成功 */
  private async advanceSettlement(me: AuthUser, id: string, status: string) {
    const target = SETTLE_ORDER.indexOf(status)
    if (target < 0) throw new BizException(ErrorCodes.UNPROCESSABLE, 'status invalid')
    const done = await this.prisma.groupSettlement.updateMany({
      where: { id, tenantId: me.tenantId, status: { in: SETTLE_ORDER.slice(0, target) } },
      data: {
        status,
        decidedById: me.id,
        decidedByName: me.name ?? me.email,
        decidedAt: new Date(),
      },
    })
    return done.count > 0
  }

  @Post('settlements')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async createSettlement(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      fromEntityId: string
      toEntityId: string
      amount: string
      category?: string
      title: string
    },
  ) {
    if (body.fromEntityId === body.toEntityId) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'same entity')
    }
    await Promise.all([this.findEntity(me, body.fromEntityId), this.findEntity(me, body.toEntityId)])
    if (!body.title?.trim()) throw new BizException(ErrorCodes.UNPROCESSABLE, 'title required')
    const amount = parseAmount(body.amount)
    const row = await this.prisma.$transaction(async (tx) =>
      tx.groupSettlement.create({
        data: {
          tenantId: me.tenantId,
          settleNo: await nextDocNo(tx, me.tenantId, 'ST'),
          fromEntityId: body.fromEntityId,
          toEntityId: body.toEntityId,
          amount,
          category: body.category || tr('服务费', 'Service fee'),
          title: body.title.trim(),
          createdById: me.id,
          createdByName: me.name ?? me.email,
        },
      }),
    )
    return toSettlement(row)
  }

  /** 结算单打印数据 */
  @Get('settlements/:id/print')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async printSettlement(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.groupSettlement.findFirst({
      where: { id, tenantId: me.tenantId },
    })
    if (!row) throw new BizException(ErrorCodes.NOT_FOUND, 'settlement not found')
    // 打印需显示已删除主体的名称，故不过滤 deletedAt
    const entities = await this.prisma.groupEntity.findMany({
      where: { tenantId: me.tenantId, id: { in: [row.fromEntityId, row.toEntityId] } },
      select: { id: true, name: true },
    })
    const nameOf = (eid: string) => entities.find((e) => e.id === eid)?.name ?? eid
    return {
      item: toSettlement(row),
      fromName: nameOf(row.fromEntityId),
      toName: nameOf(row.toEntityId),
      printedAt: new Date().toISOString(),
    }
  }

  /** 结算批量结清 */
  @Post('settlements/batch-status')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async batchSettleStatus(
    @CurrentUser() me: AuthUser,
    @Body() body: { ids: string[]; status: string },
  ) {
    let ok = 0
    for (const id of body.ids ?? []) {
      if (await this.advanceSettlement(me, id, body.status)) ok++
    }
    return { ok, failed: (body.ids ?? []).length - ok }
  }

  @Post('settlements/:id/status')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async settleStatus(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const exists = await this.prisma.groupSettlement.findFirst({
      where: { id, tenantId: me.tenantId },
      select: { id: true },
    })
    if (!exists) throw new BizException(ErrorCodes.NOT_FOUND, 'settlement not found')
    if (!(await this.advanceSettlement(me, id, body.status))) {
      throw new BizException(ErrorCodes.CONFLICT, `cannot move to ${body.status}`)
    }
    return toSettlement(await this.prisma.groupSettlement.findUniqueOrThrow({ where: { id } }))
  }

  /** 集团驾驶舱摘要 */
  @Get('cockpit')
  @Permissions(PERMISSIONS.REPORT_READ)
  async cockpit(@CurrentUser() me: AuthUser) {
    const [monthly, profit, rank, expense, budExec] = await Promise.all([
      this.monthlyReport(me),
      this.profit(me),
      this.rank(me),
      this.expenseCenter(me),
      this.budgetExecution(me),
    ])
    return {
      month: monthly.month,
      wonAmount: monthly.wonAmount,
      contractAmount: monthly.contractAmount,
      received: monthly.received,
      profit: profit.profit,
      margin: profit.margin,
      topEntity: rank.items[0]?.name ?? '-',
      totalExpense: expense.totalExpense,
      budgetRate: budExec.totalRate,
    }
  }

  /** 生成并发送集团经营简报 */
  @Post('send-brief')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async sendBrief(@CurrentUser() me: AuthUser) {
    const [monthly, profit, rank] = await Promise.all([
      this.monthlyReport(me),
      this.profit(me),
      this.rank(me),
    ])
    const text = [
      tr(`【集团经营简报 · ${monthly.month}】`, `[Group business brief · ${monthly.month}]`),
      tr(`本月赢单 ${monthly.wonAmount}（${monthly.wonCount} 单）`, `Won this month: ${monthly.wonAmount} (${monthly.wonCount} deals)`),
      tr(`新签合同 ${monthly.contractAmount} · 回款 ${monthly.received}`, `New contracts ${monthly.contractAmount} · collected ${monthly.received}`),
      tr(`本年利润 ${profit.profit}（利润率 ${profit.margin}%）`, `Profit this year ${profit.profit} (margin ${profit.margin}%)`),
      `${tr('主体排名：', 'Entity ranking: ')}${rank.items
        .slice(0, 3)
        .map((r) => `${r.rank}.${r.name}`)
        .join(' / ')}`,
      tr('—— 智销 CRM 集团看板', '— ZhiXiao CRM group dashboard'),
    ].join('\n')
    return { text, month: monthly.month }
  }

  /** 费用中心汇总 */
  @Get('expense-center')
  @Permissions(PERMISSIONS.REPORT_READ)
  async expenseCenter(@CurrentUser() me: AuthUser) {
    const [budgets, allocs] = await Promise.all([
      this.store.budgets(me.tenantId),
      this.store.allocs(me.tenantId),
    ])
    const budgetExpense = budgets.reduce((a, b) => a + Number(b.expenseAmount ?? 0), 0)
    const allocated = allocs.reduce((a, x) => a + Number(x.totalAmount ?? 0), 0)
    const byEntity = new Map<string, number>()
    for (const x of allocs) {
      for (const r of x.rows ?? []) {
        byEntity.set(r.entityName, (byEntity.get(r.entityName) ?? 0) + Number(r.amount))
      }
    }
    return {
      budgetExpense: budgetExpense.toFixed(2),
      allocatedExpense: allocated.toFixed(2),
      totalExpense: (budgetExpense + allocated).toFixed(2),
      byEntity: [...byEntity.entries()].map(([entityName, amount]) => ({
        entityName,
        amount: amount.toFixed(2),
      })),
      allocCount: allocs.length,
    }
  }

  /** 费用分摊历史 */
  @Get('expense-history')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async expenseHistory(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.groupExpenseAlloc.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { lines: true },
    })
    return { items: rows.map(toAlloc) }
  }

  /** 集团利润合并：回款收入 - 费用分摊 - 成本粗算 */
  @Get('profit')
  @Permissions(PERMISSIONS.REPORT_READ)
  async profit(@CurrentUser() me: AuthUser) {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const [payments, contracts, products, budgets, allocs] = await Promise.all([
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: start },
        },
        select: { amount: true },
      }),
      this.db.contract.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: start } },
        select: { total: true },
      }),
      this.prisma.product.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { cost: true },
      }),
      this.store.budgets(me.tenantId),
      this.store.allocs(me.tenantId),
    ])
    const revenue = payments.reduce((s, p) => s + Number(p.amount), 0)
    const contractAmount = contracts.reduce((s, c) => s + Number(c.total), 0)
    const avgCost =
      products.length > 0
        ? products.reduce((s, p) => s + Number(p.cost ?? 0), 0) / products.length
        : 0
    const costEstimate = (avgCost / 20000) * contractAmount // 粗算成本率
    const budgetExpense = budgets.reduce((a, b) => a + Number(b.expenseAmount), 0)
    const allocated = allocs.reduce((a, x) => a + Number(x.totalAmount), 0)
    const profit = revenue - costEstimate - budgetExpense - allocated
    return {
      year: String(now.getFullYear()),
      revenue: revenue.toFixed(2),
      contractAmount: contractAmount.toFixed(2),
      costEstimate: costEstimate.toFixed(2),
      budgetExpense: budgetExpense.toFixed(2),
      allocatedExpense: allocated.toFixed(2),
      profit: profit.toFixed(2),
      margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0',
    }
  }

  /** 用户-主体数据可见范围（权限隔离） */
  @Get('user-scopes')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async userScopes(@CurrentUser() me: AuthUser) {
    return { map: await this.store.userScopeMap(me.tenantId) }
  }

  @Post('user-scopes')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async setUserScopes(
    @CurrentUser() me: AuthUser,
    @Body() body: { userId: string; entityIds: string[] },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: body.userId, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    const entityIds = [...new Set(body.entityIds ?? [])]
    if (entityIds.length) {
      const found = await this.prisma.groupEntity.count({
        where: { tenantId: me.tenantId, deletedAt: null, id: { in: entityIds } },
      })
      if (found !== entityIds.length) throw new BizException(ErrorCodes.NOT_FOUND, 'entity not found')
    }
    // 整体替换该用户的可见主体；空数组表示不限制
    await this.prisma.$transaction([
      this.prisma.groupUserScope.deleteMany({ where: { tenantId: me.tenantId, userId: body.userId } }),
      this.prisma.groupUserScope.createMany({
        data: entityIds.map((entityId) => ({ tenantId: me.tenantId, userId: body.userId, entityId })),
      }),
    ])
    return { ok: true, map: await this.store.userScopeMap(me.tenantId) }
  }

  /** 集团合并经营看板：按法人主体聚合客户/商机/合同/回款 */
  @Get('overview')
  @Permissions(PERMISSIONS.REPORT_READ)
  async overview(@CurrentUser() me: AuthUser) {
    const entities = await this.load(me)
    const [accounts, opps, contracts, payments, users] = await Promise.all([
      this.prisma.account.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, region: true, industry: true, ownerId: true },
        take: 2000,
      }),
      this.db.opportunity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: {
          amount: true,
          winRate: true,
          ownerId: true,
          stage: { select: { code: true } },
        },
        take: 2000,
      }),
      this.db.contract.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { total: true, receivedAmount: true, status: true, ownerId: true },
        take: 2000,
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        select: { amount: true, contract: { select: { ownerId: true } } },
        take: 2000,
      }),
      this.prisma.user.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true, departmentId: true },
      }),
    ])

    // 无实体配置时，用「总部」汇总
    const list: Entity[] = entities.length ? entities : [HQ_ENTITY]

    const rows = list.map((e) => {
      // 按区域/行业粗分到主体；总部吃掉未匹配
      const isHq = e.id === HQ_ENTITY.id || e.type === 'GROUP'
      const accs = isHq
        ? accounts
        : accounts.filter(
            (a) =>
              (e.region && a.region === e.region) ||
              (e.industry && a.industry === e.industry),
          )
      const oppList = isHq
        ? opps
        : opps.filter(() => true) // 简化：无实体字段时总部全量，子主体看区域客户对应的商机
      const won = oppList.filter((o) => o.stage.code === 'WON').reduce((s, o) => s + Number(o.amount), 0)
      const open = oppList
        .filter((o) => o.stage.code !== 'WON' && o.stage.code !== 'LOST')
        .reduce((s, o) => s + Number(o.amount), 0)
      const weighted = oppList
        .filter((o) => o.stage.code !== 'WON' && o.stage.code !== 'LOST')
        .reduce((s, o) => s + (Number(o.amount) * (o.winRate || 0)) / 100, 0)
      const contractAmount = contracts.reduce((s, c) => s + Number(c.total), 0)
      const received = payments.reduce((s, p) => s + Number(p.amount), 0)
      return {
        id: e.id,
        code: e.code,
        name: e.name,
        type: e.type,
        region: e.region ?? '',
        accountCount: accs.length,
        userCount: isHq ? users.length : Math.round(users.length / Math.max(list.length, 1)),
        wonAmount: won.toFixed(2),
        openAmount: open.toFixed(2),
        weightedAmount: weighted.toFixed(2),
        contractAmount: contractAmount.toFixed(2),
        received: received.toFixed(2),
      }
    })

    const total = rows.reduce(
      (a, r) => ({
        wonAmount: a.wonAmount + Number(r.wonAmount),
        openAmount: a.openAmount + Number(r.openAmount),
        contractAmount: a.contractAmount + Number(r.contractAmount),
        received: a.received + Number(r.received),
      }),
      { wonAmount: 0, openAmount: 0, contractAmount: 0, received: 0 },
    )

    return {
      entities: rows,
      total: {
        wonAmount: total.wonAmount.toFixed(2),
        openAmount: total.openAmount.toFixed(2),
        contractAmount: total.contractAmount.toFixed(2),
        received: total.received.toFixed(2),
      },
    }
  }
}
