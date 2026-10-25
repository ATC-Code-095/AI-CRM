import { Injectable } from '@nestjs/common'
import {
  BizException,
  ErrorCodes,
  PageResult,
  TicketSeverity,
  TicketStatus,
} from '@zhixiao-crm/shared'
import { AuthUser } from '../../common/decorators'
import { nextDocNo } from '../../common/doc-no'
import { PrismaService } from '../../common/prisma/prisma.service'

const ALLOWED: Record<string, string[]> = {
  NEW: ['PROCESSING', 'CLOSED'],
  PROCESSING: ['WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'],
  WAITING_CUSTOMER: ['PROCESSING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'PROCESSING'],
  CLOSED: [],
}

const SLA_HOURS: Record<string, number> = {
  URGENT: 8,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 24 * 7,
}

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    me: AuthUser,
    page: number,
    pageSize: number,
    status?: string,
    accountId?: string,
  ): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(accountId ? { accountId } : {}),
    }
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      }),
    ])
    const withAccount = await Promise.all(
      (items as Array<{ accountId: string; id: string }>).map(async (it) => {
        const account = await this.prisma.account.findFirst({
          where: { id: it.accountId },
          select: { id: true, name: true },
        })
        return { ...it, account }
      }),
    )
    return { items: withAccount, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  /** SLA 预警：未关闭且 dueAt 已到或 24h 内到期 */
  async slaAlerts(me: AuthUser) {
    const soon = new Date(Date.now() + 24 * 3600_000)
    return this.prisma.ticket.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { notIn: ['CLOSED', 'RESOLVED'] },
        dueAt: { lte: soon },
      },
      orderBy: { dueAt: 'asc' },
      take: 20,
      select: {
        id: true,
        ticketNo: true,
        title: true,
        severity: true,
        status: true,
        dueAt: true,
      },
    })
  }

  async detail(me: AuthUser, id: string) {
    const t = await this.prisma.ticket.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      include: {
        logs: { orderBy: { at: 'desc' } },
      },
    })
    if (!t) throw new BizException(ErrorCodes.NOT_FOUND, 'ticket not found')
    const account = await this.prisma.account.findFirst({
      where: { id: t.accountId },
      select: { id: true, name: true },
    })
    return { ...t, account }
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    const severity = (data.severity as string) ?? TicketSeverity.MEDIUM
    const hours = SLA_HOURS[severity] ?? 72
    return this.prisma.$transaction(async (tx) => {
      const ticketNo = await nextDocNo(tx, me.tenantId, 'GD')
      const ticket = await tx.ticket.create({
        data: {
          tenantId: me.tenantId,
          ticketNo,
          title: data.title as string,
          accountId: data.accountId as string,
          contactId: (data.contactId as string) ?? null,
          type: data.type as string,
          severity,
          status: TicketStatus.NEW,
          ownerId: me.id,
          dueAt: new Date(Date.now() + hours * 3600_000),
          createdById: me.id,
          updatedById: me.id,
        },
      })
      await tx.ticketLog.create({
        data: {
          tenantId: me.tenantId,
          ticketId: ticket.id,
          toStatus: TicketStatus.NEW,
          userId: me.id,
          note: 'created',
        },
      })
      return ticket
    })
  }

  async update(
    me: AuthUser,
    id: string,
    dto: { title?: string; contactId?: string; type?: string; severity?: string; resolution?: string },
  ) {
    const t = await this.detail(me, id)
    const severityChanged = !!dto.severity && dto.severity !== t.severity
    const open = !t.resolvedAt && t.status !== TicketStatus.CLOSED
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          title: dto.title ?? undefined,
          contactId: dto.contactId ?? undefined,
          type: dto.type ?? undefined,
          severity: dto.severity ?? undefined,
          resolution: dto.resolution ?? undefined,
          // 未结工单调整级别时按创建时间重算 SLA
          dueAt:
            severityChanged && open
              ? new Date(t.createdAt.getTime() + (SLA_HOURS[dto.severity!] ?? 72) * 3600_000)
              : undefined,
          updatedById: me.id,
        },
      })
      await tx.ticketLog.create({
        data: {
          tenantId: me.tenantId,
          ticketId: id,
          fromStatus: t.status,
          toStatus: t.status,
          note: severityChanged ? `updated severity ${t.severity} -> ${dto.severity}` : 'updated',
          userId: me.id,
        },
      })
      return updated
    })
  }

  async transition(
    me: AuthUser,
    id: string,
    dto: { toStatus: TicketStatus; note?: string; resolution?: string },
  ) {
    const t = await this.detail(me, id)
    const allowed = ALLOWED[t.status] ?? []
    if (!allowed.includes(dto.toStatus)) {
      throw new BizException(ErrorCodes.CONFLICT, `illegal ${t.status} -> ${dto.toStatus}`)
    }
    if (dto.toStatus === TicketStatus.RESOLVED && !dto.resolution && !t.resolution) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'resolution required')
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({
        where: { id },
        data: {
          status: dto.toStatus,
          resolution: dto.resolution ?? t.resolution,
          resolvedAt:
            dto.toStatus === TicketStatus.RESOLVED ? new Date() : t.resolvedAt,
          updatedById: me.id,
        },
      })
      await tx.ticketLog.create({
        data: {
          tenantId: me.tenantId,
          ticketId: id,
          fromStatus: t.status,
          toStatus: dto.toStatus,
          note: dto.note ?? null,
          userId: me.id,
        },
      })
      return updated
    })
  }
}
