import { Injectable } from '@nestjs/common'
import { ActivitySource, BizException, ErrorCodes, PageResult } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async myToday(me: AuthUser) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)

    const [dueToday, overdue, planned] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          tenantId: me.tenantId,
          ownerId: me.id,
          deletedAt: null,
          status: 'PLANNED',
          dueAt: { gte: start, lte: end },
        },
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.activity.findMany({
        where: {
          tenantId: me.tenantId,
          ownerId: me.id,
          deletedAt: null,
          status: 'PLANNED',
          dueAt: { lt: start },
        },
        orderBy: { dueAt: 'asc' },
        take: 10,
      }),
      this.prisma.activity.findMany({
        where: {
          tenantId: me.tenantId,
          ownerId: me.id,
          deletedAt: null,
          status: 'PLANNED',
          dueAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])
    return { dueToday, overdue, planned }
  }

  async list(
    me: AuthUser,
    q: {
      entityType?: string
      entityId?: string
      page: number
      pageSize: number
      from?: string
      to?: string
      status?: string
    },
  ): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      ...(q.entityType && q.entityId
        ? { entityType: q.entityType, entityId: q.entityId }
        : { ownerId: me.id }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            OR: [
              {
                dueAt: {
                  ...(q.from ? { gte: new Date(q.from) } : {}),
                  ...(q.to ? { lte: new Date(q.to) } : {}),
                },
              },
              {
                startAt: {
                  ...(q.from ? { gte: new Date(q.from) } : {}),
                  ...(q.to ? { lte: new Date(q.to) } : {}),
                },
              },
            ],
          }
        : {}),
    }
    const page = Math.max(q.page, 1)
    const pageSize = Math.min(Math.max(q.pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.activity.count({ where }),
      this.prisma.activity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ])
    return { items, page, pageSize, total, hasMore: page * pageSize < total }
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    return this.prisma.activity
      .create({
        data: {
          tenantId: me.tenantId,
          type: data.type as string,
          subject: data.subject as string,
          status: data.dueAt ? 'PLANNED' : 'DONE',
          content: (data.content as string) ?? null,
          entityType: (data.entityType as string) ?? 'LEAD',
          entityId: (data.entityId as string) ?? '',
          ownerId: me.id,
          dueAt: data.dueAt ? new Date(data.dueAt as string) : null,
          startAt: data.startAt ? new Date(data.startAt as string) : null,
          source: 'MANUAL',
          createdById: me.id,
          updatedById: me.id,
        },
      })
      .then(async (row) => {
        // 线索评分：每次活动 +5（上限 100）
        if (row.entityType === 'LEAD' && row.entityId) {
          const lead = await this.prisma.lead.findFirst({
            where: { id: row.entityId, tenantId: me.tenantId, deletedAt: null },
          })
          if (lead) {
            await this.prisma.lead.update({
              where: { id: lead.id },
              data: { score: Math.min(100, lead.score + 5) },
            })
          }
        }
        return row
      })
  }

  /**
   * 批量创建活动（跟进计划/Cadence 启动用）
   * 一次请求最多 200 条，整体事务写入；线索统一 +5 分（每条一次，上限 100）。
   */
  async createBatch(
    me: AuthUser,
    items: Array<{
      type?: string
      subject: string
      content?: string
      entityType?: string
      entityId?: string
      dueAt?: string | null
    }>,
  ) {
    const list = (items ?? []).filter((i) => i?.subject).slice(0, 200)
    if (!list.length) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'items required')

    const created = await this.prisma.$transaction(
      list.map((d) =>
        this.prisma.activity.create({
          data: {
            tenantId: me.tenantId,
            type: d.type ?? 'TASK',
            subject: d.subject,
            status: d.dueAt ? 'PLANNED' : 'DONE',
            content: d.content ?? null,
            entityType: d.entityType ?? 'LEAD',
            entityId: d.entityId ?? '',
            ownerId: me.id,
            dueAt: d.dueAt ? new Date(d.dueAt) : null,
            source: ActivitySource.CADENCE,
            createdById: me.id,
            updatedById: me.id,
          },
        }),
      ),
    )

    // 线索评分：命中线索的条数 × 5，上限 100
    const leadIds = [...new Set(created.filter((c) => c.entityType === 'LEAD' && c.entityId).map((c) => c.entityId))]
    for (const leadId of leadIds) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, tenantId: me.tenantId, deletedAt: null },
      })
      if (lead) {
        const hits = created.filter((c) => c.entityType === 'LEAD' && c.entityId === leadId).length
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { score: Math.min(100, lead.score + hits * 5) },
        })
      }
    }

    return { created: created.length, activityIds: created.map((c) => c.id) }
  }

  async complete(me: AuthUser, id: string) {
    const act = await this.prisma.activity.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!act) throw new BizException(ErrorCodes.NOT_FOUND, 'activity not found')
    return this.prisma.activity.update({
      where: { id },
      data: { status: 'DONE', updatedById: me.id },
    })
  }

  async checkIn(
    me: AuthUser,
    body: { id: string; lat: number; lng: number; address?: string },
  ) {
    const act = await this.prisma.activity.findFirst({
      where: { id: body.id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!act) throw new BizException(ErrorCodes.NOT_FOUND, 'activity not found')
    if (act.type !== 'VISIT') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'only VISIT supports check-in')
    }
    return this.prisma.activity.update({
      where: { id: body.id },
      data: {
        checkInLat: body.lat as never,
        checkInLng: body.lng as never,
        checkInAddress: body.address ?? null,
        checkInAt: new Date(),
        updatedById: me.id,
      },
    })
  }

  /** 拜访路线：当日拜访按区域聚类给出建议顺序 */
  async visitRoute(me: AuthUser, date?: string) {
    const day = date ? new Date(date) : new Date()
    const start = new Date(day)
    start.setHours(0, 0, 0, 0)
    const end = new Date(day)
    end.setHours(23, 59, 59, 999)

    const visits = await this.prisma.activity.findMany({
      where: {
        tenantId: me.tenantId,
        ownerId: me.id,
        deletedAt: null,
        type: 'VISIT',
        status: { in: ['PLANNED', 'DONE'] },
        OR: [{ dueAt: { gte: start, lte: end } }, { startAt: { gte: start, lte: end } }],
      },
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        subject: true,
        status: true,
        dueAt: true,
        startAt: true,
        location: true,
        checkInAt: true,
        checkInLat: true,
        checkInLng: true,
        entityType: true,
        entityId: true,
      },
    })

    const accountIds = visits.filter((v) => v.entityType === 'ACCOUNT').map((v) => v.entityId)
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, name: true, region: true, address: true },
    })
    const amap = new Map(accounts.map((a) => [a.id, a]))

    const items = visits.map((v, idx) => {
      const acc = v.entityType === 'ACCOUNT' ? amap.get(v.entityId) : null
      return {
        seq: idx + 1,
        id: v.id,
        subject: v.subject,
        status: v.status,
        time: (v.dueAt ?? v.startAt)?.toISOString() ?? null,
        location: v.location ?? acc?.address ?? '',
        region: acc?.region ?? tr('未分区', 'No region'),
        accountName: acc?.name ?? '',
        checkedIn: !!v.checkInAt,
        lat: v.checkInLat != null ? Number(v.checkInLat) : null,
        lng: v.checkInLng != null ? Number(v.checkInLng) : null,
      }
    })

    const byRegion = new Map<string, typeof items>()
    for (const it of items) {
      const arr = byRegion.get(it.region) ?? []
      arr.push(it)
      byRegion.set(it.region, arr)
    }
    let seq = 1
    const suggested: typeof items = []
    for (const [, arr] of byRegion) {
      arr.sort((a, b) => {
        if (a.checkedIn !== b.checkedIn) return a.checkedIn ? 1 : -1
        return (a.time ?? '').localeCompare(b.time ?? '')
      })
      for (const it of arr) {
        suggested.push({ ...it, seq: seq++ })
      }
    }

    return {
      date: start.toISOString().slice(0, 10),
      total: items.length,
      checkedIn: items.filter((i) => i.checkedIn).length,
      items: suggested,
      regions: [...byRegion.keys()],
    }
  }

  /** 移动拜访计划：批量创建指定日期的拜访任务 */
  async visitPlan(
    me: AuthUser,
    body: {
      date: string
      items: Array<{
        accountId?: string
        subject?: string
        time?: string
        location?: string
      }>
    },
  ) {
    const day = body.date ? new Date(body.date) : new Date()
    const created: string[] = []
    let seq = 0
    for (const it of body.items ?? []) {
      const accountId = it.accountId ?? ''
      const subject = it.subject || tr('计划拜访', 'Planned visit')
      const dueAt = it.time
        ? new Date(`${body.date}T${it.time.length === 5 ? it.time + ':00' : it.time}`)
        : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9 + seq, 0)
      seq++
      const acc = accountId
        ? await this.prisma.account.findFirst({
            where: { id: accountId, tenantId: me.tenantId, deletedAt: null },
            select: { name: true, address: true, region: true },
          })
        : null
      const act = await this.prisma.activity.create({
        data: {
          tenantId: me.tenantId,
          type: 'VISIT',
          subject: acc ? tr(`拜访 ${acc.name}`, `Visit ${acc.name}`) : subject,
          status: 'PLANNED',
          content: it.location ?? acc?.address ?? '',
          entityType: accountId ? 'ACCOUNT' : 'LEAD',
          entityId: accountId || '',
          ownerId: me.id,
          location: it.location ?? acc?.address ?? null,
          dueAt,
          source: 'MANUAL',
          createdById: me.id,
          updatedById: me.id,
        },
      })
      created.push(act.id)
    }
    return { ok: true, created: created.length, ids: created }
  }
}
