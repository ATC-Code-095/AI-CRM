import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { BizException, ErrorCodes, PageResult, StdStageCode } from '@zhixiao-crm/shared'
import { AuthUser } from '../../common/decorators'
import { canReadRowWithShare, scopeWhere } from '../../common/data-scope'
import { assertVersion } from '../../common/optimistic'
import { writeAudit } from '../../common/audit'
import { PrismaService } from '../../common/prisma/prisma.service'
import { WebhooksService } from '../platform/webhooks.service'
import { toBattlecard, toForecastCommit } from './opportunity-records.mapper'
import { tr } from '../../common/locale'
import { resolveCurrency } from '../../common/currency'



/**
 * 阶段门禁（Validation Rules，对标 Salesforce Validation Rules / 纷享销客阶段必填）
 * 内置默认按阶段 code 生效；PipelineStage.requiredFields 里的同名开关可覆盖/追加。
 * 缺失时拒绝推进并一次性返回全部缺失项，避免用户来回试错。
 */
const DEFAULT_STAGE_RULES: Record<string, Record<string, boolean>> = {
  DISCOVERY: { needAmount: true },
  PROPOSAL: { needAmount: true, needCloseDate: true, needQuote: true },
  NEGOTIATION: {
    needAmount: true,
    needCloseDate: true,
    needNextStep: true,
    needContact: true,
  },
  WON: { needAmount: true },
}

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  async pipelines(me: AuthUser) {
    return this.prisma.pipeline.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, isActive: true },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    })
  }

  async list(
    me: AuthUser,
    q: {
      page: number
      pageSize: number
      q?: string
      stageId?: string
      accountId?: string
    },
  ): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      AND: [
        scopeWhere(me, 'ownerId'),
        ...(q.stageId ? [{ stageId: q.stageId }] : []),
        ...(q.accountId ? [{ accountId: q.accountId }] : []),
        ...(q.q ? [{ name: { contains: q.q, mode: 'insensitive' as const } }] : []),
      ],
    }
    const page = Math.max(q.page, 1)
    const pageSize = Math.min(Math.max(q.pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.opportunity.count({ where }),
      this.prisma.opportunity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { expectedCloseDate: 'asc' },
        include: {
          stage: true,
          account: { select: { id: true, name: true } },
        },
      }),
    ])
    return { items, page, pageSize, total, hasMore: page * pageSize < total }
  }

  async board(me: AuthUser, ownerId?: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId: me.tenantId, isDefault: true, deletedAt: null },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!pipeline) throw new BizException(ErrorCodes.NOT_FOUND, 'pipeline not found')

    const opps = await this.prisma.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        pipelineId: pipeline.id,
        ...scopeWhere(me, 'ownerId'),
        ...(ownerId ? { ownerId } : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
        stage: true,
      },
      orderBy: [{ expectedCloseDate: 'asc' }],
    })

    // 看板卡片需要展示负责人姓名（docs/06 §5.2）
    const ownerIds = [...new Set(opps.map((o) => o.ownerId).filter(Boolean))]
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId: me.tenantId, id: { in: ownerIds } },
          select: { id: true, name: true },
        })
      : []
    const ownerName = new Map(owners.map((u) => [u.id, u.name]))

    const columns = pipeline.stages.map((s) => {
      const cards = opps
        .filter((o) => o.stageId === s.id)
        .map((o) => ({ ...o, owner: { id: o.ownerId, name: ownerName.get(o.ownerId) ?? '—' } }))
      return {
        stage: s,
        cards,
        count: cards.length,
        // 列合计按本位币；卡片上仍显示原币金额
        amount: cards.reduce((sum, o) => sum + Number(o.amountBase), 0).toFixed(2),
      }
    })
    return { pipeline, columns }
  }

  async detail(me: AuthUser, id: string) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      include: {
        stage: true,
        pipeline: true,
        account: { select: { id: true, name: true } },
        histories: { orderBy: { changedAt: 'desc' }, take: 20 },
        quotes: { where: { deletedAt: null }, select: { id: true, quoteNo: true, status: true, total: true } },
        contracts: { where: { deletedAt: null }, select: { id: true, contractNo: true, status: true, total: true } },
        members: {
          select: {
            userId: true,
            role: true,
            createdAt: true,
          },
        },
      },
    })
    if (!opp) throw new BizException(ErrorCodes.NOT_FOUND, 'opportunity not found')
    const ok = await canReadRowWithShare(this.prisma, me, opp as never, 'OPPORTUNITY')
    if (!ok) {
      throw new BizException(ErrorCodes.DATA_FORBIDDEN, 'no data access')
    }
    // 补充成员姓名
    const userIds = opp.members.map((m) => m.userId)
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    })
    const umap = new Map(users.map((u) => [u.id, u]))
    // 客户联系人（决策链）
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId: me.tenantId, accountId: opp.accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        title: true,
        decisionRole: true,
        isPrimary: true,
        mobile: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: 20,
    })
    return {
      ...opp,
      members: opp.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        name: umap.get(m.userId)?.name ?? '',
        email: umap.get(m.userId)?.email ?? '',
        joinedAt: m.createdAt,
      })),
      contacts,
    }
  }

  async addMember(me: AuthUser, id: string, userId: string, role = 'COLLABORATOR') {
    const opp = await this.detail(me, id)
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    await this.prisma.opportunityMember.upsert({
      where: { opportunityId_userId: { opportunityId: opp.id, userId } },
      create: {
        opportunityId: opp.id,
        userId,
        role: role || 'COLLABORATOR',
      },
      update: { role: role || 'COLLABORATOR' },
    })
    return { ok: true, userId, role }
  }

  async removeMember(me: AuthUser, id: string, userId: string) {
    await this.detail(me, id)
    await this.prisma.opportunityMember.deleteMany({
      where: { opportunityId: id, userId },
    })
    return { ok: true }
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId: me.tenantId, isDefault: true, deletedAt: null },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!pipeline?.stages.length) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'default pipeline missing')
    }
    const stageCode = (data.stageCode as string) || StdStageCode.PROSPECTING
    const stage =
      pipeline.stages.find((s) => s.code === stageCode) ?? pipeline.stages[0]

    const currency = await resolveCurrency(this.prisma, me.tenantId, data.currency)
    return this.prisma.$transaction(async (tx) => {
      const opp = await tx.opportunity.create({
        data: {
          tenantId: me.tenantId,
          currency,
          name: data.name as string,
          accountId: data.accountId as string,
          primaryContactId: (data.primaryContactId as string) ?? null,
          pipelineId: pipeline.id,
          stageId: stage.id,
          amount: (data.amount as string) ?? '0',
          winRate: stage.winRate,
          expectedCloseDate: new Date(data.expectedCloseDate as string),
          ownerId: me.id,
          departmentId: me.departmentId,
          nextStep: (data.nextStep as string) ?? null,
          source: (data.source as string) ?? null,
          competitor: (data.competitor as string) ?? null,
          description: (data.description as string) ?? null,
          createdById: me.id,
          updatedById: me.id,
        },
        include: { stage: true, account: { select: { id: true, name: true } } },
      })
      await tx.opportunityStageHistory.create({
        data: {
          tenantId: me.tenantId,
          opportunityId: opp.id,
          toStageId: stage.id,
          toWinRate: stage.winRate,
          changedById: me.id,
          note: 'created',
        },
      })
      await writeAudit(tx, {
        tenantId: me.tenantId,
        userId: me.id,
        action: 'CREATE',
        entity: 'OPPORTUNITY',
        entityId: opp.id,
        after: { name: opp.name, amount: String(opp.amount) },
      })
      return opp
    })
  }

  async update(me: AuthUser, id: string, data: Record<string, unknown>) {
    const opp = await this.detail(me, id)
    if (opp.stage.isClosing) {
      throw new BizException(ErrorCodes.CONFLICT, 'closed opportunity is read-only')
    }
    assertVersion(data.version as number | undefined, opp.version)
    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.amount !== undefined) patch.amount = data.amount
    if (data.currency !== undefined) patch.currency = await resolveCurrency(this.prisma, me.tenantId, data.currency)
    if (data.expectedCloseDate !== undefined) {
      patch.expectedCloseDate = new Date(data.expectedCloseDate as string)
    }
    if (data.nextStep !== undefined) patch.nextStep = data.nextStep
    if (data.competitor !== undefined) patch.competitor = data.competitor
    if (data.description !== undefined) patch.description = data.description
    if (data.winRate !== undefined) patch.winRate = Number(data.winRate)
    if (data.customValues !== undefined) patch.customValues = data.customValues
    patch.updatedById = me.id
    patch.version = { increment: 1 }
    return this.prisma.opportunity.update({
      where: { id },
      data: patch as never,
      include: { stage: true },
    })
  }

  /** 计算某阶段还缺哪些必填项（返回中文标签，空数组表示可推进） */
  private async stageGateMissing(
    me: AuthUser,
    opp: {
      id: string
      amount: unknown
      expectedCloseDate?: Date | string | null
      nextStep?: string | null
      accountId: string
    },
    stage: { code: string; requiredFields: unknown },
  ): Promise<string[]> {
    const flags: Record<string, boolean> = {
      ...(DEFAULT_STAGE_RULES[stage.code] ?? {}),
      ...((stage.requiredFields ?? {}) as Record<string, boolean>),
    }
    const missing: string[] = []
    if (flags.needAmount && Number(opp.amount) <= 0) missing.push(tr('商机金额', 'Opportunity amount'))
    if (flags.needCloseDate && !opp.expectedCloseDate) missing.push(tr('预计成交日', 'Expected close date'))
    if (flags.needNextStep && !opp.nextStep) missing.push(tr('下一步动作', 'Next step'))
    if (flags.needQuote) {
      const quotes = await this.prisma.quote.count({
        where: { tenantId: me.tenantId, opportunityId: opp.id, deletedAt: null },
      })
      if (quotes === 0) missing.push(tr('至少一条报价', 'At least one quote'))
    }
    if (flags.needContact) {
      const contacts = await this.prisma.contact.count({
        where: { tenantId: me.tenantId, accountId: opp.accountId, deletedAt: null },
      })
      if (contacts === 0) missing.push(tr('客户联系人（决策链）', 'Account contacts (decision chain)'))
    }
    return missing
  }

  async updateStage(
    me: AuthUser,
    id: string,
    dto: { stageId: string; note?: string; winRate?: number },
  ) {
    const opp = await this.detail(me, id)
    if (opp.stage.isClosing) {
      throw new BizException(ErrorCodes.CONFLICT, 'closed opportunity cannot change stage')
    }
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: dto.stageId, tenantId: me.tenantId, pipelineId: opp.pipelineId },
    })
    if (!stage) throw new BizException(ErrorCodes.CONFLICT, 'illegal stage')

    // 阶段门禁：内置规则 + requiredFields 覆盖
    const missing = await this.stageGateMissing(me, opp, stage)
    if (missing.length) {
      throw new BizException(
        ErrorCodes.UNPROCESSABLE,
        `推进到「${stage.name}」前需补齐：${missing.join('、')}`,
      )
    }

    const winRate = dto.winRate ?? stage.winRate
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.opportunity.update({
        where: { id },
        data: {
          stageId: stage.id,
          winRate,
          updatedById: me.id,
          ...(stage.isClosing && stage.code === StdStageCode.WON
            ? { actualCloseDate: new Date() }
            : {}),
        },
        include: { stage: true },
      })
      await tx.opportunityStageHistory.create({
        data: {
          tenantId: me.tenantId,
          opportunityId: id,
          fromStageId: opp.stageId,
          toStageId: stage.id,
          fromWinRate: opp.winRate,
          toWinRate: winRate,
          changedById: me.id,
          note: dto.note ?? null,
        },
      })
      await writeAudit(tx, {
        tenantId: me.tenantId,
        userId: me.id,
        action: 'STATUS',
        entity: 'OPPORTUNITY',
        entityId: id,
        before: { stageId: opp.stageId, winRate: opp.winRate },
        after: { stageId: stage.id, winRate },
      })
      if (stage.isClosing && stage.code === StdStageCode.WON) {
        // fire-and-forget webhook
        void this.webhooks
          .emit(me, 'opportunity.won', {
            opportunityId: id,
            amount: String(updated.amount),
            ownerId: updated.ownerId,
          })
          .catch(() => undefined)
      }
      return updated
    })
  }

  /** 批量改阶段（主流 CRM 批量操作） */
  async batchUpdateStage(me: AuthUser, ids: string[], stageId: string, note?: string) {
    const ok: string[] = []
    const failed: string[] = []
    let firstError: string | null = null
    for (const id of ids) {
      try {
        await this.updateStage(me, id, { stageId, note: note ?? 'batch stage move' })
        ok.push(id)
      } catch (e) {
        failed.push(id)
        if (!firstError && e instanceof BizException) firstError = e.message
      }
    }
    return { ok: ok.length, failed: failed.length, failedIds: failed, firstError }
  }

  async closeWon(me: AuthUser, id: string) {
    const opp = await this.detail(me, id)
    if (Number(opp.amount) <= 0) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'amount must > 0 to win')
    }
    const won = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: me.tenantId,
        pipelineId: opp.pipelineId,
        code: StdStageCode.WON,
      },
    })
    if (!won) throw new BizException(ErrorCodes.UNPROCESSABLE, 'WON stage missing')
    return this.updateStage(me, id, { stageId: won.id, note: 'won', winRate: 100 })
  }

  async closeLost(me: AuthUser, id: string, dto: { closeReason: string; note?: string }) {
    const opp = await this.detail(me, id)
    const lost = await this.prisma.pipelineStage.findFirst({
      where: {
        tenantId: me.tenantId,
        pipelineId: opp.pipelineId,
        code: StdStageCode.LOST,
      },
    })
    if (!lost) throw new BizException(ErrorCodes.UNPROCESSABLE, 'LOST stage missing')
    await this.prisma.opportunity.update({
      where: { id },
      data: { closeReason: dto.closeReason },
    })
    return this.updateStage(me, id, {
      stageId: lost.id,
      note: dto.note ?? dto.closeReason,
      winRate: 0,
    })
  }

  async remove(me: AuthUser, id: string) {
    const opp = await this.detail(me, id)
    if (opp.stage.code === StdStageCode.WON) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'won opportunity cannot be deleted')
    }
    await this.prisma.opportunity.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: me.id, updatedById: me.id },
    })
    return { ok: true }
  }

  async forecast(me: AuthUser, month?: string) {
    const now = new Date()
    const ym = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, m] = ym.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)

    const opps = await this.prisma.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        expectedCloseDate: { gte: start, lte: end },
      },
      include: { stage: true },
    })

    const buckets = new Map<string, { count: number; amount: number; weighted: number }>()
    for (const o of opps) {
      const key = o.stage.name
      const b = buckets.get(key) ?? { count: 0, amount: 0, weighted: 0 }
      b.count += 1
      b.amount += Number(o.amountBase)
      b.weighted += (Number(o.amountBase) * o.winRate) / 100
      buckets.set(key, b)
    }
    const items = [...buckets.entries()].map(([stage, v]) => ({
      stage,
      count: v.count,
      amount: v.amount.toFixed(2),
      weightedAmount: v.weighted.toFixed(2),
    }))
    const totals = items.reduce(
      (acc, i) => ({
        count: acc.count + i.count,
        amount: acc.amount + Number(i.amount),
        weightedAmount: acc.weightedAmount + Number(i.weightedAmount),
      }),
      { count: 0, amount: 0, weightedAmount: 0 },
    )
    return {
      month: ym,
      items,
      totals: {
        count: totals.count,
        amount: totals.amount.toFixed(2),
        weightedAmount: totals.weightedAmount.toFixed(2),
      },
    }
  }

  /** 预测提交：销售提交本月 Commit / Best / Worst */
  async forecastCommit(
    me: AuthUser,
    body: { month?: string; commitAmount?: string; bestAmount?: string; worstAmount?: string; note?: string },
  ) {
    const now = new Date()
    const month = body.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'month invalid')
    const amount = (v?: string) => {
      const n = Number(v ?? 0)
      if (!Number.isFinite(n) || n < 0) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'amount invalid')
      return n.toFixed(2)
    }
    const data = {
      userName: me.name ?? me.email,
      commitAmount: amount(body.commitAmount),
      bestAmount: amount(body.bestAmount),
      worstAmount: amount(body.worstAmount),
      note: body.note ?? '',
      submittedAt: new Date(),
    }
    const row = await this.prisma.forecastCommit.upsert({
      where: { tenantId_month_userId: { tenantId: me.tenantId, month, userId: me.id } },
      update: data,
      create: { tenantId: me.tenantId, month, userId: me.id, ...data },
    })
    return { ok: true, month, entry: toForecastCommit(row) }
  }

  async forecastCommits(me: AuthUser, month?: string) {
    const now = new Date()
    const ym = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const rows = await this.prisma.forecastCommit.findMany({
      where: { tenantId: me.tenantId, month: ym },
      orderBy: { submittedAt: 'asc' },
    })
    const items = rows.map(toForecastCommit)
    const totals = rows.reduce(
      (acc, x) => ({
        commitAmount: acc.commitAmount + Number(x.commitAmount),
        bestAmount: acc.bestAmount + Number(x.bestAmount),
        worstAmount: acc.worstAmount + Number(x.worstAmount),
      }),
      { commitAmount: 0, bestAmount: 0, worstAmount: 0 },
    )
    return {
      month: ym,
      items,
      totals: {
        commitAmount: totals.commitAmount.toFixed(2),
        bestAmount: totals.bestAmount.toFixed(2),
        worstAmount: totals.worstAmount.toFixed(2),
      },
    }
  }

  /** 销售作战室：竞品/干系人/赢率策略/风险/行动 */
  async battlecard(me: AuthUser, id: string) {
    await this.detail(me, id)
    const row = await this.prisma.opportunityBattlecard.findUnique({
      where: { tenantId_opportunityId: { tenantId: me.tenantId, opportunityId: id } },
    })
    return row
      ? toBattlecard(row)
      : {
          competitors: '',
          stakeholders: '',
          winThemes: '',
          risks: '',
          actions: [] as Array<{ text: string; done: boolean }>,
        }
  }

  async saveBattlecard(me: AuthUser, id: string, data: Record<string, unknown>) {
    await this.detail(me, id)
    const value = {
      competitors: String(data.competitors ?? ''),
      stakeholders: String(data.stakeholders ?? ''),
      winThemes: String(data.winThemes ?? ''),
      risks: String(data.risks ?? ''),
      actions: (Array.isArray(data.actions) ? data.actions : []) as Prisma.InputJsonValue,
      updatedById: me.id,
      updatedByName: me.name ?? me.email,
    }
    const row = await this.prisma.opportunityBattlecard.upsert({
      where: { tenantId_opportunityId: { tenantId: me.tenantId, opportunityId: id } },
      update: value,
      create: { tenantId: me.tenantId, opportunityId: id, ...value },
    })
    return toBattlecard(row)
  }
}
