import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Prisma } from '@prisma/client'
import type { EmailTemplate, KnowledgeArticle } from '@prisma/client'
import { randomUUID } from 'crypto'
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { PERMISSIONS, ErrorCodes, BizException } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import {
  recordEmailSend,
  toEmailSend,
  toMeeting,
  toNps,
  toPartner,
  toSegment,
  toSuccessPlan,
} from './success.mapper'
import { tr } from '../../common/locale'

class KnowledgeDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  @IsString()
  tags?: string
}

class PartnerDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  region?: string

  @IsOptional()
  @IsString()
  remark?: string
}

class NpsDto {
  @IsString()
  accountId!: string

  @IsInt()
  @Min(0)
  @Max(10)
  score!: number

  @IsOptional()
  @IsString()
  comment?: string

  @IsOptional()
  @IsString()
  contactName?: string
}

function toArticle(a: KnowledgeArticle) {
  return {
    id: a.id,
    title: a.title,
    category: a.category,
    content: a.content,
    tags: a.tags,
    authorId: a.authorId ?? '',
    authorName: a.authorName,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }
}

function toEmailTemplate(t: EmailTemplate) {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category,
    createdBy: t.createdByName,
    createdAt: t.createdAt.toISOString(),
  }
}

/** 销售赋能：知识库 / 渠道伙伴 / NPS 满意度（Setting JSON 存储） */
@ApiTags('enablement')
@Controller()
export class EnablementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** 以下读取均按创建时间正序，与原 JSON 追加顺序一致 */
  private async partners(me: AuthUser) {
    const rows = await this.prisma.channelPartner.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toPartner)
  }

  private async npsItems(me: AuthUser) {
    const rows = await this.prisma.npsScore.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toNps)
  }

  private async meetings(me: AuthUser, entityType?: string, entityId?: string) {
    const rows = await this.prisma.meeting.findMany({
      where: { tenantId: me.tenantId, ...(entityType && entityId ? { entityType, entityId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: { actionItems: true },
    })
    return rows.map(toMeeting)
  }

  private async segments(me: AuthUser) {
    const rows = await this.prisma.customerSegment.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toSegment)
  }

  private async emailSends(me: AuthUser) {
    const rows = await this.prisma.emailSend.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { sentAt: 'asc' },
    })
    return rows.map(toEmailSend)
  }

  // ========== 知识库 ==========

  @Get('knowledge')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listKnowledge(
    @CurrentUser() me: AuthUser,
    @Query('q') q?: string,
    @Query('category') category?: string,
  ) {
    const rows = await this.prisma.knowledgeArticle.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    const items = rows.map(toArticle)
    let filtered = items
    if (category) {
      filtered = filtered.filter((a) => a.category === category)
    }
    const kw = (q ?? '').trim().toLowerCase()
    if (kw) {
      // 多字段加权：标题 5 / 标签 3 / 分类 2 / 正文 1；支持空格多关键词
      const tokens = kw.split(/\s+/).filter(Boolean)
      const scored = filtered
        .map((a) => {
          const title = String(a.title ?? '').toLowerCase()
          const tags = String(a.tags ?? '').toLowerCase()
          const cat = String(a.category ?? '').toLowerCase()
          const content = String(a.content ?? '').toLowerCase()
          let score = 0
          let matchedAll = true
          for (const t of tokens) {
            let s = 0
            if (title.includes(t)) s += 5
            if (tags.includes(t)) s += 3
            if (cat.includes(t)) s += 2
            if (content.includes(t)) s += 1
            if (s === 0) matchedAll = false
            score += s
          }
          return { a, score, matchedAll }
        })
        .filter((x) => x.matchedAll && x.score > 0)
        .sort((x, y) => y.score - x.score)
        .map((x) => ({ ...x.a, _score: x.score }))
      return {
        items: scored,
        total: scored.length,
        categories: [...new Set(items.map((x) => String(x.category ?? 'general')))],
      }
    }
    return {
      items: filtered,
      total: filtered.length,
      categories: [...new Set(items.map((x) => String(x.category ?? 'general')))],
    }
  }

  @Post('knowledge')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async createKnowledge(@CurrentUser() me: AuthUser, @Body() dto: KnowledgeDto) {
    const row = await this.prisma.knowledgeArticle.create({
      data: {
        tenantId: me.tenantId,
        title: dto.title,
        category: dto.category ?? 'general',
        content: dto.content ?? '',
        tags: dto.tags ?? '',
        authorId: me.id,
        authorName: me.name ?? me.email,
      },
    })
    return toArticle(row)
  }

  @Put('knowledge/:id')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async updateKnowledge(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<KnowledgeDto>,
  ) {
    const found = await this.prisma.knowledgeArticle.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!found) throw new BizException(ErrorCodes.NOT_FOUND, 'article not found')
    const row = await this.prisma.knowledgeArticle.update({
      where: { id },
      data: {
        title: dto.title ?? undefined,
        category: dto.category ?? undefined,
        content: dto.content ?? undefined,
        tags: dto.tags ?? undefined,
      },
    })
    return toArticle(row)
  }

  @Delete('knowledge/:id')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async removeKnowledge(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.knowledgeArticle.updateMany({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  // ========== 渠道伙伴 ==========

  @Get('partners')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listPartners(@CurrentUser() me: AuthUser) {
    const items = await this.partners(me)
    // 关联业绩：线索/商机 source=PARTNER 或名称匹配
    const [leads, opps] = await Promise.all([
      this.prisma.lead.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, source: 'PARTNER' },
        select: { id: true, name: true, status: true, remark: true, ownerId: true, createdAt: true },
      }),
      this.prisma.opportunity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, source: 'PARTNER' },
        select: {
          id: true,
          name: true,
          amount: true,
          amountBase: true,
          stage: { select: { code: true } },
          ownerId: true,
          createdAt: true,
        },
      }),
    ])
    return items.map((p) => {
      const name = String(p.name ?? '')
      const relatedOpps = opps.filter((o) => o.name.includes(name) || name === '')
      const relatedLeads = leads.filter((l) => l.name.includes(name) || (l.remark ?? '').includes(name))
      const won = relatedOpps.filter((o) => o.stage.code === 'WON')
      return {
        ...p,
        leadCount: relatedLeads.length,
        oppCount: relatedOpps.length,
        oppAmount: relatedOpps.reduce((s, o) => s + Number(o.amountBase), 0).toFixed(2),
        wonCount: won.length,
        wonAmount: won.reduce((s, o) => s + Number(o.amountBase), 0).toFixed(2),
      }
    })
  }

  @Post('partners')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async createPartner(@CurrentUser() me: AuthUser, @Body() dto: PartnerDto) {
    const row = await this.prisma.channelPartner.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        contactName: dto.contactName ?? '',
        phone: dto.phone ?? '',
        region: dto.region ?? '',
        remark: dto.remark ?? '',
      },
    })
    return toPartner(row)
  }

  @Put('partners/:id')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async updatePartner(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<PartnerDto>,
  ) {
    const found = await this.prisma.channelPartner.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!found) throw new BizException(ErrorCodes.NOT_FOUND, 'partner not found')
    const row = await this.prisma.channelPartner.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        contactName: dto.contactName ?? undefined,
        phone: dto.phone ?? undefined,
        region: dto.region ?? undefined,
        remark: dto.remark ?? undefined,
      },
    })
    return toPartner(row)
  }

  @Delete('partners/:id')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async removePartner(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.channelPartner.updateMany({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  /** 伙伴门户视图：该伙伴名下线索/商机/合同聚合 */
  @Get('partners/:id/portal')
  @Permissions(PERMISSIONS.REPORT_READ)
  async partnerPortal(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const items = await this.partners(me)
    const partner = items.find((x) => x.id === id)
    if (!partner) throw new BizException(ErrorCodes.NOT_FOUND, 'partner not found')
    const name = String(partner.name ?? '')

    const [leads, opps, contracts] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          source: 'PARTNER',
          OR: [{ name: { contains: name } }, { remark: { contains: name } }],
        },
        select: {
          id: true,
          name: true,
          status: true,
          expectedAmount: true,
          createdAt: true,
        },
        take: 50,
      }),
      this.prisma.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          source: 'PARTNER',
          OR: [{ name: { contains: name } }],
        },
        select: {
          id: true,
          name: true,
          amount: true,
          amountBase: true,
          stage: { select: { code: true, name: true } },
          expectedCloseDate: true,
          createdAt: true,
        },
        take: 50,
      }),
      this.prisma.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          title: { contains: name },
        },
        select: { id: true, contractNo: true, title: true, total: true, status: true, createdAt: true },
        take: 20,
      }),
    ])

    const wonAmount = opps
      .filter((o) => o.stage.code === 'WON')
      .reduce((s, o) => s + Number(o.amountBase), 0)
    const openAmount = opps
      .filter((o) => o.stage.code !== 'WON' && o.stage.code !== 'LOST')
      .reduce((s, o) => s + Number(o.amountBase), 0)
    const rateRow = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'partner.commission.rate', scope: 'TENANT' },
    })
    const commissionRate = Number(rateRow?.value ?? 0.1)
    const estimatedCommission = wonAmount * commissionRate

    return {
      partner,
      summary: {
        leadCount: leads.length,
        oppCount: opps.length,
        openAmount: openAmount.toFixed(2),
        wonAmount: wonAmount.toFixed(2),
        contractCount: contracts.length,
        commissionRate: commissionRate.toFixed(4),
        estimatedCommission: estimatedCommission.toFixed(2),
      },
      leads,
      opportunities: opps.map((o) => ({
        ...o,
        amount: String(o.amount),
        expectedCloseDate: o.expectedCloseDate?.toISOString().slice(0, 10) ?? '',
      })),
      contracts: contracts.map((c) => ({ ...c, total: String(c.total) })),
    }
  }

  // ========== NPS 满意度 ==========

  @Get('nps')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listNps(@CurrentUser() me: AuthUser) {
    const items = await this.npsItems(me)
    const scores = items.map((x) => Number(x.score ?? 0))
    const promoters = scores.filter((s) => s >= 9).length
    const passives = scores.filter((s) => s >= 7 && s <= 8).length
    const detractors = scores.filter((s) => s <= 6).length
    const n = scores.length || 1
    const nps = Math.round(((promoters - detractors) / n) * 100)
    const avg = scores.length
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : '0'
    return {
      nps,
      avg,
      promoters,
      passives,
      detractors,
      total: items.length,
      items: [...items].reverse().slice(0, 50),
    }
  }

  @Post('nps')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async createNps(@CurrentUser() me: AuthUser, @Body() dto: NpsDto) {
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    const row = await this.prisma.npsScore.create({
      data: {
        tenantId: me.tenantId,
        accountId: account.id,
        accountName: account.name,
        contactName: dto.contactName ?? '',
        score: dto.score,
        comment: dto.comment ?? '',
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toNps(row)
  }

  /** 合同生效客户待回访清单（用于 NPS） */
  @Get('nps/pending')
  @Permissions(PERMISSIONS.REPORT_READ)
  async npsPending(@CurrentUser() me: AuthUser) {
    const items = await this.npsItems(me)
    const scoredIds = new Set(items.map((x) => String(x.accountId)))
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['EFFECTIVE', 'FINISHED'] },
      },
      include: { account: { select: { id: true, name: true } } },
      orderBy: { effectiveDate: 'desc' },
      take: 50,
    })
    const seen = new Set<string>()
    const pending: Array<Record<string, unknown>> = []
    for (const c of contracts) {
      if (!c.account || scoredIds.has(c.account.id) || seen.has(c.account.id)) continue
      seen.add(c.account.id)
      pending.push({
        accountId: c.account.id,
        accountName: c.account.name,
        contractNo: c.contractNo,
        total: String(c.total),
      })
    }
    return { items: pending, total: pending.length }
  }

  /** NPS 月度趋势：得分 / 均分 / 样本数 */
  @Get('nps/trend')
  @Permissions(PERMISSIONS.REPORT_READ)
  async npsTrend(@CurrentUser() me: AuthUser, @Query('months') months?: string) {
    const n = Math.min(Math.max(Number(months ?? 6) || 6, 1), 24)
    const items = await this.npsItems(me)
    const now = new Date()
    const buckets: Array<{ month: string; nps: number; avg: string; count: number; promoters: number; passives: number; detractors: number }> = []
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        nps: 0,
        avg: '0',
        count: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
      })
    }
    const map = new Map(buckets.map((b) => [b.month, b]))
    for (const it of items) {
      const created = String(it.createdAt ?? '')
      const month = created.slice(0, 7)
      const b = map.get(month)
      if (!b) continue
      const score = Number(it.score ?? 0)
      b.count++
      if (score >= 9) b.promoters++
      else if (score >= 7) b.passives++
      else b.detractors++
    }
    for (const b of buckets) {
      const scores = items
        .filter((it) => String(it.createdAt ?? '').startsWith(b.month))
        .map((it) => Number(it.score ?? 0))
      const sum = scores.reduce((a, s) => a + s, 0)
      b.avg = scores.length ? (sum / scores.length).toFixed(1) : '0'
      b.nps = scores.length ? Math.round(((b.promoters - b.detractors) / scores.length) * 100) : 0
    }
    return { months: n, items: buckets }
  }

  /** 单客户 NPS 历史 */
  @Get('nps/account/:accountId')
  @Permissions(PERMISSIONS.REPORT_READ)
  async npsAccount(@CurrentUser() me: AuthUser, @Param('accountId') accountId: string) {
    const items = await this.npsItems(me)
    const rows = items
      .filter((x) => String(x.accountId) === accountId)
      .slice()
      .reverse()
    const scores = rows.map((x) => Number(x.score ?? 0))
    const promoters = scores.filter((s) => s >= 9).length
    const detractors = scores.filter((s) => s <= 6).length
    const nps = scores.length ? Math.round(((promoters - detractors) / scores.length) * 100) : 0
    const avg = scores.length
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : '0'
    return {
      accountId,
      nps,
      avg,
      total: rows.length,
      promoters,
      detractors,
      items: rows.slice(0, 20),
    }
  }

  /** 低分预警：贬损者（≤6 分）待跟进 */
  @Get('nps/alerts')
  @Permissions(PERMISSIONS.REPORT_READ)
  async npsAlerts(@CurrentUser() me: AuthUser) {
    const items = await this.npsItems(me)
    const seen = new Set<string>()
    const alerts: Array<Record<string, unknown>> = []
    for (const it of [...items].reverse()) {
      const score = Number(it.score ?? 0)
      const aid = String(it.accountId ?? '')
      if (score > 6 || !aid || seen.has(aid)) continue
      seen.add(aid)
      alerts.push({
        id: it.id,
        accountId: aid,
        accountName: it.accountName ?? '',
        score,
        comment: it.comment ?? '',
        contactName: it.contactName ?? '',
        createdAt: it.createdAt ?? '',
        level: score <= 3 ? 'HIGH' : 'MEDIUM',
      })
      if (alerts.length >= 20) break
    }
    return { items: alerts, total: alerts.length }
  }

  /** 低分回访：创建跟进活动 + 通知负责人 */
  @Post('nps/followup')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async npsFollowup(
    @CurrentUser() me: AuthUser,
    @Body() body: { accountId: string; note?: string; score?: number },
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: body.accountId, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, ownerId: true },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    const note = body.note?.trim() || tr('NPS 低分回访：确认问题原因并给出改进方案', 'Low NPS follow-up: confirm the cause and propose improvements')
    const due = new Date(Date.now() + 2 * 86400000)
    const activity = await this.prisma.activity.create({
      data: {
        tenantId: me.tenantId,
        type: 'CALL',
        subject: tr(`NPS 回访：${account.name}`, `NPS follow-up: ${account.name}`),
        status: 'PLANNED',
        content: note,
        entityType: 'ACCOUNT',
        entityId: account.id,
        ownerId: account.ownerId ?? me.id,
        dueAt: due,
        source: 'AI',
        createdById: me.id,
        updatedById: me.id,
      },
    })
    await this.push.notify(
      me.tenantId,
      account.ownerId ?? me.id,
      'NPS_FOLLOWUP',
      { zh: 'NPS 低分回访', en: 'Low NPS follow-up' },
      { zh: `客户「${account.name}」NPS 偏低，请 2 天内回访`, en: `Account "${account.name}" gave a low NPS. Follow up within 2 days.` },
      'ACCOUNT',
      account.id,
    )
    return { ok: true, activityId: activity.id, accountName: account.name, dueAt: due }
  }

  // ========== 会议纪要 ==========

  @Get('meetings')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listMeetings(
    @CurrentUser() me: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    const items = await this.meetings(me, entityType, entityId)
    return { items: [...items].reverse(), total: items.length }
  }

  @Post('meetings')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async createMeeting(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      title: string
      entityType?: string
      entityId?: string
      heldAt?: string
      attendees?: string
      agenda?: string
      decisions?: string
      actions?: string
    },
  ) {
    const actionList = String(body.actions ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        text: line,
        owner: me.name ?? me.email,
        due: '',
        done: false,
      }))
    if (!body.title?.trim()) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'title required')
    const heldAt = body.heldAt ? new Date(body.heldAt) : new Date()
    if (Number.isNaN(heldAt.getTime())) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'heldAt invalid')
    const row = await this.prisma.meeting.create({
      data: {
        tenantId: me.tenantId,
        title: body.title.trim(),
        entityType: body.entityType ?? 'ACCOUNT',
        entityId: body.entityId ?? '',
        heldAt,
        attendees: body.attendees ?? '',
        agenda: body.agenda ?? '',
        decisions: body.decisions ?? '',
        actions: body.actions ?? '',
        createdById: me.id,
        createdByName: me.name ?? me.email,
        actionItems: { create: actionList.map((a, i) => ({ ...a, sort: i })) },
      },
      include: { actionItems: true },
    })
    return toMeeting(row)
  }

  @Delete('meetings/:id')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async removeMeeting(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.meeting.deleteMany({ where: { id, tenantId: me.tenantId } })
    return { ok: true }
  }

  /** 会议行动项跟踪：汇总所有未完成行动 */
  @Get('meeting-actions')
  @Permissions(PERMISSIONS.REPORT_READ)
  async meetingActions(@CurrentUser() me: AuthUser) {
    const items = await this.meetings(me)
    const rows: Array<Record<string, unknown>> = []
    for (const m of items) {
      const list = Array.isArray(m.actionList) ? (m.actionList as Record<string, unknown>[]) : []
      list.forEach((a, idx) => {
        rows.push({
          meetingId: m.id,
          meetingTitle: m.title,
          index: idx,
          text: a.text,
          owner: a.owner,
          due: a.due,
          done: !!a.done,
          entityType: m.entityType,
          entityId: m.entityId,
          heldAt: m.heldAt,
        })
      })
    }
    const open = rows.filter((r) => !r.done)
    return {
      total: rows.length,
      openCount: open.length,
      items: [...open, ...rows.filter((r) => r.done)].slice(0, 50),
    }
  }

  @Post('meeting-actions/toggle')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async toggleMeetingAction(
    @CurrentUser() me: AuthUser,
    @Body() body: { meetingId: string; index: number },
  ) {
    const m = await this.prisma.meeting.findFirst({
      where: { id: body.meetingId, tenantId: me.tenantId },
      select: { id: true },
    })
    if (!m) throw new BizException(ErrorCodes.NOT_FOUND, 'meeting not found')
    const action = await this.prisma.meetingAction.findUnique({
      where: { meetingId_sort: { meetingId: m.id, sort: Number(body.index) } },
    })
    if (!action) throw new BizException(ErrorCodes.UNPROCESSABLE, 'invalid action index')
    // 条件更新：并发切换不会互相覆盖
    await this.prisma.meetingAction.updateMany({
      where: { id: action.id, done: action.done },
      data: { done: !action.done },
    })
    const a = await this.prisma.meetingAction.findUniqueOrThrow({ where: { id: action.id } })
    return { ok: true, action: { text: a.text, owner: a.owner, due: a.due, done: a.done } }
  }

  /** 客户成功健康看板：计划采纳度 + 复盘到期 + 风险 */
  @Get('success-health')
  @Permissions(PERMISSIONS.REPORT_READ)
  async successHealth(@CurrentUser() me: AuthUser) {
    const plans = await this.prisma.successPlan.findMany({ where: { tenantId: me.tenantId } })
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: plans.map((p) => p.accountId) }, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, stage: true, ownerId: true },
    })
    const owners = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))

    const rows = accounts.map((a) => {
      const plan = plans.find((p) => p.accountId === a.id)
      const v = (plan ? toSuccessPlan(plan) : {}) as {
        adoption?: number
        goals?: string
        risks?: string
        nextReview?: string
        champion?: string
        milestones?: { text: string; done: boolean }[]
      }
      const adoption = Number(v.adoption ?? 0)
      const milestones = v.milestones ?? []
      const done = milestones.filter((m) => m.done).length
      const reviewDue = v.nextReview
        ? new Date(v.nextReview).getTime() < Date.now()
        : false
      let status = 'HEALTHY'
      if (adoption < 40 || reviewDue || (v.risks && String(v.risks).length > 10)) status = 'AT_RISK'
      if (adoption < 20) status = 'RISK'
      return {
        accountId: a.id,
        accountName: a.name,
        owner: umap.get(a.ownerId) ?? '',
        adoption,
        goals: v.goals ?? '',
        champion: v.champion ?? '',
        risks: v.risks ?? '',
        nextReview: v.nextReview ?? '',
        milestonesDone: done,
        milestonesTotal: milestones.length,
        reviewDue,
        status,
      }
    })
    rows.sort((a, b) => a.adoption - b.adoption)
    return {
      total: rows.length,
      atRisk: rows.filter((r) => r.status !== 'HEALTHY').length,
      items: rows,
    }
  }

  // ========== 客户成功计划 ==========

  @Get('accounts/:id/success-plan')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async getSuccessPlan(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.successPlan.findUnique({
      where: { tenantId_accountId: { tenantId: me.tenantId, accountId: id } },
    })
    return (
      (row ? toSuccessPlan(row) : null) ?? {
        goals: '',
        milestones: [],
        adoption: 0,
        champion: '',
        risks: '',
        nextReview: '',
      }
    )
  }

  @Put('accounts/:id/success-plan')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async saveSuccessPlan(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    const adoption = Math.round(Number(body.adoption ?? 0))
    const data = {
      goals: String(body.goals ?? ''),
      milestones: (Array.isArray(body.milestones) ? body.milestones : []) as Prisma.InputJsonValue,
      adoption: Number.isFinite(adoption) ? Math.min(Math.max(adoption, 0), 100) : 0,
      champion: String(body.champion ?? ''),
      risks: String(body.risks ?? ''),
      nextReview: String(body.nextReview ?? ''),
      updatedById: me.id,
      updatedByName: me.name ?? me.email,
    }
    const row = await this.prisma.successPlan.upsert({
      where: { tenantId_accountId: { tenantId: me.tenantId, accountId: id } },
      update: data,
      create: { tenantId: me.tenantId, accountId: id, ...data },
    })
    return toSuccessPlan(row)
  }

  // ========== 工作台自定义 ==========

  @Get('dashboard/layout')
  @Permissions(PERMISSIONS.REPORT_READ)
  async getDashboardLayout(@CurrentUser() me: AuthUser) {
    const row = await this.prisma.setting.findFirst({
      where: {
        tenantId: me.tenantId,
        key: 'dashboard.layout',
        scope: 'USER',
        userId: me.id,
      },
    })
    return (row?.value as Record<string, unknown>) ?? { hidden: [], favorites: [] }
  }

  @Put('dashboard/layout')
  @Permissions(PERMISSIONS.REPORT_READ)
  async saveDashboardLayout(
    @CurrentUser() me: AuthUser,
    @Body() body: { hidden?: string[]; favorites?: string[] },
  ) {
    const value = {
      hidden: Array.isArray(body.hidden) ? body.hidden : [],
      favorites: Array.isArray(body.favorites) ? body.favorites : [],
      updatedAt: new Date().toISOString(),
    }
    const row = await this.prisma.setting.findFirst({
      where: {
        tenantId: me.tenantId,
        key: 'dashboard.layout',
        scope: 'USER',
        userId: me.id,
      },
    })
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: value as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'dashboard.layout',
          scope: 'USER',
          userId: me.id,
          value: value as never,
        },
      })
    }
    return value
  }

  // ========== 邮件模板 ==========

  @Get('email-templates')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listEmailTemplates(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.emailTemplate.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return { items: rows.map(toEmailTemplate), total: rows.length }
  }

  @Post('email-templates')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async createEmailTemplate(
    @CurrentUser() me: AuthUser,
    @Body() body: { name: string; subject: string; body: string; category?: string },
  ) {
    if (!body.name?.trim()) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'name required')
    const row = await this.prisma.emailTemplate.create({
      data: {
        tenantId: me.tenantId,
        name: body.name.trim(),
        subject: body.subject ?? '',
        body: body.body ?? '',
        category: body.category ?? 'general',
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toEmailTemplate(row)
  }

  @Delete('email-templates/:id')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async removeEmailTemplate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.emailTemplate.updateMany({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  /** 预览：变量替换 */
  @Post('email-templates/:id/preview')
  @Permissions(PERMISSIONS.REPORT_READ)
  async previewEmailTemplate(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { vars?: Record<string, string> },
  ) {
    const tpl = await this.prisma.emailTemplate.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!tpl) throw new BizException(ErrorCodes.NOT_FOUND, 'template not found')
    const vars = {
      客户名称: body.vars?.['客户名称'] ?? tr('示例客户', 'Sample Customer'),
      联系人: body.vars?.['联系人'] ?? tr('张经理', 'Mr. Zhang'),
      产品: body.vars?.['产品'] ?? tr('智销 CRM', 'ZhiXiao CRM'),
      金额: body.vars?.['金额'] ?? '98000',
      日期: body.vars?.['日期'] ?? new Date().toISOString().slice(0, 10),
      我司: body.vars?.['我司'] ?? tr('智销科技', 'ZhiXiao Tech'),
      ...(body.vars ?? {}),
    }
    const render = (s: string) =>
      Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(v), s)
    return {
      subject: render(String(tpl.subject ?? '')),
      body: render(String(tpl.body ?? '')),
    }
  }

  // ========== 邮件发送与跟踪 ==========

  @Get('email-sends')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listEmailSends(@CurrentUser() me: AuthUser) {
    const items = await this.emailSends(me)
    return { items: [...items].reverse(), total: items.length }
  }

  /** 发送邮件（记录日志 + 注入打开像素/点击跟踪链接） */
  @Post('email-sends')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async sendEmail(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      to: string
      toName?: string
      subject: string
      body: string
      templateId?: string
      entityType?: string
      entityId?: string
    },
  ) {
    const id = randomUUID()
    const pixelUrl = `/api/v1/track/open/${id}.gif`
    const html = `${String(body.body ?? '').replace(/<a\s+([^>]*href=["'])([^"']+)/gi, (_m, pre: string, href: string) => {
      if (href.startsWith('mailto:') || href.includes('/track/click/')) return `${pre}${href}`
      return `${pre}/api/v1/track/click/${id}?u=${encodeURIComponent(href)}`
    })}
      <img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`
    const row = await recordEmailSend(this.prisma, me, {
      id,
      to: body.to,
      toName: body.toName ?? '',
      subject: body.subject,
      body: String(body.body ?? ''),
      html,
      templateId: body.templateId ?? '',
      entityType: body.entityType ?? '',
      entityId: body.entityId ?? '',
    })
    return toEmailSend(row)
  }

  /** 邮件触达统计 */
  @Get('email-engagement')
  @Permissions(PERMISSIONS.REPORT_READ)
  async emailEngagement(@CurrentUser() me: AuthUser) {
    const items = await this.emailSends(me)
    const total = items.length
    const opened = items.filter((x) => Number((x as { openCount?: number }).openCount ?? 0) > 0).length
    const clicked = items.filter((x) => Number((x as { clickCount?: number }).clickCount ?? 0) > 0).length
    return {
      total,
      opened,
      clicked,
      openRate: total ? ((opened / total) * 100).toFixed(1) : '0',
      clickRate: total ? ((clicked / total) * 100).toFixed(1) : '0',
      recent: items.slice(-8).reverse(),
    }
  }

  // ========== 客户分群 ==========

  @Get('segments')
  @Permissions(PERMISSIONS.REPORT_READ)
  async listSegments(@CurrentUser() me: AuthUser) {
    const items = await this.segments(me)
    return { items: [...items].reverse(), total: items.length }
  }

  @Post('segments')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async createSegment(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      name: string
      stage?: string
      industry?: string
      level?: string
      tag?: string
      minAmount?: string
      note?: string
    },
  ) {
    if (!body.name?.trim()) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'name required')
    const row = await this.prisma.customerSegment.create({
      data: {
        tenantId: me.tenantId,
        name: body.name.trim(),
        stage: body.stage ?? '',
        industry: body.industry ?? '',
        level: body.level ?? '',
        tag: body.tag ?? '',
        minAmount: body.minAmount ?? '',
        note: body.note ?? '',
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toSegment(row)
  }

  @Get('segments/:id/members')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async segmentMembers(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const items = await this.segments(me)
    const seg = items.find((x) => x.id === id)
    if (!seg) throw new BizException(ErrorCodes.NOT_FOUND, 'segment not found')

    const where: Record<string, unknown> = {
      tenantId: me.tenantId,
      deletedAt: null,
    }
    if (seg.stage) where.stage = seg.stage
    if (seg.industry) where.industry = seg.industry
    if (seg.level) where.level = seg.level

    let accounts = await this.prisma.account.findMany({
      where,
      select: {
        id: true,
        name: true,
        stage: true,
        level: true,
        industry: true,
        customValues: true,
        ownerId: true,
      },
      take: 200,
    })
    if (seg.tag) {
      accounts = accounts.filter((a) => {
        const tags = ((a.customValues as { tags?: string[] })?.tags ?? []) as string[]
        return tags.includes(String(seg.tag))
      })
    }
    return {
      segment: seg,
      total: accounts.length,
      items: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        stage: a.stage,
        level: a.level,
        industry: a.industry ?? '',
        tags: ((a.customValues as { tags?: string[] })?.tags ?? []) as string[],
      })),
    }
  }

  @Put('segments/:id')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async updateSegment(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const found = await this.prisma.customerSegment.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!found) throw new BizException(ErrorCodes.NOT_FOUND, 'segment not found')
    const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined)
    const row = await this.prisma.customerSegment.update({
      where: { id },
      data: {
        name: str('name'),
        stage: str('stage'),
        industry: str('industry'),
        level: str('level'),
        tag: str('tag'),
        minAmount: str('minAmount'),
        note: str('note'),
        autoOutreach: typeof body.autoOutreach === 'boolean' ? body.autoOutreach : undefined,
      },
    })
    return toSegment(row)
  }

  @Delete('segments/:id')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async removeSegment(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.customerSegment.updateMany({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  /** 分群自动化触达：为分群成员批量创建关怀跟进 */
  @Post('segments/:id/outreach')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async segmentOutreach(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { template?: string } = {},
  ) {
    const items = await this.segments(me)
    const seg = items.find((x) => x.id === id)
    if (!seg) throw new BizException(ErrorCodes.NOT_FOUND, 'segment not found')

    const where: Record<string, unknown> = {
      tenantId: me.tenantId,
      deletedAt: null,
    }
    if (seg.stage) where.stage = seg.stage
    if (seg.industry) where.industry = seg.industry
    if (seg.level) where.level = seg.level

    let accounts = await this.prisma.account.findMany({
      where,
      select: {
        id: true,
        name: true,
        ownerId: true,
        customValues: true,
      },
      take: 50,
    })
    if (seg.tag) {
      accounts = accounts.filter((a) => {
        const tags = ((a.customValues as { tags?: string[] })?.tags ?? []) as string[]
        return tags.includes(String(seg.tag))
      })
    }

    const template =
      body.template ||
      tr(`【分群触达】${seg.name}：请完成本周期客户关怀与需求确认`, `[Segment outreach] ${seg.name}: complete this cycle's customer care and needs check`)
    const due = new Date(Date.now() + 3 * 86400000)
    let created = 0
    for (const a of accounts) {
      await this.prisma.activity.create({
        data: {
          tenantId: me.tenantId,
          type: 'CALL',
          subject: tr(`分群触达：${a.name}`, `Segment outreach: ${a.name}`),
          status: 'PLANNED',
          content: template,
          entityType: 'ACCOUNT',
          entityId: a.id,
          ownerId: a.ownerId,
          dueAt: due,
          source: 'AI',
          createdById: me.id,
          updatedById: me.id,
        },
      })
      await this.push.notify(
        me.tenantId,
        a.ownerId,
        'SEGMENT_OUTREACH',
        { zh: `分群触达 · ${seg.name}`, en: `Segment outreach · ${seg.name}` },
        { zh: `请在 3 天内联系「${a.name}」`, en: `Please contact "${a.name}" within 3 days` },
        'ACCOUNT',
        a.id,
      )
      created++
    }
    return { ok: true, segment: seg.name, created }
  }
}
