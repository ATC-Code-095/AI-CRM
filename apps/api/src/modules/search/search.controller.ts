import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { scopeWhere } from '../../common/data-scope'
import { PrismaService } from '../../common/prisma/prisma.service'

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async search(
    @CurrentUser() me: AuthUser,
    @Query('q') q = '',
    @Query('types') types = 'account,contact,opportunity,lead,contract',
  ) {
    const key = q.trim()
    if (key.length < 2 || key.length > 64) return { items: [] }
    const typeSet = new Set(types.split(',').map((s) => s.trim()))
    const like = { contains: key, mode: 'insensitive' as const }
    const items: Array<{ type: string; id: string; title: string; subtitle?: string }> = []

    const take = 10
    if (typeSet.has('account')) {
      const rows = await this.prisma.account.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          AND: [scopeWhere(me, 'ownerId'), { OR: [{ name: like }, { phone: like }] }],
        },
        take,
        select: { id: true, name: true, phone: true },
      })
      rows.forEach((r) =>
        items.push({ type: 'account', id: r.id, title: r.name, subtitle: r.phone ?? '' }),
      )
    }
    if (typeSet.has('lead')) {
      const rows = await this.prisma.lead.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          AND: [scopeWhere(me, 'ownerId'), { OR: [{ name: like }, { phone: like }] }],
        },
        take,
        select: { id: true, name: true, contactName: true },
      })
      rows.forEach((r) =>
        items.push({ type: 'lead', id: r.id, title: r.name, subtitle: r.contactName ?? '' }),
      )
    }
    if (typeSet.has('opportunity')) {
      const rows = await this.prisma.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          AND: [scopeWhere(me, 'ownerId'), { name: like }],
        },
        take,
        select: { id: true, name: true, amount: true },
      })
      rows.forEach((r) =>
        items.push({ type: 'opportunity', id: r.id, title: r.name, subtitle: String(r.amount) }),
      )
    }
    if (typeSet.has('contact')) {
      const rows = await this.prisma.contact.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          OR: [{ name: like }, { mobile: like }, { email: like }],
        },
        take,
        select: { id: true, name: true, accountId: true },
      })
      rows.forEach((r) =>
        items.push({
          type: 'contact',
          id: r.id,
          title: r.name,
          subtitle: r.accountId,
        }),
      )
    }
    if (typeSet.has('contract')) {
      const rows = await this.prisma.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          AND: [scopeWhere(me, 'ownerId'), { OR: [{ title: like }, { contractNo: like }] }],
        },
        take,
        select: { id: true, title: true, contractNo: true },
      })
      rows.forEach((r) =>
        items.push({
          type: 'contract',
          id: r.id,
          title: r.title,
          subtitle: r.contractNo,
        }),
      )
    }
    if (typeSet.has('quote')) {
      const rows = await this.prisma.quote.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          AND: [scopeWhere(me, 'ownerId'), { OR: [{ subject: like }, { quoteNo: like }] }],
        },
        take: 6,
        select: { id: true, subject: true, quoteNo: true },
      })
      rows.forEach((r) =>
        items.push({ type: 'quote', id: r.id, title: r.subject, subtitle: r.quoteNo }),
      )
    }
    if (typeSet.has('ticket')) {
      const rows = await this.prisma.ticket.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          AND: [scopeWhere(me, 'ownerId'), { OR: [{ title: like }, { ticketNo: like }] }],
        },
        take: 6,
        select: { id: true, title: true, ticketNo: true },
      })
      rows.forEach((r) =>
        items.push({ type: 'ticket', id: r.id, title: r.title, subtitle: r.ticketNo }),
      )
    }
    if (typeSet.has('product')) {
      const rows = await this.prisma.product.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          OR: [{ name: like }, { code: like }],
        },
        take: 5,
        select: { id: true, name: true, code: true },
      })
      rows.forEach((r) =>
        items.push({ type: 'product', id: r.id, title: r.name, subtitle: r.code }),
      )
    }
    return { items: items.slice(0, 30) }
  }
}
