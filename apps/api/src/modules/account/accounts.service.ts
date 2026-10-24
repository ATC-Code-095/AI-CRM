import { Injectable } from '@nestjs/common'
import { BizException, ErrorCodes, PageResult } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { canReadRowWithShare, scopeWhere } from '../../common/data-scope'
import { entityVisibleAccountIds, withAccountEntityScope } from '../../common/entity-scope'
import { writeAudit } from '../../common/audit'
import { PrismaService } from '../../common/prisma/prisma.service'
import { sysLabel, tr } from '../../common/locale'

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    me: AuthUser,
    page: number,
    pageSize: number,
    q?: string,
  ): Promise<PageResult<unknown>> {
    const shared = await this.prisma.entityShare.findMany({
      where: { tenantId: me.tenantId, entityType: 'ACCOUNT', userId: me.id },
      select: { entityId: true },
    })
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      AND: [
        {
          OR: [
            ...(((scopeWhere(me, 'ownerId') as { OR?: unknown[] }).OR ?? []) as unknown[]),
            ...(shared.length
              ? [{ id: { in: shared.map((s) => s.entityId) } }]
              : []),
          ],
        },
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { shortName: { contains: q, mode: 'insensitive' as const } },
                  { phone: { contains: q } },
                ],
              },
            ]
          : []),
      ],
    } as never
    const visibleIds = await entityVisibleAccountIds(this.prisma, me.tenantId, me.id)
    const scopedWhere = withAccountEntityScope(where as Record<string, unknown>, visibleIds) as never
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.account.count({ where: scopedWhere }),
      this.prisma.account.findMany({
        where: scopedWhere,
        skip: (p - 1) * size,
        take: size,
        orderBy: { createdAt: 'desc' },
        include: {
          contacts: {
            where: { deletedAt: null, isPrimary: true },
            take: 1,
            select: { id: true, name: true, mobile: true },
          },
        },
      }),
    ])
    return { items, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  async detail(me: AuthUser, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      include: {
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
        parentAccount: {
          select: { id: true, name: true, level: true, stage: true },
        },
        childAccounts: {
          where: { deletedAt: null },
          select: { id: true, name: true, level: true, stage: true },
          take: 20,
        },
      },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    const ok = await canReadRowWithShare(this.prisma, me, account as never, 'ACCOUNT')
    if (!ok) {
      throw new BizException(ErrorCodes.DATA_FORBIDDEN, 'no data access')
    }
    return account
  }

  /** 决策链：联系人 + 影响力（Setting） + 角色覆盖统计 */
  async decisionChain(me: AuthUser, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    const [contacts] = await Promise.all([
      this.prisma.contact.findMany({
        where: { tenantId: me.tenantId, accountId, deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          title: true,
          mobile: true,
          phone: true,
          email: true,
          decisionRole: true,
          isPrimary: true,
          influence: true,
          createdAt: true,
        },
      }),
    ])
    const items = contacts
    const roleCount: Record<string, number> = {}
    let influenceSum = 0
    let influenceCount = 0
    for (const c of items) {
      const role = c.decisionRole ?? (c.isPrimary ? 'ECONOMIC' : 'OTHER')
      roleCount[role] = (roleCount[role] ?? 0) + 1
      if (c.influence != null) {
        influenceSum += c.influence
        influenceCount++
      }
    }
    return {
      accountId,
      accountName: account.name,
      items,
      total: items.length,
      roleCount,
      avgInfluence: influenceCount ? (influenceSum / influenceCount).toFixed(1) : '0',
      hasEconomic: Boolean(roleCount.ECONOMIC),
      hasChampion: Boolean(roleCount.CHAMPION),
    }
  }

  /** 客户层级树：以某客户为根，向上找父链、向下找子客户 */
  async hierarchy(me: AuthUser, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, parentAccountId: true, level: true, stage: true },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')

    // 向上
    const ancestors: Array<{ id: string; name: string; level: string; stage: string }> = []
    let cur = account.parentAccountId
    const seen = new Set<string>([id])
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const p = await this.prisma.account.findFirst({
        where: { id: cur, tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true, parentAccountId: true, level: true, stage: true },
      })
      if (!p) break
      ancestors.unshift({ id: p.id, name: p.name, level: p.level, stage: p.stage })
      cur = p.parentAccountId
    }

    // 向下递归两层
    const collect = async (parentId: string, depth = 0): Promise<unknown[]> => {
      if (depth > 2) return []
      const kids = await this.prisma.account.findMany({
        where: { parentAccountId: parentId, tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true, level: true, stage: true },
      })
      return Promise.all(
        kids.map(async (k) => ({
          ...k,
          children: await collect(k.id, depth + 1),
        })),
      )
    }
    const children = await collect(id)

    return {
      root: account,
      ancestors,
      children,
    }
  }

  async overview(me: AuthUser, id: string) {
    const account = await this.detail(me, id)
    const [opportunities, contracts, payments, tickets, openActivities] = await Promise.all([
      this.prisma.opportunity.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        include: { stage: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.contract.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.payment.findMany({
        where: { tenantId: me.tenantId, contract: { accountId: id }, deletedAt: null },
        orderBy: { paidAt: 'desc' },
        take: 20,
      }),
      this.prisma.ticket.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.activity.findMany({
        where: {
          tenantId: me.tenantId,
          entityType: 'ACCOUNT',
          entityId: id,
          deletedAt: null,
          status: 'PLANNED',
        },
        orderBy: { dueAt: 'asc' },
        take: 10,
      }),
    ])

    const openOppAmount = opportunities
      .filter((o) => !o.stage.isClosing)
      .reduce((s, o) => s + Number(o.amountBase), 0)
    // 汇总指标按本位币（单据可能是不同币种）
    const totalContract = contracts
      .filter((c) => c.status === 'EFFECTIVE' || c.status === 'FINISHED')
      .reduce((s, c) => s + Number(c.totalBase), 0)
    const totalReceived = payments
      .filter((p) => p.status === 'CONFIRMED' || p.status === 'RECONCILED')
      .reduce((s, p) => s + Number(p.amountBase), 0)

    return {
      account,
      contacts: account.contacts,
      opportunities,
      contracts,
      payments,
      tickets,
      openActivities,
      metrics: {
        totalContract: totalContract.toFixed(2),
        totalReceived: totalReceived.toFixed(2),
        openOppAmount: openOppAmount.toFixed(2),
        // 360 总览增强
        lifetimeValue: (totalContract + openOppAmount).toFixed(2),
        avgDeal:
          opportunities.length > 0
            ? (
                opportunities.reduce((s, o) => s + Number(o.amountBase), 0) /
                opportunities.length
              ).toFixed(2)
            : '0',
        winRate:
          opportunities.length > 0
            ? (
                (opportunities.filter((o) => o.stage.code === 'WON').length /
                  opportunities.length) *
                100
              ).toFixed(0)
            : '0',
        ticketCount: tickets.length,
        contactCount: account.contacts?.length ?? 0,
        lastActivityAt: account.lastActivityAt?.toISOString() ?? null,
        nextActivityAt: openActivities[0]?.dueAt?.toISOString() ?? null,
      },
    }
  }

  /** 客户旅程：聚合线索转化/商机/合同/回款/跟进/工单时间线 */
  async journey(me: AuthUser, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')

    const [activities, opps, contracts, payments, tickets, contacts] = await Promise.all([
      this.prisma.activity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, OR: [
          { entityType: 'ACCOUNT', entityId: id },
          { entityType: 'OPPORTUNITY', entityId: { in: (
            await this.prisma.opportunity.findMany({
              where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
              select: { id: true },
            })
          ).map((o) => o.id) } },
        ] },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.opportunity.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        include: { stage: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.contract.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.payment.findMany({
        where: { tenantId: me.tenantId, contract: { accountId: id }, deletedAt: null },
        orderBy: { paidAt: 'desc' },
        take: 20,
      }),
      this.prisma.ticket.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.contact.findMany({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const events: Array<{
      at: string
      type: string
      title: string
      detail: string
      stage?: string
    }> = [
      {
        at: account.createdAt.toISOString(),
        type: 'ACCOUNT',
        title: tr('客户创建', 'Account created'),
        detail: tr(`来源客户建立 · 等级 ${account.level}`, `Account created · level ${account.level}`),
      },
      ...contacts.map((c) => ({
        at: c.createdAt.toISOString(),
        type: 'CONTACT',
        title: tr(`联系人建档：${c.name}`, `Contact added: ${c.name}`),
        detail: [c.title, c.mobile, c.email].filter(Boolean).join(' · '),
      })),
      ...activities.map((a) => ({
        at: (a.updatedAt ?? a.createdAt).toISOString(),
        type: 'ACTIVITY',
        title: `${a.type}：${a.subject}`,
        detail: a.content ?? '',
        stage: a.status,
      })),
      ...opps.map((o) => ({
        at: o.createdAt.toISOString(),
        type: 'OPPORTUNITY',
        title: tr(`商机立项：${o.name}`, `Opportunity created: ${o.name}`),
        detail: tr(`金额 ${o.amount} · 阶段 ${o.stage?.name ?? ''}`, `Amount ${o.amount} · stage ${sysLabel(o.stage?.name)}`),
        stage: o.stage?.code,
      })),
      ...contracts.map((c) => ({
        at: (c.signDate ?? c.createdAt).toISOString(),
        type: 'CONTRACT',
        title: tr(`合同：${c.contractNo}`, `Contract: ${c.contractNo}`),
        detail: tr(`${c.title} · 金额 ${c.total} · 状态 ${c.status}`, `${c.title} · amount ${c.total} · status ${c.status}`),
        stage: c.status,
      })),
      ...payments.map((p) => ({
        at: (p.paidAt ?? p.createdAt).toISOString(),
        type: 'PAYMENT',
        title: tr(`回款 ${p.paymentNo ?? ''}`, `Payment ${p.paymentNo ?? ''}`),
        detail: tr(`金额 ${p.amount} · 状态 ${p.status}`, `Amount ${p.amount} · status ${p.status}`),
        stage: p.status,
      })),
      ...tickets.map((t) => ({
        at: t.createdAt.toISOString(),
        type: 'TICKET',
        title: tr(`工单：${t.title}`, `Ticket: ${t.title}`),
        detail: `${t.ticketNo} · ${t.status}`,
        stage: t.status,
      })),
    ]

    events.sort((a, b) => (a.at < b.at ? 1 : -1))

    // 旅程阶段：线索获取 → 首次接触 → 商机 → 成交 → 回款 → 服务
    const milestones = {
      hasContact: contacts.length > 0,
      hasActivity: activities.length > 0,
      hasOpp: opps.length > 0,
      hasContract: contracts.length > 0,
      hasPayment: payments.some((p) => p.status === 'CONFIRMED' || p.status === 'RECONCILED'),
      hasService: tickets.length > 0,
    }

    return {
      account: { id: account.id, name: account.name, stage: account.stage, level: account.level },
      milestones,
      events: events.slice(0, 80),
    }
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    const name = (data.name as string).trim()
    return this.prisma.account
      .create({
        data: {
          tenantId: me.tenantId,
          name,
          shortName: (data.shortName as string) ?? null,
          industry: (data.industry as string) ?? null,
          phone: (data.phone as string) ?? null,
          website: (data.website as string) ?? null,
          address: (data.address as string) ?? null,
          region: (data.region as string) ?? null,
          level: (data.level as string) ?? 'C',
          stage: 'POTENTIAL',
          parentAccountId: (data.parentAccountId as string) ?? null,
          ownerId: me.id,
          departmentId: me.departmentId,
          remark: (data.remark as string) ?? null,
          createdById: me.id,
          updatedById: me.id,
        },
      })
      .then(async (row) => {
        await writeAudit(this.prisma, {
          tenantId: me.tenantId,
          userId: me.id,
          action: 'CREATE',
          entity: 'ACCOUNT',
          entityId: row.id,
          after: { name: row.name, level: row.level },
        })
        return row
      })
  }

  async update(me: AuthUser, id: string, data: Record<string, unknown>) {
    const before = await this.detail(me, id)
    const patch: Record<string, unknown> = {}
    for (const k of [
      'name',
      'industry',
      'phone',
      'website',
      'address',
      'level',
      'stage',
      'remark',
      'shortName',
      'region',
    ]) {
      if (data[k] !== undefined) patch[k] = data[k]
    }
    if (data.parentAccountId !== undefined) {
      const parentId = (data.parentAccountId as string) || null
      if (parentId && parentId === id) {
        throw new BizException(ErrorCodes.UNPROCESSABLE, tr('不能将自己设为上级客户', 'An account cannot be its own parent'))
      }
      patch.parentAccountId = parentId
    }
    if (data.customValues !== undefined) patch.customValues = data.customValues as never
    patch.updatedById = me.id
    return this.prisma.account
      .update({ where: { id }, data: patch as never })
      .then(async (row) => {
        await writeAudit(this.prisma, {
          tenantId: me.tenantId,
          userId: me.id,
          action: 'UPDATE',
          entity: 'ACCOUNT',
          entityId: id,
          before: { name: before.name, stage: before.stage, level: before.level },
          after: { name: row.name, stage: row.stage, level: row.level },
        })
        return row
      })
  }

  async remove(me: AuthUser, id: string) {
    await this.detail(me, id)
    const [openOpp, openContract] = await Promise.all([
      this.prisma.opportunity.count({
        where: { tenantId: me.tenantId, accountId: id, deletedAt: null, stage: { isClosing: false } },
      }),
      this.prisma.contract.count({
        where: {
          tenantId: me.tenantId,
          accountId: id,
          deletedAt: null,
          status: { in: ['DRAFT', 'APPROVING', 'EFFECTIVE'] },
        },
      }),
    ])
    if (openOpp > 0 || openContract > 0) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'account has open opportunity/contract')
    }
    await this.prisma.account.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: me.id, updatedById: me.id },
    })
    return { ok: true }
  }

  /** 批量分配负责人 */
  async batchAssign(me: AuthUser, ids: string[], ownerId: string) {
    const list = (ids ?? []).filter(Boolean).slice(0, 200)
    if (!list.length) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'ids required')
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!owner) throw new BizException(ErrorCodes.NOT_FOUND, 'owner not found')
    const res = await this.prisma.account.updateMany({
      where: { id: { in: list }, tenantId: me.tenantId, deletedAt: null },
      data: { ownerId, updatedById: me.id },
    })
    return { ok: res.count, failed: list.length - res.count, action: 'assign' }
  }

  /** 批量删除：逐条复用 remove 的业务校验（存在开放商机/合同则跳过） */
  async batchRemove(me: AuthUser, ids: string[]) {
    const list = (ids ?? []).filter(Boolean).slice(0, 200)
    if (!list.length) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'ids required')
    let ok = 0
    let failed = 0
    for (const id of list) {
      try {
        await this.remove(me, id)
        ok += 1
      } catch {
        failed += 1
      }
    }
    return { ok, failed, action: 'delete' }
  }

  async restore(me: AuthUser, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: { not: null } },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'deleted account not found')
    return this.prisma.account.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: me.id },
    })
  }

  async addContact(
    me: AuthUser,
    accountId: string,
    dto: {
      name: string
      title?: string
      mobile?: string
      phone?: string
      email?: string
      decisionRole?: string
      isPrimary?: boolean
    },
  ) {
    await this.detail(me, accountId)
    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.contact.updateMany({
          where: { tenantId: me.tenantId, accountId, deletedAt: null },
          data: { isPrimary: false },
        })
      }
      return tx.contact.create({
        data: {
          tenantId: me.tenantId,
          accountId,
          name: dto.name,
          title: dto.title ?? null,
          mobile: dto.mobile ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          decisionRole: dto.decisionRole ?? null,
          isPrimary: dto.isPrimary ?? false,
          createdById: me.id,
          updatedById: me.id,
        },
      })
    })
  }
}
