import {
  Injectable,
} from '@nestjs/common'
import {
  ActivityType,
  BizException,
  ErrorCodes,
  LeadStatus,
  PageResult,
} from '@zhixiao-crm/shared'
import { AuthUser } from '../../common/decorators'
import { canReadRowWithShare, scopeWhere } from '../../common/data-scope'
import { idempotentGuard, idempotentStore } from '../../common/idempotency'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { createLeadAssigner } from './lead-assign'
import { tr } from '../../common/locale'

const OPEN_STATUSES = [LeadStatus.NEW, LeadStatus.ACCEPTED, LeadStatus.CULTIVATING]

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(
    me: AuthUser,
    q: { page: number; pageSize: number; q?: string; status?: string; ownerId?: string; export?: string },
  ): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      AND: [
        scopeWhere(me, 'ownerId'),
        ...(q.status ? [{ status: q.status }] : []),
        ...(q.ownerId ? [{ ownerId: q.ownerId }] : []),
        ...(q.q
          ? [
              {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' as const } },
                  { contactName: { contains: q.q, mode: 'insensitive' as const } },
                  { phone: { contains: q.q } },
                  { email: { contains: q.q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    }
    const page = Math.max(q.page, 1)
    const pageSize = Math.min(Math.max(q.pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ nextFollowAt: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          name: true,
          contactName: true,
          phone: true,
          email: true,
          source: true,
          status: true,
          score: true,
          nextFollowAt: true,
          createdAt: true,
          remark: true,
        },
      }),
    ])
    return { items, page, pageSize, total, hasMore: page * pageSize < total }
  }

  async listCsv(me: AuthUser, q: { q?: string; status?: string; ownerId?: string }): Promise<string> {
    const res = await this.list(me, { page: 1, pageSize: 5000, ...q })
    const rows = res.items as Array<Record<string, unknown>>
    const header = ['name', 'contactName', 'phone', 'email', 'source', 'status', 'score', 'remark']
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        header
          .map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`)
          .join(','),
      ),
    ]
    return lines.join('\n')
  }

  async detail(me: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!lead) throw new BizException(ErrorCodes.NOT_FOUND, 'lead not found')
    const ok = await canReadRowWithShare(this.prisma, me, lead as never, 'LEAD')
    if (!ok) {
      throw new BizException(ErrorCodes.DATA_FORBIDDEN, 'no data access')
    }
    return lead
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    // 非销售人员录入的线索按分配规则直接交给销售（lead.assign_on_create）；销售自己录入的归本人
    const assigner = await createLeadAssigner(this.prisma, me.tenantId)
    const autoOwner = assigner.onCreate && !assigner.isSales(me.id) ? await assigner.next() : null
    await assigner.save()
    return this.prisma.lead
      .create({
        data: {
          tenantId: me.tenantId,
          name: data.name as string,
          contactName: (data.contactName as string) ?? null,
          phone: (data.phone as string) ?? null,
          email: (data.email as string) ?? null,
          website: (data.website as string) ?? null,
          industry: (data.industry as string) ?? null,
          source: data.source as string,
          campaignId: (data.campaignId as string) ?? null,
          status: LeadStatus.NEW,
          score: this.calcScore(data),
          ownerId: autoOwner ?? me.id,
          departmentId: me.departmentId,
          expectedAmount: data.expectedAmount
            ? (data.expectedAmount as string)
            : null,
          remark: (data.remark as string) ?? null,
          nextFollowAt: data.nextFollowAt ? new Date(data.nextFollowAt as string) : null,
          createdById: me.id,
          updatedById: me.id,
        },
      })
      .then(async (row) => {
        await this.prisma.auditLog.create({
          data: {
            tenantId: me.tenantId,
            userId: me.id,
            action: 'CREATE',
            entity: 'LEAD',
            entityId: row.id,
            after: { name: row.name } as never,
          },
        })
        if (autoOwner) {
          await this.push.notify(me.tenantId, autoOwner, 'LEAD_ASSIGNED', { zh: '线索已分配给您', en: 'A lead has been assigned to you' }, row.name, 'LEAD', row.id)
        }
        return row
      })
  }

  async update(me: AuthUser, id: string, data: Record<string, unknown>) {
    const lead = await this.detail(me, id)
    if (lead.status === LeadStatus.CONVERTED) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'converted lead is read-only')
    }
    if (
      data.status &&
      !this.canTransit(lead.status as LeadStatus, data.status as LeadStatus)
    ) {
      throw new BizException(ErrorCodes.CONFLICT, `illegal status ${lead.status} -> ${data.status}`)
    }
    return this.prisma.lead.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.contactName !== undefined ? { contactName: data.contactName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.remark !== undefined ? { remark: data.remark } : {}),
        ...(data.nextFollowAt !== undefined
          ? { nextFollowAt: data.nextFollowAt ? new Date(data.nextFollowAt as string) : null }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedById: me.id,
      } as never,
    })
  }

  async remove(me: AuthUser, id: string) {
    const lead = await this.detail(me, id)
    if (lead.status === LeadStatus.CONVERTED) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'converted lead cannot be deleted')
    }
    await this.prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: me.id, updatedById: me.id },
    })
    return { ok: true }
  }

  async restore(me: AuthUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: { not: null } },
    })
    if (!lead) throw new BizException(ErrorCodes.NOT_FOUND, 'deleted lead not found')
    return this.prisma.lead.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: me.id },
    })
  }

  /** 批量分配线索（主流 CRM 批量操作） */
  async batchAssign(me: AuthUser, ids: string[], ownerId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, tenantId: me.tenantId, deletedAt: null, status: 'ACTIVE' },
    })
    if (!owner) throw new BizException(ErrorCodes.NOT_FOUND, 'owner not found')
    const res = await this.prisma.lead.updateMany({
      where: {
        id: { in: ids },
        tenantId: me.tenantId,
        deletedAt: null,
        AND: [scopeWhere(me, 'ownerId')],
      },
      data: { ownerId, status: LeadStatus.ACCEPTED, updatedById: me.id },
    })
    for (const id of ids.slice(0, 20)) {
      await this.push.notify(me.tenantId, ownerId, 'LEAD_ASSIGNED', { zh: '线索已分配给您', en: 'A lead has been assigned to you' }, '', 'LEAD', id)
    }
    return { ok: res.count }
  }

  /** 批量关闭线索 */
  async batchClose(me: AuthUser, ids: string[], reason: string) {
    const res = await this.prisma.lead.updateMany({
      where: {
        id: { in: ids },
        tenantId: me.tenantId,
        deletedAt: null,
        AND: [scopeWhere(me, 'ownerId')],
      },
      data: {
        status: LeadStatus.CLOSED_LOST,
        remark: reason ? `${tr('批量关闭', 'Bulk closed')}: ${reason}` : tr('批量关闭', 'Bulk closed'),
        updatedById: me.id,
      },
    })
    return { ok: res.count }
  }

  /** 批量回收公海 */
  async batchRecycle(me: AuthUser, ids: string[], reason?: string) {
    const res = await this.prisma.lead.updateMany({
      where: {
        id: { in: ids },
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['NEW', 'ACCEPTED', 'CULTIVATING'] },
      },
      data: {
        status: 'NEW',
        nextFollowAt: null,
        remark: `${tr('公海批量回收', 'Bulk returned to pool')}: ${reason ?? ''}`,
        updatedById: me.id,
      },
    })
    return { ok: res.count }
  }

  async assign(me: AuthUser, id: string, ownerId: string) {
    await this.detail(me, id)
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, tenantId: me.tenantId, deletedAt: null, status: 'ACTIVE' },
    })
    if (!owner) throw new BizException(ErrorCodes.NOT_FOUND, 'owner not found')
    const row = await this.prisma.lead.update({
      where: { id },
      data: {
        ownerId,
        status: LeadStatus.ACCEPTED,
        updatedById: me.id,
      },
    })
    await this.push.notify(
      me.tenantId,
      ownerId,
      'LEAD_ASSIGNED',
      { zh: '线索已分配给您', en: 'A lead has been assigned to you' },
      row.name,
      'LEAD',
      id,
    )
    return row
  }

  async close(me: AuthUser, id: string, reason: string) {
    const lead = await this.detail(me, id)
    if (!OPEN_STATUSES.includes(lead.status as LeadStatus)) {
      throw new BizException(ErrorCodes.CONFLICT, `cannot close from ${lead.status}`)
    }
    return this.prisma.lead.update({
      where: { id },
      data: {
        status: LeadStatus.CLOSED_LOST,
        closeReason: reason,
        updatedById: me.id,
      },
    })
  }

  async convert(
    me: AuthUser,
    id: string,
    dto: {
      mode: 'create_account' | 'link_account'
      existingAccountId?: string
      accountName?: string
      contactName?: string
      mobile?: string
      contactTitle?: string
      createOpportunity?: boolean
      opportunityName?: string
      expectedCloseDate?: string
      amount?: string
      forceCreate?: boolean
    },
    idemKey?: string,
  ) {
    const replay = idempotentGuard(me.tenantId, idemKey, { id, ...dto })
    if (replay.replay !== undefined) return replay.replay
    const lead = await this.detail(me, id)
    if (![LeadStatus.ACCEPTED, LeadStatus.CULTIVATING, LeadStatus.NEW].includes(lead.status as LeadStatus)) {
      throw new BizException(ErrorCodes.CONFLICT, `cannot convert from ${lead.status}`)
    }

    return this.prisma.$transaction(async (tx) => {
      let accountId = dto.existingAccountId
      if (dto.mode === 'create_account') {
        const name = (dto.accountName || lead.name).trim()
        const dup = await tx.account.findFirst({
          where: { tenantId: me.tenantId, name, deletedAt: null },
        })
        if (dup && !dto.forceCreate) {
          throw new BizException(ErrorCodes.UNPROCESSABLE, 'account name exists', [
            { field: 'accountName', message: `duplicate: ${dup.id}` },
          ])
        }
        const account = await tx.account.create({
          data: {
            tenantId: me.tenantId,
            name,
            phone: lead.phone,
            website: lead.website,
            industry: lead.industry,
            source: lead.source,
            ownerId: me.id,
            departmentId: me.departmentId,
            createdById: me.id,
            updatedById: me.id,
          },
        })
        accountId = account.id
      } else if (!accountId) {
        throw new BizException(ErrorCodes.VALIDATION_FAILED, 'existingAccountId required')
      } else {
        const acc = await tx.account.findFirst({
          where: { id: accountId, tenantId: me.tenantId, deletedAt: null },
        })
        if (!acc) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
      }

      const contact = await tx.contact.create({
        data: {
          tenantId: me.tenantId,
          accountId: accountId!,
          name: dto.contactName || lead.contactName || lead.name,
          mobile: dto.mobile || lead.phone,
          email: lead.email,
          title: dto.contactTitle ?? null,
          isPrimary: true,
          createdById: me.id,
          updatedById: me.id,
        },
      })

      let opportunityId: string | undefined
      if (dto.createOpportunity) {
        const pipeline = await tx.pipeline.findFirst({
          where: { tenantId: me.tenantId, isDefault: true, deletedAt: null },
          include: { stages: { orderBy: { sortOrder: 'asc' } } },
        })
        if (!pipeline?.stages[0]) {
          throw new BizException(ErrorCodes.UNPROCESSABLE, 'default pipeline missing')
        }
        const opp = await tx.opportunity.create({
          data: {
            tenantId: me.tenantId,
            name: dto.opportunityName || `${lead.name}-${tr('新商机', 'New opportunity')}`,
            accountId: accountId!,
            primaryContactId: contact.id,
            pipelineId: pipeline.id,
            stageId: pipeline.stages[0].id,
            amount: dto.amount ?? '0',
            winRate: pipeline.stages[0].winRate,
            expectedCloseDate: dto.expectedCloseDate
              ? new Date(dto.expectedCloseDate)
              : new Date(Date.now() + 30 * 86400000),
            ownerId: me.id,
            departmentId: me.departmentId,
            leadId: lead.id,
            createdById: me.id,
            updatedById: me.id,
          },
        })
        opportunityId = opp.id
      }

      const updated = await tx.lead.update({
        where: { id },
        data: {
          status: LeadStatus.CONVERTED,
          convertedAt: new Date(),
          convertedAccountId: accountId,
          convertedContactId: contact.id,
          convertedOpportunityId: opportunityId ?? null,
          updatedById: me.id,
        },
      })

      return {
        leadId: updated.id,
        accountId,
        contactId: contact.id,
        opportunityId: opportunityId ?? null,
      }
    })
    .then((result) => {
      idempotentStore(me.tenantId, idemKey, { id, ...dto }, result)
      return result
    })
  }

  async activities(me: AuthUser, id: string) {
    await this.detail(me, id)
    return this.prisma.activity.findMany({
      where: {
        tenantId: me.tenantId,
        entityType: 'LEAD',
        entityId: id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async addActivity(
    me: AuthUser,
    id: string,
    dto: { type: ActivityType; subject: string; content?: string; dueAt?: Date },
  ) {
    await this.detail(me, id)
    return this.prisma.activity.create({
      data: {
        tenantId: me.tenantId,
        type: dto.type,
        subject: dto.subject,
        status: dto.dueAt ? 'PLANNED' : 'DONE',
        content: dto.content ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        entityType: 'LEAD',
        entityId: id,
        ownerId: me.id,
        source: 'MANUAL',
        createdById: me.id,
        updatedById: me.id,
      },
    })
  }

  private canTransit(from: LeadStatus, to: LeadStatus): boolean {
    const map: Record<string, string[]> = {
      NEW: ['ACCEPTED', 'CULTIVATING', 'CLOSED_LOST'],
      ACCEPTED: ['CULTIVATING', 'CLOSED_LOST', 'CONVERTED'],
      CULTIVATING: ['CONVERTED', 'CLOSED_LOST'],
      CONVERTED: [],
      CLOSED_LOST: [],
    }
    return (map[from] ?? []).includes(to)
  }

  private calcScore(data: Record<string, unknown>): number {
    let s = 0
    if (data.phone) s += 20
    if (data.email) s += 10
    if (data.expectedAmount && Number(data.expectedAmount) > 0) s += 20
    return Math.min(s, 100)
  }
}
