import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Project as ProjectRow } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { BizException, ErrorCodes, PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

type Milestone = { text: string; done: boolean; due?: string }

export type Project = {
  id: string
  code: string
  name: string
  accountId?: string | null
  accountName?: string
  status: 'PLANNING' | 'BIDDING' | 'WON' | 'DELIVERING' | 'CLOSED'
  owner?: string
  budget?: string
  startDate?: string
  endDate?: string
  description?: string
  milestones?: Milestone[]
}

const STATUSES = ['PLANNING', 'BIDDING', 'WON', 'DELIVERING', 'CLOSED']

function toProject(p: ProjectRow): Project {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    accountId: p.accountId,
    accountName: p.accountName,
    status: p.status as Project['status'],
    owner: p.ownerName,
    budget: Number(p.budget).toFixed(2),
    startDate: p.startDate,
    endDate: p.endDate,
    description: p.description,
    milestones: Array.isArray(p.milestones) ? (p.milestones as Milestone[]) : [],
  }
}

function cleanMilestones(list: unknown): Milestone[] {
  return (Array.isArray(list) ? list : [])
    .filter((m) => m && typeof (m as Milestone).text === 'string')
    .map((m) => {
      const x = m as Milestone
      return { text: x.text, done: !!x.done, ...(x.due ? { due: String(x.due) } : {}) }
    })
}

/**
 * 项目制销售：报价/合同按项目归集
 * 对标 Salesforce Project / 用友项目型销售
 */
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  private async find(me: AuthUser, id: string) {
    const p = await this.prisma.project.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!p) throw new BizException(ErrorCodes.NOT_FOUND, 'project not found')
    return p
  }

  private async accountName(me: AuthUser, accountId?: string | null) {
    if (!accountId) return null
    const a = await this.prisma.account.findFirst({
      where: { id: accountId, tenantId: me.tenantId, deletedAt: null },
      select: { name: true },
    })
    if (!a) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    return a.name
  }

  @Get()
  @Permissions(PERMISSIONS.OPPORTUNITY_READ)
  async list(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.project.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return { items: rows.map(toProject), total: rows.length }
  }

  @Get(':id')
  @Permissions(PERMISSIONS.OPPORTUNITY_READ)
  async detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const project = toProject(await this.find(me, id))
    // 显式挂到项目的单据 + 同客户单据
    const linked = {
      tenantId: me.tenantId,
      deletedAt: null,
      OR: [{ projectId: id }, ...(project.accountId ? [{ accountId: project.accountId }] : [])],
    }
    const [quotes, contracts] = await Promise.all([
      this.prisma.quote.findMany({
        where: linked,
        select: { id: true, quoteNo: true, subject: true, status: true, total: true, totalBase: true, currency: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.contract.findMany({
        where: linked,
        select: {
          id: true,
          contractNo: true,
          title: true,
          status: true,
          total: true,
          receivedAmount: true,
          totalBase: true,
          receivedAmountBase: true,
          currency: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ])
    // 项目汇总与预算对比按本位币
    const quoteTotal = quotes.reduce((s, q) => s + Number(q.totalBase), 0)
    const contractTotal = contracts.reduce((s, c) => s + Number(c.totalBase), 0)
    const received = contracts.reduce((s, c) => s + Number(c.receivedAmountBase), 0)
    const budget = Number(project.budget ?? 0)
    return {
      project,
      quotes,
      contracts,
      summary: {
        quoteCount: quotes.length,
        quoteTotal: quoteTotal.toFixed(2),
        contractCount: contracts.length,
        contractTotal: contractTotal.toFixed(2),
        received: received.toFixed(2),
        budget: budget.toFixed(2),
        // 项目毛利估算：合同额 - 预算（无成本科目时用预算代理）
        grossProfit: (contractTotal - budget).toFixed(2),
        margin: contractTotal > 0 ? (((contractTotal - budget) / contractTotal) * 100).toFixed(1) : '0',
        receiveRate: contractTotal > 0 ? ((received / contractTotal) * 100).toFixed(1) : '0',
      },
    }
  }

  @Post()
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  async create(@CurrentUser() me: AuthUser, @Body() body: Partial<Project>) {
    const accountName = await this.accountName(me, body.accountId)
    const count = await this.prisma.project.count({ where: { tenantId: me.tenantId } })
    const row = await this.prisma.project.create({
      data: {
        tenantId: me.tenantId,
        code: body.code || `P${count + 1}`,
        name: body.name || tr('未命名项目', 'Untitled project'),
        accountId: body.accountId || null,
        accountName: accountName ?? body.accountName ?? '',
        status: STATUSES.includes(String(body.status)) ? String(body.status) : 'PLANNING',
        ownerId: me.id,
        ownerName: body.owner ?? me.name ?? me.email,
        budget: Number(body.budget ?? 0) || 0,
        startDate: body.startDate ?? new Date().toISOString().slice(0, 10),
        endDate: body.endDate ?? '',
        description: body.description ?? '',
        createdById: me.id,
      },
    })
    return toProject(row)
  }

  /** 项目里程碑（整体替换） */
  @Put(':id/milestones')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  async setMilestones(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { milestones: Milestone[] },
  ) {
    await this.find(me, id)
    const row = await this.prisma.project.update({
      where: { id },
      data: { milestones: cleanMilestones(body.milestones) as Prisma.InputJsonValue },
    })
    return toProject(row)
  }

  @Put(':id')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  async update(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: Partial<Project>,
  ) {
    await this.find(me, id)
    const accountName =
      body.accountId === undefined ? undefined : await this.accountName(me, body.accountId)
    const row = await this.prisma.project.update({
      where: { id },
      data: {
        code: body.code ?? undefined,
        name: body.name ?? undefined,
        accountId: body.accountId === undefined ? undefined : body.accountId || null,
        accountName: accountName === undefined ? undefined : accountName ?? '',
        status: STATUSES.includes(String(body.status)) ? String(body.status) : undefined,
        ownerName: body.owner ?? undefined,
        budget: body.budget === undefined ? undefined : Number(body.budget) || 0,
        startDate: body.startDate ?? undefined,
        endDate: body.endDate ?? undefined,
        description: body.description ?? undefined,
        milestones:
          body.milestones === undefined
            ? undefined
            : (cleanMilestones(body.milestones) as Prisma.InputJsonValue),
      },
    })
    return toProject(row)
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.find(me, id)
    await this.prisma.$transaction([
      this.prisma.project.update({ where: { id }, data: { deletedAt: new Date() } }),
      // 解除报价/合同与已删除项目的关联
      this.prisma.quote.updateMany({ where: { tenantId: me.tenantId, projectId: id }, data: { projectId: null } }),
      this.prisma.contract.updateMany({ where: { tenantId: me.tenantId, projectId: id }, data: { projectId: null } }),
    ])
    return { ok: true }
  }
}
