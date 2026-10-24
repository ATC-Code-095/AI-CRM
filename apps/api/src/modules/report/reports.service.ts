import { Injectable } from '@nestjs/common'
import type { CommissionPayout } from '@prisma/client'
import { addMoney, BizException, ErrorCodes } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { toBattlecard, toForecastCommit } from '../opportunity/opportunity-records.mapper'
import { sysLabel, tr, withLocale } from '../../common/locale'
import { baseView, BaseViewClient } from '../../common/currency'

function toPayout(p: CommissionPayout) {
  return {
    id: p.id,
    periodKey: p.periodKey,
    userId: p.userId,
    userName: p.userName,
    amount: Number(p.amount).toFixed(2),
    status: p.status,
    note: p.note,
    updatedAt: p.updatedAt.toISOString(),
    updatedBy: p.updatedByName,
  }
}

@Injectable()
export class ReportsService {
  /** 报表一律按本位币汇总：金额字段读取折算后的值（见 common/currency.ts baseView） */
  private readonly db: BaseViewClient

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {
    this.db = baseView(prisma)
  }

  async funnel(me: AuthUser) {
    const stages = await this.db.pipelineStage.findMany({
      where: { tenantId: me.tenantId, pipeline: { isDefault: true } },
      orderBy: { sortOrder: 'asc' },
    })
    const opps = await this.db.opportunity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { stageId: true, amount: true, winRate: true },
    })
    return stages.map((s) => {
      const rows = opps.filter((o) => o.stageId === s.id)
      const amount = rows.reduce((a, o) => a + Number(o.amount), 0)
      const weighted = rows.reduce((a, o) => a + (Number(o.amount) * o.winRate) / 100, 0)
      return {
        stageId: s.id,
        code: s.code,
        name: s.name,
        count: rows.length,
        amount: amount.toFixed(2),
        weightedAmount: weighted.toFixed(2),
      }
    })
  }

  async ownerPerformance(me: AuthUser, from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const end = to ? new Date(to) : new Date()

    const users = await this.db.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, email: true },
    })

    const [leads, opps, contracts, payments] = await Promise.all([
      this.db.lead.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: start, lte: end } },
        select: { ownerId: true },
      }),
      this.db.opportunity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: start, lte: end } },
        select: { ownerId: true, amount: true, stage: { select: { code: true } } },
      }),
      this.db.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['EFFECTIVE', 'FINISHED'] },
          createdAt: { gte: start, lte: end },
        },
        select: { ownerId: true, total: true },
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: start, lte: end },
        },
        select: { amount: true, contract: { select: { ownerId: true } } },
      }),
    ])

    return users.map((u) => {
      const myLeads = leads.filter((l) => l.ownerId === u.id).length
      const myOpps = opps.filter((o) => o.ownerId === u.id)
      const wonAmount = myOpps
        .filter((o) => o.stage.code === 'WON')
        .reduce((a, o) => a + Number(o.amount), 0)
      const openAmount = myOpps
        .filter((o) => o.stage.code !== 'WON' && o.stage.code !== 'LOST')
        .reduce((a, o) => a + Number(o.amount), 0)
      const myContracts = contracts.filter((c) => c.ownerId === u.id)
      const received = payments
        .filter((p) => p.contract.ownerId === u.id)
        .reduce((a, p) => addMoney(a, String(p.amount)), '0.00')
      return {
        userId: u.id,
        name: u.name,
        newLeads: myLeads,
        oppCount: myOpps.length,
        wonAmount: wonAmount.toFixed(2),
        openAmount: openAmount.toFixed(2),
        contractAmount: myContracts.reduce((a, c) => a + Number(c.total), 0).toFixed(2),
        receivedAmount: received,
      }
    })
  }

  async revenueTrend(me: AuthUser, months: number) {
    const n = Math.min(Math.max(months, 1), 24)
    const now = new Date()
    const buckets: { month: string; confirmed: number; reconciled: number }[] = []
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        confirmed: 0,
        reconciled: 0,
      })
    }
    const pays = await this.db.payment.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'RECONCILED'] },
      },
      select: { amount: true, paidAt: true, status: true },
    })
    for (const p of pays) {
      const key = `${p.paidAt.getFullYear()}-${String(p.paidAt.getMonth() + 1).padStart(2, '0')}`
      const b = buckets.find((x) => x.month === key)
      if (!b) continue
      b.confirmed += Number(p.amount)
      if (p.status === 'RECONCILED') b.reconciled += Number(p.amount)
    }
    return buckets.map((b) => ({
      month: b.month,
      confirmedAmount: b.confirmed.toFixed(2),
      reconciledAmount: b.reconciled.toFixed(2),
    }))
  }

  async goalAttainment(me: AuthUser, periodKey?: string) {
    const now = new Date()
    const key = periodKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const goals = await this.db.goal.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, periodKey: key, periodType: 'MONTH' },
    })
    const [y, m] = key.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)

    const [won, revenue] = await Promise.all([
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: start, lte: end },
        },
        select: { ownerId: true, amount: true },
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: start, lte: end },
        },
        select: { amount: true, contract: { select: { ownerId: true } } },
      }),
    ])

    return goals.map((g) => {
      let actual = 0
      if (g.metric === 'WON_AMOUNT') {
        actual = won.filter((w) => w.ownerId === g.userId).reduce((a, w) => a + Number(w.amount), 0)
      } else if (g.metric === 'REVENUE') {
        actual = revenue
          .filter((r) => r.contract.ownerId === g.userId)
          .reduce((a, r) => a + Number(r.amount), 0)
      } else if (g.metric === 'NEW_OPP') {
        actual = 0
      }
      const target = Number(g.targetAmount)
      return {
        goalId: g.id,
        userId: g.userId,
        metric: g.metric,
        periodKey: key,
        targetAmount: target.toFixed(2),
        actualAmount: actual.toFixed(2),
        rate: target > 0 ? ((actual / target) * 100).toFixed(1) : '0',
      }
    })
  }

  async dashboard(me: AuthUser) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)

    const [dueToday, openLeads, openOpps, funnel, trend] = await Promise.all([
      this.db.activity.findMany({
        where: {
          tenantId: me.tenantId,
          ownerId: me.id,
          deletedAt: null,
          status: 'PLANNED',
          dueAt: { gte: start, lte: end },
        },
        orderBy: { dueAt: 'asc' },
        take: 10,
      }),
      this.db.lead.count({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          ownerId: me.id,
          status: { in: ['NEW', 'ACCEPTED', 'CULTIVATING'] },
        },
      }),
      this.db.opportunity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, stage: { isClosing: false } },
        select: { amount: true, winRate: true },
      }),
      this.funnel(me),
      this.revenueTrend(me, 6),
    ])

    const openAmount = openOpps.reduce((a, o) => a + Number(o.amount), 0)
    const weighted = openOpps.reduce((a, o) => a + (Number(o.amount) * o.winRate) / 100, 0)

    return {
      dueToday,
      openLeads,
      openOppCount: openOpps.length,
      openAmount: openAmount.toFixed(2),
      weightedAmount: weighted.toFixed(2),
      funnel,
      revenueTrend: trend,
    }
  }

  /** 合同到期提醒（N 天内） */
  async contractExpiring(me: AuthUser, days = 30) {
    const now = new Date()
    const end = new Date(now.getTime() + days * 86400000)
    return this.db.contract.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: 'EFFECTIVE',
        expireDate: { lte: end },
      },
      orderBy: { expireDate: 'asc' },
      take: 50,
      select: {
        id: true,
        contractNo: true,
        title: true,
        expireDate: true,
        total: true,
        receivedAmount: true,
      },
    })
  }

  /** 销售周报（近 7 天摘要，供 AI/导出） */
  async weeklyBrief(me: AuthUser) {
    const from = new Date(Date.now() - 7 * 86400000)
    const [leads, opps, won, payments, acts] = await Promise.all([
      this.db.lead.count({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      }),
      this.db.opportunity.count({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      }),
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: from },
        },
        select: { amount: true, name: true },
      }),
      this.db.payment.aggregate({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: from },
        },
        _sum: { amountBase: true },
      }),
      this.db.activity.count({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      }),
    ])
    return {
      period: 'last_7_days',
      newLeads: leads,
      newOpportunities: opps,
      wonCount: won.length,
      wonAmount: won.reduce((a, o) => a + Number(o.amount), 0).toFixed(2),
      receivedAmount: String(payments._sum.amountBase ?? '0.00'),
      activities: acts,
    }
  }


  /** 销售排行榜（赢单/回款） */
  async salesLeaderboard(me: AuthUser, days = 30) {
    const from = new Date(Date.now() - days * 86400000)
    const prevFrom = new Date(Date.now() - days * 2 * 86400000)
    const users = await this.db.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true },
    })
    const won = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { code: 'WON' },
        actualCloseDate: { gte: from },
      },
      select: { ownerId: true, amount: true },
    })
    const prevWon = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { code: 'WON' },
        actualCloseDate: { gte: prevFrom, lt: from },
      },
      select: { ownerId: true, amount: true },
    })
    const pays = await this.db.payment.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'RECONCILED'] },
        paidAt: { gte: from },
      },
      select: { amount: true, contract: { select: { ownerId: true } } },
    })
    const allOpps = await this.db.opportunity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      select: { ownerId: true, amount: true, stage: { select: { code: true } } },
    })
    const acts = await this.db.activity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      select: { ownerId: true },
    })

    // 本月目标（用于达成率）
    const now = new Date()
    const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const goals = await this.db.goal.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        periodKey,
        periodType: 'MONTH',
        metric: 'WON_AMOUNT',
      },
      select: { userId: true, targetAmount: true },
    })
    const gmap = new Map(goals.map((g) => [g.userId, Number(g.targetAmount)]))

    return users
      .map((u) => {
        const wonAmount = won
          .filter((w) => w.ownerId === u.id)
          .reduce((a, w) => a + Number(w.amount), 0)
        const prevWonAmount = prevWon
          .filter((w) => w.ownerId === u.id)
          .reduce((a, w) => a + Number(w.amount), 0)
        const received = pays
          .filter((p) => p.contract?.ownerId === u.id)
          .reduce((a, p) => a + Number(p.amount), 0)
        const myOpps = allOpps.filter((o) => o.ownerId === u.id)
        const myWon = myOpps.filter((o) => o.stage.code === 'WON').length
        const myLost = myOpps.filter((o) => o.stage.code === 'LOST').length
        const closed = myWon + myLost
        const activityCount = acts.filter((a) => a.ownerId === u.id).length
        const target = gmap.get(u.id) ?? 0
        const trend =
          prevWonAmount === 0
            ? wonAmount > 0
              ? 'UP'
              : 'FLAT'
            : wonAmount > prevWonAmount * 1.1
              ? 'UP'
              : wonAmount < prevWonAmount * 0.9
                ? 'DOWN'
                : 'FLAT'
        return {
          userId: u.id,
          name: u.name,
          wonAmount: wonAmount.toFixed(2),
          receivedAmount: received.toFixed(2),
          newOpps: myOpps.length,
          newOppAmount: myOpps.reduce((a, o) => a + Number(o.amount), 0).toFixed(2),
          winRate: closed ? ((myWon / closed) * 100).toFixed(1) : '-',
          activities: activityCount,
          target: target.toFixed(2),
          attainment:
            target > 0 ? ((wonAmount / target) * 100).toFixed(1) : '-',
          trend,
          score: wonAmount + received + myOpps.length * 1000 + activityCount * 10,
        }
      })
      .sort((a, b) => b.score - a.score)
      .map((row, i) => ({ ...row, rank: i + 1 }))
  }

  /** 回款预测：未来 90 天到期计划 */
  async paymentForecast(me: AuthUser, days = 90) {
    const now = new Date()
    const end = new Date(now.getTime() + days * 86400000)
    const plans = await this.db.paymentPlan.findMany({
      where: {
        tenantId: me.tenantId,
        dueDate: { gte: now, lte: end },
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      include: { contract: { select: { contractNo: true, title: true } } },
      orderBy: { dueDate: 'asc' },
    })
    const total = plans.reduce((a, p) => a + Number(p.amount) - Number(p.receivedAmount), 0)
    return {
      days,
      planCount: plans.length,
      forecastAmount: total.toFixed(2),
      plans: plans.slice(0, 50).map((p) => ({
        id: p.id,
        dueDate: p.dueDate,
        amount: String(p.amount),
        received: String(p.receivedAmount),
        contractNo: p.contract?.contractNo,
      })),
    }
  }

  /** 智能提醒：逾期跟进、合同到期、工单 SLA */
  async smartReminders(me: AuthUser) {
    const now = new Date()
    const soon = new Date(now.getTime() + 7 * 86400000)
    const [overdueLeads, expiring, sla] = await Promise.all([
      this.db.lead.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['NEW', 'ACCEPTED', 'CULTIVATING'] },
          nextFollowAt: { lt: now },
        },
        take: 10,
        select: { id: true, name: true, nextFollowAt: true },
      }),
      this.db.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: 'EFFECTIVE',
          expireDate: { lte: soon },
        },
        take: 10,
        select: { id: true, contractNo: true, title: true, expireDate: true },
      }),
      this.db.ticket.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { notIn: ['CLOSED', 'RESOLVED'] },
          dueAt: { lte: soon },
        },
        take: 10,
        select: { id: true, ticketNo: true, title: true, dueAt: true, severity: true },
      }),
    ])
    return {
      overdueLeads,
      expiringContracts: expiring,
      slaTickets: sla,
      total: overdueLeads.length + expiring.length + sla.length,
    }
  }


  /** 输单分析：原因分布与金额 */
  async lossAnalysis(me: AuthUser, days = 90) {
    const from = new Date(Date.now() - days * 86400000)
    const lost = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { code: 'LOST' },
        updatedAt: { gte: from },
      },
      select: { amount: true, closeReason: true, name: true },
    })
    const byReason = new Map<string, { count: number; amount: number }>()
    for (const o of lost) {
      const k = o.closeReason || tr('未填写', 'Not specified')
      const b = byReason.get(k) ?? { count: 0, amount: 0 }
      b.count += 1
      b.amount += Number(o.amount)
      byReason.set(k, b)
    }
    return {
      total: lost.length,
      totalAmount: lost.reduce((a, o) => a + Number(o.amount), 0).toFixed(2),
      byReason: [...byReason.entries()].map(([reason, v]) => ({
        reason,
        count: v.count,
        amount: v.amount.toFixed(2),
      })),
    }
  }

  /** 客户关怀：本月生日联系人 + 即将到期合同 */
  async careReminders(me: AuthUser) {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const contacts = await this.db.contact.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        birthDate: { not: null },
      },
      select: { id: true, name: true, birthDate: true, accountId: true, mobile: true },
    })
    const birthdays = contacts.filter((c) => {
      if (!c.birthDate) return false
      const d = new Date(c.birthDate)
      return d.getMonth() === now.getMonth()
    })
    return {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      birthdays: birthdays.map((c) => ({
        id: c.id,
        name: c.name,
        accountId: c.accountId,
        mobile: c.mobile,
        birthDate: c.birthDate,
      })),
      monthStart,
      monthEnd,
    }
  }


  /** 成交周期：赢单从创建到成交的平均天数 + 分布 */
  async salesCycle(me: AuthUser, days = 90) {
    const from = new Date(Date.now() - days * 86400000)
    const won = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { code: 'WON' },
        actualCloseDate: { gte: from },
      },
      select: { createdAt: true, actualCloseDate: true, amount: true },
    })
    const cycles = won.map((w) => {
      const end = w.actualCloseDate ? new Date(w.actualCloseDate) : new Date()
      return Math.max(0, Math.round((end.getTime() - new Date(w.createdAt).getTime()) / 86400000))
    })
    const avg = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : 0
    const buckets = [
      { label: tr('0-7天', '0-7 days'), min: 0, max: 7 },
      { label: tr('8-15天', '8-15 days'), min: 8, max: 15 },
      { label: tr('16-30天', '16-30 days'), min: 16, max: 30 },
      { label: tr('31-60天', '31-60 days'), min: 31, max: 60 },
      { label: tr('60天+', '60+ days'), min: 61, max: 99999 },
    ]
    return {
      sample: cycles.length,
      avgDays: Math.round(avg),
      buckets: buckets.map((b) => ({
        label: b.label,
        count: cycles.filter((c) => c >= b.min && c <= b.max).length,
      })),
    }
  }

  /** 回访计划：已有客户最近 30 天无活动则建议回访 */
  async revisitPlan(me: AuthUser, days = 30) {
    const cutoff = new Date(Date.now() - days * 86400000)
    const accounts = await this.db.account.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { in: ['ACTIVE', 'AT_RISK', 'POTENTIAL'] },
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: cutoff } }],
      },
      take: 50,
      orderBy: { lastActivityAt: 'asc' },
      select: {
        id: true,
        name: true,
        level: true,
        stage: true,
        lastActivityAt: true,
        ownerId: true,
      },
    })
    return { days, items: accounts, total: accounts.length }
  }

  /** 客户成功触达：批量创建关怀跟进 + 站内提醒 */
  async outreachBatch(
    me: AuthUser,
    body: { accountIds?: string[]; template?: string; days?: number },
  ) {
    let accountIds = body.accountIds ?? []
    if (!accountIds.length) {
      const plan = await this.revisitPlan(me, body.days ?? 30)
      accountIds = plan.items.slice(0, 10).map((a) => a.id)
    }
    const accounts = await this.db.account.findMany({
      where: { id: { in: accountIds }, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, ownerId: true },
    })
    const template = body.template || tr('客户成功关怀回访：确认使用情况与满意度', 'Customer success care call: check usage and satisfaction')
    const due = new Date(Date.now() + 3 * 86400000)
    let created = 0
    for (const a of accounts) {
      await this.db.activity.create({
        data: {
          tenantId: me.tenantId,
          type: 'CALL',
          subject: tr(`成功触达：${a.name}`, `Outreach: ${a.name}`),
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
        'OUTREACH',
        { zh: '客户成功触达任务', en: 'Customer success outreach task' },
        { zh: `请在 3 天内联系「${a.name}」：${template}`, en: `Please contact "${a.name}" within 3 days: ${template}` },
        'ACCOUNT',
        a.id,
      )
      created++
    }
    return { ok: true, created, template }
  }


  /** 目标月分解：将年度/季度目标摊到月，并对照实际 */
  async goalBreakdown(me: AuthUser, year = new Date().getFullYear()) {
    const goals = await this.db.goal.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        periodType: 'MONTH',
        periodKey: { startsWith: String(year) },
      },
    })
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    return months.map((key) => {
      const gs = goals.filter((g) => g.periodKey === key)
      return {
        periodKey: key,
        target: gs.reduce((a, g) => a + Number(g.targetAmount), 0).toFixed(2),
        metrics: gs.map((g) => ({ metric: g.metric, target: String(g.targetAmount) })),
      }
    })
  }


  /** 回款账龄：按逾期天数分桶 */
  async paymentAging(me: AuthUser) {
    const now = new Date()
    const plans = await this.db.paymentPlan.findMany({
      where: {
        tenantId: me.tenantId,
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      select: { dueDate: true, amount: true, receivedAmount: true },
    })
    const buckets = [
      { label: tr('1-30天', '1-30 days'), min: 1, max: 30 },
      { label: tr('31-60天', '31-60 days'), min: 31, max: 60 },
      { label: tr('61-90天', '61-90 days'), min: 61, max: 90 },
      { label: tr('90天+', '90+ days'), min: 91, max: 99999 },
    ]
    const rows = plans.map((p) => {
      const days = Math.floor((now.getTime() - new Date(p.dueDate).getTime()) / 86400000)
      const due = Number(p.amount) - Number(p.receivedAmount)
      return { days, due }
    })
    return {
      totalDue: rows.reduce((a, r) => a + r.due, 0).toFixed(2),
      buckets: buckets.map((b) => ({
        label: b.label,
        count: rows.filter((r) => r.days >= b.min && r.days <= b.max).length,
        amount: rows
          .filter((r) => r.days >= b.min && r.days <= b.max)
          .reduce((a, r) => a + r.due, 0)
          .toFixed(2),
      })),
    }
  }

  /** 一键销售简报（结构化文本，可复制/发企微） */
  async salesBrief(me: AuthUser) {
    const from = new Date(Date.now() - 7 * 86400000)
    const [leads, opps, won, pays, acts, reminders] = await Promise.all([
      this.db.lead.count({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      }),
      this.db.opportunity.count({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      }),
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: from },
        },
        select: { amount: true, name: true },
      }),
      this.db.payment.aggregate({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
          paidAt: { gte: from },
        },
        _sum: { amountBase: true },
      }),
      this.db.activity.count({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
      }),
      this.smartReminders(me),
    ])
    const wonAmount = won.reduce((a, o) => a + Number(o.amount), 0)
    const text = [
      tr('【销售简报 · 近7天】', '[Sales brief · last 7 days]'),
      tr(`1. 新线索 ${leads} 条，新商机 ${opps} 个`, `1. New leads: ${leads}, new opportunities: ${opps}`),
      tr(`2. 赢单 ${won.length} 笔 / ${wonAmount.toFixed(0)} 元`, `2. Won: ${won.length} deals / ${wonAmount.toFixed(0)}`),
      tr(`3. 回款 ${(pays._sum.amountBase ?? 0)} 元`, `3. Collected: ${(pays._sum.amountBase ?? 0)}`),
      tr(`4. 跟进活动 ${acts} 次`, `4. Activities: ${acts}`),
      tr(
        `5. 待办提醒 ${reminders.total} 条（逾期线索 ${reminders.overdueLeads.length} / 到期合同 ${reminders.expiringContracts.length}）`,
        `5. Reminders: ${reminders.total} (overdue leads ${reminders.overdueLeads.length} / expiring contracts ${reminders.expiringContracts.length})`,
      ),
      tr('—— 智销 CRM 自动生成', '— Generated by ZhiXiao CRM'),
    ].join('\n')
    return {
      period: 'last_7_days',
      text,
      metrics: {
        leads,
        opps,
        wonCount: won.length,
        wonAmount: wonAmount.toFixed(2),
        received: String(pays._sum.amountBase ?? '0'),
        activities: acts,
        reminders: reminders.total,
      },
    }
  }

  /** 销售战报分享：站内通知全员/指定人 */
  async shareBrief(me: AuthUser, body: { userIds?: string[]; note?: string }) {
    // 接收人语言可能不同：中英文各生成一份，通知按接收人语言存储
    const [briefZh, briefEn] = [
      await withLocale('zh-CN', () => this.salesBrief(me)),
      await withLocale('en-US', () => this.salesBrief(me)),
    ]
    const textZh = [briefZh.text, body.note ? `备注：${body.note}` : ''].filter(Boolean).join('\n')
    const textEn = [briefEn.text, body.note ? `Note: ${body.note}` : ''].filter(Boolean).join('\n')
    const text = tr(textZh, textEn)
    const users = body.userIds?.length
      ? await this.db.user.findMany({
          where: { id: { in: body.userIds }, tenantId: me.tenantId, deletedAt: null },
          select: { id: true },
        })
      : await this.db.user.findMany({
          where: { tenantId: me.tenantId, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        })
    let sent = 0
    for (const u of users) {
      await this.push.notify(
        me.tenantId,
        u.id,
        'SALES_BRIEF_SHARE',
        { zh: `销售战报 · ${me.name}`, en: `Sales report · ${me.name}` },
        { zh: textZh.slice(0, 500), en: textEn.slice(0, 500) },
      )
      sent++
    }
    return { ok: true, sent, text }
  }


  /** 客户健康度：活动频率 + 开放商机 + 回款情况 */
  async accountHealth(me: AuthUser, accountId: string) {
    const account = await this.db.account.findFirst({
      where: { id: accountId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!account) return { score: 0, level: 'RISK', factors: [] as string[] }
    const from = new Date(Date.now() - 90 * 86400000)
    const [acts, opps, pays] = await Promise.all([
      this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          entityType: 'ACCOUNT',
          entityId: accountId,
          createdAt: { gte: from },
        },
      }),
      this.db.opportunity.count({
        where: {
          tenantId: me.tenantId,
          accountId,
          deletedAt: null,
          stage: { isClosing: false },
        },
      }),
      this.db.payment.aggregate({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          contract: { accountId },
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        _sum: { amountBase: true },
      }),
    ])
    let score = 40
    const factors: string[] = []
    score += Math.min(acts * 10, 30)
    factors.push(tr(`90天活动 ${acts} 次`, `${acts} activities in 90 days`))
    if (opps > 0) {
      score += 15
      factors.push(tr(`开放商机 ${opps} 个`, `${opps} open opportunities`))
    }
    const received = Number(pays._sum.amountBase ?? 0)
    if (received > 0) {
      score += 15
      factors.push(tr(`累计回款 ${received}`, `Collected ${received}`))
    }
    score = Math.min(100, score)
    return { score, level: score >= 80 ? 'HEALTHY' : score >= 50 ? 'AT_RISK' : 'RISK', factors }
  }

  /** 健康度干预：创建关怀跟进 / 标记风险 / 提醒负责人 */
  async healthIntervene(me: AuthUser, accountId: string, action: string, note?: string) {
    const account = await this.db.account.findFirst({
      where: { id: accountId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')

    if (action === 'care_task') {
      const due = new Date(Date.now() + 3 * 86400000)
      const act = await this.db.activity.create({
        data: {
          tenantId: me.tenantId,
          type: 'CALL',
          subject: note || tr(`关怀回访：${account.name}`, `Care follow-up: ${account.name}`),
          status: 'PLANNED',
          content: tr('健康度干预自动生成的关怀跟进', 'Care follow-up created by health intervention'),
          entityType: 'ACCOUNT',
          entityId: account.id,
          ownerId: account.ownerId,
          dueAt: due,
          source: 'AI',
          createdById: me.id,
          updatedById: me.id,
        },
      })
      return { ok: true, action, activityId: act.id }
    }

    if (action === 'risk_tag') {
      const cv = (account.customValues as Record<string, unknown>) ?? {}
      const tags = new Set([...(((cv.tags as string[]) ?? [])), '风险关注'])
      await this.db.account.update({
        where: { id: account.id },
        data: {
          customValues: { ...cv, tags: [...tags] } as never,
          stage: account.stage === 'ACTIVE' ? 'AT_RISK' : account.stage,
          updatedById: me.id,
        },
      })
      return { ok: true, action }
    }

    if (action === 'alert_owner') {
      await this.push.notify(
        me.tenantId,
        account.ownerId,
        'HEALTH_ALERT',
        { zh: '客户健康度预警', en: 'Account health alert' },
        note || {
          zh: `客户「${account.name}」健康度偏低，请尽快安排回访`,
          en: `Account "${account.name}" has a low health score. Please arrange a follow-up soon.`,
        },
        'ACCOUNT',
        account.id,
      )
      return { ok: true, action, to: account.ownerId }
    }

    throw new BizException(ErrorCodes.UNPROCESSABLE, `unknown action ${action}`)
  }

  /** 风险客户看板：健康度偏低客户清单 */
  async atRiskAccounts(me: AuthUser, limit = 15) {
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        stage: true,
        level: true,
        ownerId: true,
        lastActivityAt: true,
      },
      take: 80,
    })
    const owners = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))

    const rows: Array<{
      id: string
      name: string
      stage: string
      level: string
      owner: string
      score: number
      levelCode: string
      factors: string[]
      lastActivityAt: string | null
    }> = []

    for (const a of accounts) {
      const health = await this.accountHealth(me, a.id)
      if (health.score >= 80) continue
      rows.push({
        id: a.id,
        name: a.name,
        stage: a.stage,
        level: a.level,
        owner: umap.get(a.ownerId) ?? '',
        score: health.score,
        levelCode: health.level,
        factors: health.factors,
        lastActivityAt: a.lastActivityAt?.toISOString() ?? null,
      })
    }
    rows.sort((x, y) => x.score - y.score)
    return rows.slice(0, limit)
  }


  /** 客户 RFM 分层：近度/频度/金额 */
  async customerRfm(me: AuthUser) {
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        lastActivityAt: true,
        contracts: {
          where: { status: { in: ['EFFECTIVE', 'FINISHED'] } },
          select: { total: true, createdAt: true },
        },
      },
    })
    const now = Date.now()
    return accounts.map((a) => {
      const recency = a.lastActivityAt
        ? Math.floor((now - a.lastActivityAt.getTime()) / 86400000)
        : 999
      const frequency = a.contracts.length
      const monetary = a.contracts.reduce((s, c) => s + Number(c.total), 0)
      // tagKey 供前端着色；tag 为当前语言的显示文字
      let tagKey: 'HIGH' | 'POTENTIAL' | 'DORMANT' | 'LOW' = 'LOW'
      if (recency <= 30 && frequency >= 2 && monetary >= 50000) tagKey = 'HIGH'
      else if (recency <= 60 && (frequency >= 1 || monetary >= 10000)) tagKey = 'POTENTIAL'
      else if (recency > 90) tagKey = 'DORMANT'
      const tag = {
        HIGH: tr('高价值', 'High value'),
        POTENTIAL: tr('潜力', 'Potential'),
        DORMANT: tr('待激活', 'Dormant'),
        LOW: tr('低价值', 'Low value'),
      }[tagKey]
      return {
        id: a.id,
        name: a.name,
        recency,
        frequency,
        monetary: monetary.toFixed(2),
        tag,
        tagKey,
      }
    })
  }

  /** 跟进效率：近 30 天人均跟进次数与转化 */
  async followupEfficiency(me: AuthUser) {
    const from = new Date(Date.now() - 30 * 86400000)
    const [users, acts, converts] = await Promise.all([
      this.db.user.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.db.activity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null, createdAt: { gte: from } },
        select: { ownerId: true },
      }),
      this.db.lead.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: 'CONVERTED',
          convertedAt: { gte: from },
        },
        select: { ownerId: true },
      }),
    ])
    return users.map((u) => {
      const actCount = acts.filter((x) => x.ownerId === u.id).length
      const conv = converts.filter((x) => x.ownerId === u.id).length
      return {
        userId: u.id,
        name: u.name,
        activities: actCount,
        converted: conv,
        rate: actCount ? (conv / actCount * 100).toFixed(1) : '0',
      }
    })
  }

  /** 阶段停留时长：基于阶段变更历史统计平均停留天数 */
  async stageVelocity(me: AuthUser) {
    const stages = await this.db.pipelineStage.findMany({
      where: { tenantId: me.tenantId, pipeline: { isDefault: true } },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    })
    const [histories, openOpps] = await Promise.all([
      this.db.opportunityStageHistory.findMany({
        where: { tenantId: me.tenantId },
        orderBy: { changedAt: 'asc' },
        select: { opportunityId: true, toStageId: true, changedAt: true },
      }),
      this.db.opportunity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, stageId: true, createdAt: true },
      }),
    ])
    const now = Date.now()
    const durations = new Map<string, number[]>()
    const byOpp = new Map<string, { stageId: string; at: number }[]>()
    for (const h of histories) {
      const list = byOpp.get(h.opportunityId) ?? []
      list.push({ stageId: h.toStageId, at: h.changedAt.getTime() })
      byOpp.set(h.opportunityId, list)
    }
    for (const list of byOpp.values()) {
      for (let i = 0; i < list.length; i++) {
        const start = list[i].at
        const end = i + 1 < list.length ? list[i + 1].at : now
        const days = (end - start) / 86400000
        const arr = durations.get(list[i].stageId) ?? []
        arr.push(days)
        durations.set(list[i].stageId, arr)
      }
    }
    for (const o of openOpps) {
      const arr = durations.get(o.stageId) ?? []
      arr.push((now - o.createdAt.getTime()) / 86400000)
      durations.set(o.stageId, arr)
    }
    return stages.map((s) => {
      const arr = durations.get(s.id) ?? []
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
      const max = arr.length ? Math.max(...arr) : 0
      return {
        stageId: s.id,
        code: s.code,
        name: s.name,
        samples: arr.length,
        avgDays: avg.toFixed(1),
        maxDays: max.toFixed(1),
      }
    })
  }

  /** 作战室甘特：重点商机阶段停留条 */
  async dealGantt(me: AuthUser, limit = 8) {
    const opps = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { isClosing: false },
      },
      orderBy: { amountBase: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        amount: true,
        createdAt: true,
        stage: { select: { id: true, name: true, code: true } },
        ownerId: true,
      },
    })
    const owners = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))
    const now = Date.now()

    const items = await Promise.all(
      opps.map(async (o) => {
        const hist = await this.db.opportunityStageHistory.findMany({
          where: { opportunityId: o.id },
          orderBy: { changedAt: 'asc' },
          select: { toStageId: true, changedAt: true },
        })
        const segs: { stage: string; days: number; start: number }[] = []
        for (let i = 0; i < hist.length; i++) {
          const start = hist[i].changedAt.getTime()
          const end = i + 1 < hist.length ? hist[i + 1].changedAt.getTime() : now
          segs.push({
            stage: hist[i].toStageId,
            days: Math.round(((end - start) / 86400000) * 10) / 10,
            start,
          })
        }
        if (!segs.length) {
          segs.push({
            stage: o.stage.id,
            days: Math.round(((now - o.createdAt.getTime()) / 86400000) * 10) / 10,
            start: o.createdAt.getTime(),
          })
        }
        const totalDays = segs.reduce((s, x) => s + x.days, 0)
        return {
          id: o.id,
          name: o.name,
          amount: String(o.amount),
          owner: umap.get(o.ownerId) ?? '',
          currentStage: o.stage.name,
          totalDays: totalDays.toFixed(1),
          segments: segs,
        }
      }),
    )

    return {
      items,
      maxDays: Math.max(
        ...items.map((i) => Number(i.totalDays)),
        1,
      ),
    }
  }

  /** 线索来源分析 */
  async sourceAnalysis(me: AuthUser) {
    const leads = await this.db.lead.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { source: true, status: true, expectedAmount: true, createdAt: true },
    })
    const opps = await this.db.opportunity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { source: true, amount: true, stage: { select: { code: true } } },
    })
    const map = new Map<
      string,
      { source: string; leads: number; converted: number; opps: number; oppAmount: number }
    >()
    const touch = (src: string | null | undefined) => {
      const key = src || 'OTHER'
      if (!map.has(key)) {
        map.set(key, { source: key, leads: 0, converted: 0, opps: 0, oppAmount: 0 })
      }
      return map.get(key)!
    }
    for (const l of leads) {
      const row = touch(l.source)
      row.leads += 1
      if (l.status === 'CONVERTED') row.converted += 1
    }
    for (const o of opps) {
      const row = touch(o.source)
      row.opps += 1
      row.oppAmount += Number(o.amount)
    }
    return [...map.values()].map((r) => ({
      ...r,
      oppAmount: r.oppAmount.toFixed(2),
      convertRate: r.leads ? ((r.converted / r.leads) * 100).toFixed(1) : '0',
    }))
  }

  /** 客户生命周期分布 */
  async lifecycleDistribution(me: AuthUser) {
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { stage: true },
    })
    const labels: Record<string, string> = {
      POTENTIAL: tr('潜在', 'Potential'),
      ACTIVE: tr('活跃', 'Active'),
      AT_RISK: tr('风险', 'At risk'),
      CHURNED: tr('流失', 'Churned'),
    }
    const map = new Map<string, number>()
    for (const a of accounts) {
      map.set(a.stage, (map.get(a.stage) ?? 0) + 1)
    }
    return [...map.entries()].map(([stage, count]) => ({
      stage,
      name: labels[stage] ?? stage,
      count,
    }))
  }

  /** 竞品分析：按竞品统计商机金额与赢率 */
  async competitorAnalysis(me: AuthUser) {
    const opps = await this.db.opportunity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, competitor: { not: null } },
      select: {
        competitor: true,
        amount: true,
        stage: { select: { code: true } },
      },
    })
    const map = new Map<
      string,
      { competitor: string; count: number; amount: number; won: number; lost: number }
    >()
    for (const o of opps) {
      const key = (o.competitor || '').trim() || tr('未知', 'Unknown')
      if (!map.has(key)) map.set(key, { competitor: key, count: 0, amount: 0, won: 0, lost: 0 })
      const row = map.get(key)!
      row.count += 1
      row.amount += Number(o.amount)
      if (o.stage.code === 'WON') row.won += 1
      if (o.stage.code === 'LOST') row.lost += 1
    }
    return [...map.values()].map((r) => ({
      competitor: r.competitor,
      count: r.count,
      amount: r.amount.toFixed(2),
      won: r.won,
      lost: r.lost,
      winRate: r.won + r.lost ? ((r.won / (r.won + r.lost)) * 100).toFixed(1) : '-',
    }))
  }

  /** 销售日报：今日完成 / 明日计划 / 逾期跟进 / 停滞商机 */
  async dailyReport(me: AuthUser) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const tomorrowStart = new Date(todayEnd.getTime() + 1)
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 86400000 - 1)
    const staleCut = new Date(Date.now() - 14 * 86400000)

    const [doneToday, planTomorrow, overdueTasks, staleOpps, todayNewLeads, todayWon] =
      await Promise.all([
        this.db.activity.findMany({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            ownerId: me.id,
            status: 'DONE',
            updatedAt: { gte: todayStart, lte: todayEnd },
          },
          select: { id: true, subject: true, type: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        this.db.activity.findMany({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            ownerId: me.id,
            status: 'PLANNED',
            dueAt: { gte: tomorrowStart, lte: tomorrowEnd },
          },
          select: { id: true, subject: true, type: true, dueAt: true },
          orderBy: { dueAt: 'asc' },
          take: 20,
        }),
        this.db.activity.findMany({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            ownerId: me.id,
            status: 'PLANNED',
            dueAt: { lt: todayStart },
          },
          select: { id: true, subject: true, type: true, dueAt: true },
          orderBy: { dueAt: 'asc' },
          take: 10,
        }),
        this.db.opportunity.findMany({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            ownerId: me.id,
            updatedAt: { lt: staleCut },
            stage: { isClosing: false },
          },
          select: {
            id: true,
            name: true,
            amount: true,
            updatedAt: true,
            stage: { select: { name: true } },
          },
          take: 10,
        }),
        this.db.lead.count({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            ownerId: me.id,
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        this.db.opportunity.count({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            ownerId: me.id,
            stage: { code: 'WON' },
            actualCloseDate: { gte: todayStart, lte: todayEnd },
          },
        }),
      ])

    return {
      date: todayStart.toISOString().slice(0, 10),
      summary: {
        doneToday: doneToday.length,
        planTomorrow: planTomorrow.length,
        overdueTasks: overdueTasks.length,
        staleOpps: staleOpps.length,
        todayNewLeads,
        todayWon,
      },
      doneToday,
      planTomorrow,
      overdueTasks,
      staleOpps,
    }
  }

  /** 预测准确性：近 6 个月加权预测 vs 实际赢单 */
  async forecastAccuracy(me: AuthUser) {
    const rows: Array<{
      month: string
      forecast: string
      actual: string
      accuracy: string
      gap: string
    }> = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth()
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 0, 23, 59, 59)
      const key = `${y}-${String(m + 1).padStart(2, '0')}`

      // 月初仍在管道中的加权金额（按 expectedCloseDate 落在本月且创建于月初前）
      const pipeline = await this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          createdAt: { lte: start },
          expectedCloseDate: { gte: start, lte: end },
        },
        select: { amount: true, winRate: true },
      })
      const forecast = pipeline.reduce((a, o) => a + (Number(o.amount) * o.winRate) / 100, 0)

      const won = await this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: start, lte: end },
        },
        select: { amount: true },
      })
      const actual = won.reduce((a, o) => a + Number(o.amount), 0)
      const accuracy = forecast > 0 ? ((actual / forecast) * 100).toFixed(1) : actual > 0 ? '∞' : '-'
      rows.push({
        month: key,
        forecast: forecast.toFixed(2),
        actual: actual.toFixed(2),
        accuracy,
        gap: (actual - forecast).toFixed(2),
      })
    }
    return rows
  }

  // ========== 佣金管理中心 ==========

  private async loadCommissionTiers(me: AuthUser): Promise<Array<{ min: number; max: number | null; rate: number }>> {
    const row = await this.db.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'commission.rules', scope: 'TENANT' },
    })
    const raw = row?.value as unknown
    if (Array.isArray(raw) && raw.length) {
      return raw
        .map((t) => {
          const o = t as { min?: unknown; max?: unknown; rate?: unknown }
          return {
            min: Number(o.min ?? 0),
            max: o.max === null || o.max === undefined || o.max === '' ? null : Number(o.max),
            rate: Number(o.rate ?? 0),
          }
        })
        .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.rate))
        .sort((a, b) => a.min - b.min)
    }
    // 默认：兼容旧的单一佣金率配置
    const legacy = await this.db.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'commission.rate', scope: 'TENANT' },
    })
    const rate = Number(legacy?.value ?? 0.05)
    return [{ min: 0, max: null, rate: Number.isFinite(rate) ? rate : 0.05 }]
  }

  /** 全额累进：按阶梯分段计佣（对标个税/销售提成累进） */
  private tieredCommission(amount: number, tiers: Array<{ min: number; max: number | null; rate: number }>) {
    if (!Number.isFinite(amount) || amount <= 0) return 0
    let sum = 0
    for (const t of tiers) {
      const lower = t.min
      const upper = t.max === null ? Number.POSITIVE_INFINITY : t.max
      if (amount <= lower) continue
      const band = Math.min(amount, upper) - lower
      if (band > 0) sum += band * t.rate
    }
    return sum
  }

  private periodRange(periodKey?: string) {
    if (periodKey && /^\d{4}-\d{2}$/.test(periodKey)) {
      const [y, m] = periodKey.split('-').map(Number)
      return {
        key: `${y}-${String(m).padStart(2, '0')}`,
        start: new Date(y, m - 1, 1),
        end: new Date(y, m, 1),
      }
    }
    const now = new Date()
    return {
      key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    }
  }

  async commissionRules(me: AuthUser) {
    const tiers = await this.loadCommissionTiers(me)
    return { tiers, mode: tiers.length > 1 ? 'TIERED' : 'FLAT' }
  }

  async saveCommissionRules(me: AuthUser, tiers: Array<{ min: number; max: number | null; rate: number }>) {
    if (!Array.isArray(tiers) || !tiers.length) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('佣金阶梯不能为空', 'Commission tiers cannot be empty'))
    }
    const cleaned = tiers
      .map((t) => {
        const maxRaw = (t as { max?: unknown }).max
        return {
          min: Number(t.min ?? 0),
          max:
            maxRaw === null || maxRaw === undefined || maxRaw === '' || (typeof maxRaw === 'number' && Number.isNaN(maxRaw))
              ? null
              : Number(maxRaw),
          rate: Number(t.rate ?? 0),
        }
      })
      .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.rate) && t.rate >= 0 && t.rate <= 1)
      .sort((a, b) => a.min - b.min)
    if (!cleaned.length) throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('佣金阶梯格式无效', 'Invalid commission tier format'))
    for (let i = 1; i < cleaned.length; i++) {
      if (cleaned[i].min < cleaned[i - 1].min) {
        throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('阶梯下限必须递增', 'Tier lower bounds must increase'))
      }
      const prevMax = cleaned[i - 1].max
      if (prevMax !== null && prevMax <= cleaned[i - 1].min) {
        throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('阶梯上限必须大于下限', 'Tier upper bound must be greater than its lower bound'))
      }
    }
    const key = 'commission.rules'
    const row = await this.db.setting.findFirst({
      where: { tenantId: me.tenantId, key, scope: 'TENANT' },
    })
    const value = cleaned as never
    if (row) {
      await this.db.setting.update({ where: { id: row.id }, data: { value } })
    } else {
      await this.db.setting.create({
        data: { tenantId: me.tenantId, key, scope: 'TENANT', value },
      })
    }
    return { tiers: cleaned, mode: cleaned.length > 1 ? 'TIERED' : 'FLAT' }
  }

  private async loadPayouts(me: AuthUser, periodKey: string) {
    const rows = await this.db.commissionPayout.findMany({
      where: { tenantId: me.tenantId, periodKey },
    })
    return rows.map(toPayout)
  }

  /** 佣金明细：按回款行级累进计佣 + 发放状态 */
  async commission(me: AuthUser, periodKey?: string) {
    const { key: pk, start, end } = this.periodRange(periodKey)
    const tiers = await this.loadCommissionTiers(me)
    const users = await this.db.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true },
    })
    const payments = await this.db.payment.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'RECONCILED'] },
        paidAt: { gte: start, lt: end },
      },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        status: true,
        contract: {
          select: {
            id: true,
            contractNo: true,
            title: true,
            ownerId: true,
            account: { select: { name: true } },
          },
        },
      },
      orderBy: { paidAt: 'asc' },
    })
    const payouts = await this.loadPayouts(me, pk)
    const payoutMap = new Map(payouts.map((p) => [p.userId, p as Record<string, unknown>]))

    // 行级：按 owner 累计回款后分段计佣，增量计入本笔回款
    const linesByUser = new Map<string, Array<Record<string, unknown>>>()
    const cumulative = new Map<string, number>()
    for (const p of payments) {
      const uid = p.contract.ownerId
      const amount = Number(p.amount)
      const before = cumulative.get(uid) ?? 0
      const after = before + amount
      const comm = this.tieredCommission(after, tiers) - this.tieredCommission(before, tiers)
      cumulative.set(uid, after)
      const list = linesByUser.get(uid) ?? []
      list.push({
        paymentId: p.id,
        contractId: p.contract.id,
        contractNo: p.contract.contractNo,
        contractName: p.contract.title,
        accountName: p.contract.account?.name ?? '',
        amount: amount.toFixed(2),
        paidAt: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '',
        status: p.status,
        commission: comm.toFixed(2),
        cumulative: after.toFixed(2),
      })
      linesByUser.set(uid, list)
    }

    const rows = users.map((u) => {
      const received = cumulative.get(u.id) ?? 0
      const commission = this.tieredCommission(received, tiers)
      const lines = linesByUser.get(u.id) ?? []
      const payout = payoutMap.get(u.id)
      const effectiveRate = received > 0 ? (commission / received) * 100 : 0
      return {
        userId: u.id,
        name: u.name,
        receivedAmount: received.toFixed(2),
        rate: effectiveRate.toFixed(2),
        commission: commission.toFixed(2),
        paymentCount: lines.length,
        status: String(payout?.status ?? 'PENDING'),
        payoutId: payout?.id ? String(payout.id) : '',
        payoutNote: payout?.note ? String(payout.note) : '',
        lines,
      }
    })
    rows.sort((a, b) => Number(b.commission) - Number(a.commission))
    const totalCommission = rows.reduce((a, r) => a + Number(r.commission), 0)
    const totalReceived = rows.reduce((a, r) => a + Number(r.receivedAmount), 0)
    return {
      periodKey: pk,
      mode: tiers.length > 1 ? 'TIERED' : 'FLAT',
      tiers,
      totalCommission: totalCommission.toFixed(2),
      totalReceived: totalReceived.toFixed(2),
      rows,
    }
  }

  async commissionPayout(
    me: AuthUser,
    body: { periodKey?: string; userId: string; status: string; note?: string },
  ) {
    const { key: pk } = this.periodRange(body.periodKey)
    const status = String(body.status || 'PENDING').toUpperCase()
    if (!['PENDING', 'CONFIRMED', 'PAID'].includes(status)) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('发放状态无效', 'Invalid payout status'))
    }
    const user = await this.db.user.findFirst({
      where: { id: body.userId, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    const report = await this.commission(me, pk)
    const row = report.rows.find((r) => r.userId === user.id)
    const amount = row?.commission ?? '0.00'
    const data = {
      userName: user.name,
      amount,
      status,
      note: body.note ?? '',
      updatedById: me.id,
      updatedByName: me.name ?? me.email,
    }
    const payout = await this.db.commissionPayout.upsert({
      where: { tenantId_periodKey_userId: { tenantId: me.tenantId, periodKey: pk, userId: user.id } },
      update: data,
      create: { tenantId: me.tenantId, periodKey: pk, userId: user.id, ...data },
    })
    return toPayout(payout)
  }

  /** 赢单复盘：赢单关键因素统计（closeReason/competitor/来源） */
  async winReview(me: AuthUser, days = 90) {
    const from = new Date(Date.now() - days * 86400000)
    const won = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { code: 'WON' },
        actualCloseDate: { gte: from },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        competitor: true,
        source: true,
        closeReason: true,
        ownerId: true,
        actualCloseDate: true,
      },
    })
    const users = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u.name]))
    const bySource = new Map<string, { count: number; amount: number }>()
    const byCompetitor = new Map<string, { count: number; amount: number }>()
    for (const o of won) {
      const src = o.source || 'OTHER'
      const s = bySource.get(src) ?? { count: 0, amount: 0 }
      s.count++
      s.amount += Number(o.amount)
      bySource.set(src, s)
      const comp = o.competitor || tr('无竞品', 'No competitor')
      const c = byCompetitor.get(comp) ?? { count: 0, amount: 0 }
      c.count++
      c.amount += Number(o.amount)
      byCompetitor.set(comp, c)
    }
    return {
      total: won.length,
      totalAmount: won.reduce((a, o) => a + Number(o.amount), 0).toFixed(2),
      bySource: [...bySource.entries()].map(([k, v]) => ({
        source: k,
        count: v.count,
        amount: v.amount.toFixed(2),
      })),
      byCompetitor: [...byCompetitor.entries()].map(([k, v]) => ({
        competitor: k,
        count: v.count,
        amount: v.amount.toFixed(2),
      })),
      deals: won.slice(0, 10).map((o) => ({
        id: o.id,
        name: o.name,
        amount: String(o.amount),
        owner: userMap.get(o.ownerId) ?? '',
        competitor: o.competitor ?? '',
        closeDate: o.actualCloseDate?.toISOString().slice(0, 10) ?? '',
      })),
    }
  }

  /** 线索→现金转化漏斗：阶段间转化率 */
  async cashFunnel(me: AuthUser) {
    const [leads, converted, opps, won, contracts, payments] = await Promise.all([
      this.db.lead.count({ where: { tenantId: me.tenantId, deletedAt: null } }),
      this.db.lead.count({
        where: { tenantId: me.tenantId, deletedAt: null, status: 'CONVERTED' },
      }),
      this.db.opportunity.count({ where: { tenantId: me.tenantId, deletedAt: null } }),
      this.db.opportunity.count({
        where: { tenantId: me.tenantId, deletedAt: null, stage: { code: 'WON' } },
      }),
      this.db.contract.count({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['EFFECTIVE', 'FINISHED'] },
        },
      }),
      this.db.payment.aggregate({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        _sum: { amountBase: true },
        _count: true,
      }),
    ])
    const stages = [
      { key: 'LEADS', name: tr('线索', 'Leads'), count: leads },
      { key: 'CONVERTED', name: tr('已转化', 'Converted'), count: converted },
      { key: 'OPPS', name: tr('商机', 'Opportunities'), count: opps },
      { key: 'WON', name: tr('赢单', 'Won'), count: won },
      { key: 'CONTRACTS', name: tr('合同', 'Contracts'), count: contracts },
      { key: 'PAYMENTS', name: tr('回款', 'Payments'), count: payments._count },
    ]
    return stages.map((s, i) => ({
      ...s,
      rateFromPrev:
        i === 0 ? '100' : stages[i - 1].count ? ((s.count / stages[i - 1].count) * 100).toFixed(1) : '0',
      rateFromTop: stages[0].count ? ((s.count / stages[0].count) * 100).toFixed(1) : '0',
    })).concat([
      {
        key: 'AMOUNT',
        name: tr('回款金额', 'Amount collected'),
        count: Number(payments._sum.amountBase ?? 0),
        rateFromPrev: '-',
        rateFromTop: '-',
      },
    ] as never)
  }

  /** 客户触点日历：按日聚合跟进/会议/合同/回款 */
  async touchpointCalendar(me: AuthUser, month?: string) {
    const now = new Date()
    const ym = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, m] = ym.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)

    const [acts, meetings, contracts, payments] = await Promise.all([
      this.db.activity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          OR: [
            { dueAt: { gte: start, lte: end } },
            { startAt: { gte: start, lte: end } },
            { createdAt: { gte: start, lte: end }, status: 'DONE' },
          ],
        },
        select: { id: true, type: true, subject: true, dueAt: true, startAt: true, createdAt: true, status: true },
        take: 500,
      }),
      this.db.meeting.findMany({
        where: { tenantId: me.tenantId, heldAt: { gte: start, lte: end } },
        select: { title: true, heldAt: true },
        take: 500,
      }),
      this.db.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          OR: [
            { signDate: { gte: start, lte: end } },
            { createdAt: { gte: start, lte: end } },
          ],
        },
        select: { id: true, contractNo: true, title: true, signDate: true, createdAt: true },
        take: 200,
      }),
      this.db.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          paidAt: { gte: start, lte: end },
        },
        select: { id: true, amount: true, paidAt: true, status: true },
        take: 200,
      }),
    ])

    const byDay = new Map<
      string,
      Array<{ type: string; title: string; time: string }>
    >()
    const add = (day: string, type: string, title: string, time: string) => {
      const arr = byDay.get(day) ?? []
      arr.push({ type, title, time })
      byDay.set(day, arr)
    }

    for (const a of acts) {
      const dt = a.dueAt ?? a.startAt ?? a.createdAt
      add(dt.toISOString().slice(0, 10), 'ACTIVITY', a.subject, dt.toISOString())
    }
    for (const m of meetings) {
      const held = m.heldAt.toISOString()
      add(held.slice(0, 10), 'MEETING', m.title || tr('会议', 'Meeting'), held)
    }
    for (const c of contracts) {
      const dt = c.signDate ?? c.createdAt
      add(dt.toISOString().slice(0, 10), 'CONTRACT', `${c.contractNo} ${c.title}`, dt.toISOString())
    }
    for (const p of payments) {
      const dt = p.paidAt
      add(dt.toISOString().slice(0, 10), 'PAYMENT', tr(`回款 ${p.amount}`, `Payment ${p.amount}`), dt.toISOString())
    }

    return {
      month: ym,
      days: [...byDay.entries()]
        .map(([date, events]) => ({
          date,
          count: events.length,
          events: events.slice(0, 8),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }
  }

  /** 客户画像标签云：统计标签频次与金额 */
  async tagCloud(me: AuthUser) {
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        customValues: true,
        contracts: {
          where: { status: { in: ['EFFECTIVE', 'FINISHED'] } },
          select: { total: true },
        },
      },
      take: 300,
    })
    const map = new Map<string, { tag: string; count: number; amount: number }>()
    for (const a of accounts) {
      const tags = ((a.customValues as { tags?: string[] })?.tags ?? []) as string[]
      const amount = a.contracts.reduce((s, c) => s + Number(c.total), 0)
      for (const t of tags) {
        const key = t.trim()
        if (!key) continue
        const row = map.get(key) ?? { tag: key, count: 0, amount: 0 }
        row.count++
        row.amount += amount
        map.set(key, row)
      }
    }
    return [...map.values()]
      .map((r) => ({ ...r, amount: r.amount.toFixed(2) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)
  }

  /** 销售陪练：按阶段/风险给话术与动作建议 */
  async salesCoach(me: AuthUser, opportunityId: string) {
    const opp = await this.db.opportunity.findFirst({
      where: { id: opportunityId, tenantId: me.tenantId, deletedAt: null },
      include: {
        stage: true,
        account: { select: { id: true, name: true, industry: true } },
      },
    })
    if (!opp) throw new BizException(ErrorCodes.NOT_FOUND, 'opportunity not found')

    const tips: string[] = []
    const scripts: string[] = []
    const stage = opp.stage?.code ?? ''

    if (stage === 'PROSPECTING') {
      tips.push(tr('先确认痛点与决策链，再推进演示', 'Confirm pain points and the decision chain before the demo'))
      const industry = opp.account?.industry
      scripts.push(
        tr(
          `开场：了解到贵司在关注「${industry ?? '相关领域'}」提效，想用 10 分钟对齐目前最大的瓶颈是人、流程还是数据？`,
          `Opening: I understand you're looking to improve efficiency in ${industry ?? 'your area'}. Could we take 10 minutes to align on whether the biggest bottleneck is people, process or data?`,
        ),
      )
    } else if (stage === 'QUALIFICATION') {
      tips.push(tr('锁定预算区间与采购时间表', 'Pin down the budget range and purchasing timeline'))
      scripts.push(tr('确认预算：这个项目本季度有立项预算吗？区间大概在什么量级？', 'Budget check: is there approved budget for this project this quarter, and roughly what range?'))
    } else if (stage === 'PROPOSAL' || stage === 'PROPOSAL_SENT') {
      tips.push(tr('跟进报价反馈，强调 ROI 与实施周期', 'Follow up on quote feedback; stress ROI and implementation time'))
      scripts.push(
        tr(
          '报价跟进：方案我们按分期实施，预计 3 个月见效。您看下周能安排 30 分钟过一下关键指标吗？',
          'Quote follow-up: we deliver in phases and expect results within 3 months. Could we spend 30 minutes next week on the key metrics?',
        ),
      )
    } else if (stage === 'NEGOTIATION') {
      tips.push(tr('准备 BATNA，折扣与条款交换', 'Prepare your BATNA; trade discounts for terms'))
      scripts.push(tr('谈判：若本季度签约，价格可再让 X%；同时希望锁三年服务。您看是否可拍板？', 'Negotiation: if we sign this quarter we can take another X% off, in exchange for a three-year term. Can you make the call?'))
    } else if (stage === 'WON') {
      tips.push(tr('立刻启动实施与客户成功计划', 'Kick off implementation and the customer success plan now'))
      scripts.push(tr('成交确认：感谢信任！本周我们会发出项目启动包与实施里程碑。', "Closing: thank you for your trust! We'll send the kickoff pack and implementation milestones this week."))
    } else {
      tips.push(tr('补充下一步动作并预约下次沟通', 'Add the next step and book the next conversation'))
      scripts.push(tr('跟进：上次沟通后我把要点整理了一下，您看本周哪天方便快速同步 15 分钟？', "Follow-up: I've summarized our last conversation. Which day this week works for a quick 15-minute sync?"))
    }

    if (!opp.nextStep) {
      tips.push(tr('当前缺少「下一步」，先补写明确动作与时间', 'No next step yet: add a concrete action and date'))
    }
    if (Number(opp.winRate) < 30) {
      tips.push(tr('赢率偏低：补强决策人关系或缩小试点范围', 'Low win rate: strengthen decision-maker relationships or narrow the pilot'))
    }
    if (!opp.competitor) {
      tips.push(tr('填写竞品字段，便于准备对抗话术', 'Fill in the competitor to prepare counter-arguments'))
    }
    if (Number(opp.amount) > 100000) {
      tips.push(tr('大额单：准备多线程干系人地图与高层拜访', 'Large deal: map multiple stakeholders and plan an executive visit'))
    }

    return {
      opportunity: { id: opp.id, name: opp.name, stage: sysLabel(opp.stage?.name), amount: String(opp.amount) },
      tips,
      scripts,
    }
  }

  /** 通用互动时间线：活动 + 阶段变更 + 报价/合同 */
  async entityTimeline(me: AuthUser, entityType: string, entityId: string) {
    const events: Array<{ at: string; type: string; title: string; detail: string }> = []
    const acts = await this.db.activity.findMany({
      where: {
        tenantId: me.tenantId,
        entityType,
        entityId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    for (const a of acts) {
      events.push({
        at: a.createdAt.toISOString(),
        type: 'ACTIVITY',
        title: a.subject,
        detail: a.content ?? `${a.type} · ${a.status}`,
      })
    }
    if (entityType === 'OPPORTUNITY') {
      const [hist, quotes] = await Promise.all([
        this.db.opportunityStageHistory.findMany({
          where: { tenantId: me.tenantId, opportunityId: entityId },
          orderBy: { changedAt: 'desc' },
          take: 15,
        }),
        this.db.quote.findMany({
          where: { tenantId: me.tenantId, opportunityId: entityId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ])
      const stageIds = [...new Set(hist.map((h) => h.toStageId))]
      const stages = await this.db.pipelineStage.findMany({
        where: { id: { in: stageIds } },
        select: { id: true, name: true },
      })
      const smap = new Map(stages.map((s) => [s.id, s.name]))
      for (const h of hist) {
        events.push({
          at: h.changedAt.toISOString(),
          type: 'OPPORTUNITY',
          title: `${tr('阶段变更', 'Stage change')} → ${sysLabel(smap.get(h.toStageId)) || h.toStageId}`,
          detail: h.note ?? '',
        })
      }
      for (const q of quotes) {
        events.push({
          at: q.createdAt.toISOString(),
          type: 'QUOTE',
          title: `${tr('报价', 'Quote')} ${q.quoteNo}`,
          detail: `${q.status} · ${q.total}`,
        })
      }
    }
    events.sort((a, b) => (a.at < b.at ? 1 : -1))
    return { events: events.slice(0, 40) }
  }

  /** 预测 Commit 看板：Commit / Best Case / Pipeline 三栏（对标 Salesforce Forecast） */
  async forecastBoard(me: AuthUser) {
    const opps = await this.db.opportunity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, stage: { isClosing: false } },
      include: {
        stage: { select: { name: true, code: true, isClosing: true } },
        account: { select: { name: true } },
      },
      orderBy: { amountBase: 'desc' },
      take: 200,
    })
    const buckets: Record<
      'COMMIT' | 'BEST' | 'PIPELINE',
      { name: string; count: number; amount: number; items: unknown[] }
    > = {
      COMMIT: { name: 'Commit', count: 0, amount: 0, items: [] },
      BEST: { name: 'Best Case', count: 0, amount: 0, items: [] },
      PIPELINE: { name: 'Pipeline', count: 0, amount: 0, items: [] },
    }
    for (const o of opps) {
      const code = o.stage?.code ?? ''
      const wr = o.winRate || 0
      const cat =
        wr >= 70 || ['NEGOTIATION', 'CONTRACT'].includes(code)
          ? 'COMMIT'
          : wr >= 40 || ['PROPOSAL', 'QUALIFICATION'].includes(code)
            ? 'BEST'
            : 'PIPELINE'
      buckets[cat].count++
      buckets[cat].amount += Number(o.amount)
      if (buckets[cat].items.length < 8) {
        buckets[cat].items.push({
          id: o.id,
          name: o.name,
          amount: o.amount,
          winRate: o.winRate,
          stage: o.stage?.name ?? '',
          account: o.account?.name ?? '',
          expectedCloseDate: o.expectedCloseDate,
        })
      }
    }
    return {
      buckets: Object.entries(buckets).map(([key, v]) => ({
        key,
        ...v,
        amount: v.amount.toFixed(2),
      })),
      totalAmount: Object.values(buckets)
        .reduce((a, b) => a + b.amount, 0)
        .toFixed(2),
    }
  }

  /** 赢率评分看板：开放商机批量评分（对标 Salesforce/Einstein） */
  async scoreBoard(me: AuthUser, limit = 20) {
    const opps = await this.db.opportunity.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, stage: { isClosing: false } },
      include: {
        stage: { select: { name: true, code: true } },
        account: { select: { id: true, name: true, level: true } },
      },
      orderBy: { amountBase: 'desc' },
      take: 80,
    })
    const from = new Date(Date.now() - 30 * 86400000)
    const rows = await Promise.all(
      opps.map(async (o) => {
        const [acts, quotes, contacts] = await Promise.all([
          this.db.activity.count({
            where: {
              tenantId: me.tenantId,
              entityType: 'OPPORTUNITY',
              entityId: o.id,
              deletedAt: null,
              createdAt: { gte: from },
            },
          }),
          this.db.quote.count({ where: { opportunityId: o.id, deletedAt: null } }),
          this.db.contact.count({ where: { accountId: o.accountId, deletedAt: null } }),
        ])
        const amount = Number(o.amount)
        const amountScore = amount >= 200000 ? 20 : amount >= 50000 ? 15 : amount >= 10000 ? 10 : 5
        const stageScore = ['NEGOTIATION', 'PROPOSAL'].includes(o.stage?.code ?? '') ? 18 : 10
        const actScore = acts >= 6 ? 20 : acts >= 3 ? 14 : acts >= 1 ? 8 : 0
        let infoScore = 0
        if (o.nextStep) infoScore += 6
        if (o.competitor) infoScore += 4
        if (o.expectedCloseDate) infoScore += 4
        if (quotes > 0) infoScore += 6
        const customerScore =
          (o.account?.level === 'A' ? 10 : o.account?.level === 'B' ? 7 : 4) +
          (contacts >= 3 ? 10 : contacts >= 1 ? 6 : 0)
        const total = amountScore + stageScore + actScore + infoScore + Math.min(20, customerScore)
        const grade = total >= 80 ? 'A' : total >= 60 ? 'B' : total >= 40 ? 'C' : 'D'
        return {
          id: o.id,
          name: o.name,
          amount: o.amount,
          winRate: o.winRate,
          stage: o.stage?.name ?? '',
          account: o.account?.name ?? '',
          owner: '',
          score: total,
          grade,
          acts,
        }
      }),
    )
    rows.sort((a, b) => b.score - a.score)
    return { items: rows.slice(0, limit), total: rows.length }
  }

  /** 下一步最佳行动（Next Best Action） */
  async nextActions(me: AuthUser, body: { opportunityId?: string; accountId?: string }) {
    const items: {
      title: string
      reason: string
      priority: 'HIGH' | 'MEDIUM' | 'LOW'
      action: string
      href?: string
    }[] = []

    if (body.opportunityId) {
      const opp = await this.db.opportunity.findFirst({
        where: { id: body.opportunityId, tenantId: me.tenantId, deletedAt: null },
        include: { stage: true, account: true },
      })
      if (opp) {
        const acts30 = await this.db.activity.count({
          where: {
            tenantId: me.tenantId,
            entityType: 'OPPORTUNITY',
            entityId: opp.id,
            deletedAt: null,
            createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
          },
        })
        const quotes = await this.db.quote.count({
          where: { opportunityId: opp.id, deletedAt: null },
        })
        if (!opp.nextStep) {
          items.push({
            title: tr('补全「下一步」', 'Add a next step'),
            reason: tr('缺少下一步会影响预测与协同', 'A missing next step hurts forecasting and teamwork'),
            priority: 'HIGH',
            action: tr('填写下次拜访/方案动作', 'Enter the next visit or proposal action'),
            href: `/opportunities/${opp.id}`,
          })
        }
        if (acts30 === 0) {
          items.push({
            title: tr('发起一次跟进', 'Follow up'),
            reason: tr('近 30 天无互动', 'No interaction in the last 30 days'),
            priority: 'HIGH',
            action: tr('电话/会议/邮件任选一项', 'Call, meet or email'),
            href: '/activities',
          })
        }
        if (quotes === 0 && ['PROPOSAL', 'NEGOTIATION'].includes(opp.stage?.code ?? '')) {
          items.push({
            title: tr('创建报价', 'Create a quote'),
            reason: tr(`阶段为 ${opp.stage?.name ?? ''} 但无报价`, `Stage is ${sysLabel(opp.stage?.name)} but there is no quote`),
            priority: 'MEDIUM',
            action: tr('套用产品/报价模板出价', 'Price it with a product or quote template'),
            href: '/quotes',
          })
        }
        if (!opp.competitor) {
          items.push({
            title: tr('识别竞争对手', 'Identify competitors'),
            reason: tr('缺竞品信息不利于赢单策略', 'Without competitor info it is hard to plan a winning strategy'),
            priority: 'MEDIUM',
            action: tr('在商机中记录竞品与差异点', 'Record competitors and differentiators on the opportunity'),
            href: `/opportunities/${opp.id}`,
          })
        }
      }
    }

    if (body.accountId) {
      const health = await this.accountHealth(me, body.accountId)
      if (health.score < 80) {
        items.push({
          title: tr('客户健康干预', 'Account health intervention'),
          reason: tr(`健康分 ${health.score}（${health.factors?.join('/') ?? ''}）`, `Health score ${health.score} (${health.factors?.join(' / ') ?? ''})`),
          priority: health.score < 50 ? 'HIGH' : 'MEDIUM',
          action: tr('安排关怀回访 / 成功计划', 'Arrange a care call or success plan'),
          href: `/accounts/${body.accountId}`,
        })
      }
    }

    if (!items.length) {
      items.push({
        title: tr('保持节奏', 'Keep the pace'),
        reason: tr('当前关键动作已齐备', 'All key actions are in place'),
        priority: 'LOW',
        action: tr('按销售路径推进即可', 'Continue along the sales path'),
      })
    }
    return { items: items.slice(0, 6) }
  }

  /** 商机评分模型：金额/跟进/阶段/信息完整度/时效 */
  async opportunityScore(me: AuthUser, opportunityId: string) {
    const opp = await this.db.opportunity.findFirst({
      where: { id: opportunityId, tenantId: me.tenantId, deletedAt: null },
      include: {
        stage: true,
        account: { select: { id: true, name: true, level: true } },
      },
    })
    if (!opp) throw new BizException(ErrorCodes.NOT_FOUND, 'opportunity not found')

    const from = new Date(Date.now() - 30 * 86400000)
    const [acts, quotes, contacts] = await Promise.all([
      this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          entityType: 'OPPORTUNITY',
          entityId: opp.id,
          deletedAt: null,
          createdAt: { gte: from },
        },
      }),
      this.db.quote.count({
        where: { opportunityId: opp.id, deletedAt: null },
      }),
      this.db.contact.count({
        where: { accountId: opp.accountId, deletedAt: null },
      }),
    ])

    const parts: { factor: string; score: number; max: number; note: string }[] = []

    // 金额：越大越优（20）
    const amount = Number(opp.amount)
    const amountScore = amount >= 200000 ? 20 : amount >= 50000 ? 15 : amount >= 10000 ? 10 : 5
    parts.push({ factor: tr('金额规模', 'Deal size'), score: amountScore, max: 20, note: tr(`金额 ${amount}`, `Amount ${amount}`) })

    // 阶段推进（20）
    const stageScore = opp.stage?.isClosing
      ? 20
      : ['NEGOTIATION', 'PROPOSAL'].includes(opp.stage?.code ?? '')
        ? 18
        : ['QUALIFICATION'].includes(opp.stage?.code ?? '')
          ? 12
          : 8
    parts.push({ factor: tr('阶段推进', 'Stage progress'), score: stageScore, max: 20, note: `${tr('阶段', 'Stage')} ${sysLabel(opp.stage?.name)}` })

    // 跟进热度（20）
    const actScore = acts >= 6 ? 20 : acts >= 3 ? 14 : acts >= 1 ? 8 : 0
    parts.push({ factor: tr('跟进热度', 'Engagement'), score: actScore, max: 20, note: tr(`近30天 ${acts} 次`, `${acts} in last 30 days`) })

    // 信息完整度（20）
    let infoScore = 0
    if (opp.nextStep) infoScore += 6
    if (opp.competitor) infoScore += 4
    if (opp.expectedCloseDate) infoScore += 4
    if (quotes > 0) infoScore += 6
    parts.push({
      factor: tr('信息完整', 'Completeness'),
      score: infoScore,
      max: 20,
      note: [opp.nextStep && tr('有下一步', 'Next step'), opp.competitor && tr('有竞品', 'Competitor'), quotes && tr('有报价', 'Quote')]
        .filter(Boolean)
        .join(' / ') || tr('待补充', 'Incomplete'),
    })

    // 客户与联系人（20）
    let customerScore = 0
    if (opp.account?.level === 'A') customerScore += 10
    else if (opp.account?.level === 'B') customerScore += 7
    else customerScore += 4
    if (contacts >= 3) customerScore += 10
    else if (contacts >= 1) customerScore += 6
    parts.push({
      factor: tr('客户基础', 'Account basics'),
      score: Math.min(20, customerScore),
      max: 20,
      note: tr(`等级 ${opp.account?.level ?? '-'} / 联系人 ${contacts}`, `Level ${opp.account?.level ?? '-'} / ${contacts} contacts`),
    })

    const total = parts.reduce((s, p) => s + p.score, 0)
    const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 50 ? 'C' : 'D'
    return {
      opportunityId: opp.id,
      name: opp.name,
      total,
      grade,
      parts,
    }
  }

  /** 合同续费看板：到期合同 × 续费商机进度 */
  async renewalBoard(me: AuthUser, days = 90) {
    const now = new Date()
    const until = new Date(now.getTime() + days * 86400000)
    const contracts = await this.db.contract.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: 'EFFECTIVE',
        expireDate: { gte: now, lte: until },
      },
      select: {
        id: true,
        contractNo: true,
        title: true,
        total: true,
        receivedAmount: true,
        expireDate: true,
        ownerId: true,
        accountId: true,
        account: { select: { id: true, name: true } },
      },
      orderBy: { expireDate: 'asc' },
      take: 100,
    })

    const owners = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))

    const rows = await Promise.all(
      contracts.map(async (c) => {
        const opp = await this.db.opportunity.findFirst({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            OR: [
              { name: { in: [`续费-${c.contractNo}`, `Renewal-${c.contractNo}`] } },
              { accountId: c.accountId, name: { contains: '续费' } },
              { accountId: c.accountId, name: { contains: 'renewal', mode: 'insensitive' as const } },
            ],
          },
          select: {
            id: true,
            name: true,
            amount: true,
            stage: { select: { code: true, name: true } },
            expectedCloseDate: true,
          },
        })
        const daysLeft = Math.ceil((c.expireDate!.getTime() - now.getTime()) / 86400000)
        return {
          contractId: c.id,
          contractNo: c.contractNo,
          title: c.title,
          accountName: c.account?.name ?? '',
          total: String(c.total),
          receivedAmount: String(c.receivedAmount),
          expireDate: c.expireDate?.toISOString().slice(0, 10) ?? '',
          daysLeft,
          owner: umap.get(c.ownerId) ?? '',
          renewalOpp: opp
            ? {
                id: opp.id,
                name: opp.name,
                amount: String(opp.amount),
                stage: opp.stage?.name ?? '',
                stageCode: opp.stage?.code ?? '',
                expectedCloseDate:
                  opp.expectedCloseDate?.toISOString().slice(0, 10) ?? '',
              }
            : null,
          status: opp
            ? opp.stage?.code === 'WON'
              ? 'RENEWED'
              : opp.stage?.code === 'LOST'
                ? 'CHURN_RISK'
                : 'IN_PROGRESS'
            : 'NOT_STARTED',
        }
      }),
    )

    return {
      days,
      total: rows.length,
      notStarted: rows.filter((r) => r.status === 'NOT_STARTED').length,
      inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
      renewed: rows.filter((r) => r.status === 'RENEWED').length,
      items: rows,
    }
  }

  /** 销售漏斗预警：阶段转化骤降 / 停滞商机堆积 */
  /** 漏斗健康度评分：阶段分布 + 转化 + 停滞 */
  async funnelHealth(me: AuthUser) {
    const funnel = await this.funnel(me)
    const alerts = await this.funnelAlerts(me)
    const total = funnel.reduce((s, f) => s + f.count, 0)
    const top = funnel[0]?.count ?? 0
    const balance = total > 0 ? Math.min(100, (1 - Math.abs(top / total - 0.5) * 2) * 100) : 50
    const alertScore = Math.max(0, 100 - (alerts.high ?? 0) * 20 - (alerts.total ?? 0) * 5)
    const score = Math.round(balance * 0.4 + alertScore * 0.6)
    return {
      score,
      level: score >= 80 ? 'HEALTHY' : score >= 50 ? 'AT_RISK' : 'RISK',
      balance: balance.toFixed(1),
      alertScore: alertScore.toFixed(1),
      alertCount: alerts.total ?? 0,
      highAlerts: alerts.high ?? 0,
      stages: funnel.map((f) => ({
        name: f.name,
        count: f.count,
        share: total > 0 ? ((f.count / total) * 100).toFixed(1) : '0',
      })),
    }
  }

  /** 漏斗健康度趋势：近 12 周快照 */
  async funnelHealthTrend(me: AuthUser) {
    const health = await this.funnelHealth(me)
    const trimmed = await this.recordSnapshot(me, 'FUNNEL', '', health.score, '', 84)
    return {
      current: health,
      points: trimmed.slice(-12),
    }
  }

  async funnelAlerts(me: AuthUser) {
    const funnel = await this.funnel(me)
    const alerts: Array<{
      level: 'HIGH' | 'MEDIUM' | 'LOW'
      type: string
      message: string
      stage?: string
      count?: number
      amount?: string
    }> = []

    // 阶段转化骤降：相邻阶段数量比 < 20% 且上游有量
    for (let i = 1; i < funnel.length; i++) {
      const prev = funnel[i - 1]
      const cur = funnel[i]
      if (prev.count >= 3 && cur.count > 0 && cur.count / prev.count < 0.2) {
        alerts.push({
          level: 'HIGH',
          type: 'CONVERSION_DROP',
          stage: cur.name,
          count: cur.count,
          amount: cur.amount,
          message: tr(
            `「${prev.name} → ${cur.name}」转化仅 ${((cur.count / prev.count) * 100).toFixed(0)}%，建议复盘推进卡点`,
            `Only ${((cur.count / prev.count) * 100).toFixed(0)}% convert from "${sysLabel(prev.name)}" to "${sysLabel(cur.name)}". Review what blocks progress.`,
          ),
        })
      }
    }

    // 停滞商机：14 天无更新且未关闭
    const staleCut = new Date(Date.now() - 14 * 86400000)
    const stale = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        updatedAt: { lt: staleCut },
        stage: { isClosing: false },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        updatedAt: true,
        stage: { select: { name: true } },
      },
      take: 20,
    })
    if (stale.length) {
      alerts.push({
        level: stale.length >= 5 ? 'HIGH' : 'MEDIUM',
        type: 'STALE_DEALS',
        count: stale.length,
        amount: stale.reduce((s, o) => s + Number(o.amount), 0).toFixed(2),
        message: tr(
          `${stale.length} 个商机超过 14 天无更新，金额 ${stale.reduce((s, o) => s + Number(o.amount), 0).toFixed(0)}`,
          `${stale.length} opportunities have not been updated for over 14 days, totaling ${stale.reduce((s, o) => s + Number(o.amount), 0).toFixed(0)}`,
        ),
      })
    }

    // 早期阶段堆积
    const first = funnel[0]
    if (first && first.count >= 10) {
      alerts.push({
        level: 'LOW',
        type: 'EARLY_PILE',
        stage: first.name,
        count: first.count,
        amount: first.amount,
        message: tr(
          `「${first.name}」堆积 ${first.count} 单，建议加速筛选/转化`,
          `${first.count} deals are piling up in "${sysLabel(first.name)}". Qualify or convert them faster.`,
        ),
      })
    }

    // 无下一步的开放商机
    const noNext = await this.db.opportunity.count({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { isClosing: false },
        OR: [{ nextStep: null }, { nextStep: '' }],
      },
    })
    if (noNext > 0) {
      alerts.push({
        level: 'MEDIUM',
        type: 'NO_NEXT_STEP',
        count: noNext,
        message: tr(
          `${noNext} 个开放商机缺少「下一步」，影响预测准确性`,
          `${noNext} open opportunities have no next step, which hurts forecast accuracy`,
        ),
      })
    }

    return {
      total: alerts.length,
      high: alerts.filter((a) => a.level === 'HIGH').length,
      items: alerts,
      staleDeals: stale.slice(0, 8).map((o) => ({
        id: o.id,
        name: o.name,
        amount: String(o.amount),
        stage: o.stage.name,
        updatedAt: o.updatedAt.toISOString().slice(0, 10),
      })),
    }
  }

  /** 记录今日健康分快照（每日一条，当天重复调用不改写），返回最近 keep 个点（旧→新） */
  private async recordSnapshot(
    me: AuthUser,
    kind: 'ACCOUNT' | 'FUNNEL',
    subjectId: string,
    score: number,
    level: string,
    keep: number,
  ) {
    const date = new Date().toISOString().slice(0, 10)
    await this.db.healthSnapshot.upsert({
      where: { tenantId_kind_subjectId_date: { tenantId: me.tenantId, kind, subjectId, date } },
      update: {},
      create: { tenantId: me.tenantId, kind, subjectId, date, score, level },
    })
    const rows = await this.db.healthSnapshot.findMany({
      where: { tenantId: me.tenantId, kind, subjectId },
      orderBy: { date: 'desc' },
      take: keep,
    })
    return rows.reverse().map((r) => ({ date: r.date, score: r.score, ...(kind === 'ACCOUNT' ? { level: r.level } : {}) }))
  }

  /** 客户健康趋势：按日记录分数快照，返回近 30 点 */
  async healthTrend(me: AuthUser, accountId: string) {
    const health = await this.accountHealth(me, accountId)
    const trimmed = await this.recordSnapshot(me, 'ACCOUNT', accountId, health.score, health.level, 30)
    return {
      current: health,
      points: trimmed,
    }
  }

  /** 团队健康趋势：聚合各客户每日健康分快照，按日求均值 */
  async teamHealthTrend(me: AuthUser) {
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
    const snaps = await this.db.healthSnapshot.groupBy({
      by: ['date'],
      where: { tenantId: me.tenantId, kind: 'ACCOUNT', date: { gte: since } },
      _sum: { score: true },
      _count: { _all: true },
    })
    const byDate = new Map<string, { sum: number; n: number }>()
    for (const r of snaps) byDate.set(r.date, { sum: Number(r._sum.score ?? 0), n: r._count._all })
    const points = [...byDate.entries()]
      .map(([date, v]) => ({
        date,
        avg: Math.round((v.sum / v.n) * 10) / 10,
        accounts: v.n,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)

    // 当前分布
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true },
      take: 80,
    })
    let healthy = 0
    let atRisk = 0
    let risk = 0
    for (const a of accounts) {
      const h = await this.accountHealth(me, a.id)
      if (h.score >= 80) healthy++
      else if (h.score >= 50) atRisk++
      else risk++
    }
    return {
      points,
      distribution: { healthy, atRisk, risk, total: accounts.length },
      avg:
        points.length > 0
          ? points[points.length - 1].avg
          : 0,
    }
  }

  /** 预测偏差：Commit 提交 vs 实际赢单/回款，识别乐观/悲观 */
  async forecastBias(me: AuthUser, month?: string) {
    const now = new Date()
    const ym =
      month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, m] = ym.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)

    const commits = (
      await this.db.forecastCommit.findMany({ where: { tenantId: me.tenantId, month: ym } })
    ).map(toForecastCommit)

    const won = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { code: 'WON' },
        actualCloseDate: { gte: start, lte: end },
      },
      select: { ownerId: true, amount: true },
    })
    const pays = await this.db.payment.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'RECONCILED'] },
        paidAt: { gte: start, lte: end },
      },
      select: { amount: true, contract: { select: { ownerId: true } } },
    })
    const users = await this.db.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true },
    })

    const items = users
      .map((u) => {
        const commit = commits.find((c) => c.userId === u.id)
        const commitAmt = Number(commit?.commitAmount ?? 0)
        const bestAmt = Number(commit?.bestAmount ?? 0)
        const wonAmt = won
          .filter((w) => w.ownerId === u.id)
          .reduce((s, w) => s + Number(w.amount), 0)
        const recvAmt = pays
          .filter((p) => p.contract?.ownerId === u.id)
          .reduce((s, p) => s + Number(p.amount), 0)
        const gap = wonAmt - commitAmt
        const bias =
          commitAmt === 0
            ? 'NO_COMMIT'
            : gap > commitAmt * 0.2
              ? 'OVER_DELIVER'
              : gap < -commitAmt * 0.2
                ? 'OVER_COMMIT'
                : 'ON_TRACK'
        return {
          userId: u.id,
          name: u.name,
          commitAmount: commitAmt.toFixed(2),
          bestAmount: bestAmt.toFixed(2),
          wonAmount: wonAmt.toFixed(2),
          receivedAmount: recvAmt.toFixed(2),
          gap: gap.toFixed(2),
          bias,
          hitRate:
            commitAmt > 0
              ? ((wonAmt / commitAmt) * 100).toFixed(1)
              : wonAmt > 0
                ? '∞'
                : '-',
        }
      })
      .filter(
        (x) =>
          x.bias !== 'NO_COMMIT' ||
          Number(x.wonAmount) > 0 ||
          Number(x.commitAmount) > 0,
      )
      .sort((a, b) => Number(b.gap) - Number(a.gap))

    const totalCommit = items.reduce((s, i) => s + Number(i.commitAmount), 0)
    const totalWon = items.reduce((s, i) => s + Number(i.wonAmount), 0)
    return {
      month: ym,
      summary: {
        totalCommit: totalCommit.toFixed(2),
        totalWon: totalWon.toFixed(2),
        gap: (totalWon - totalCommit).toFixed(2),
        hitRate:
          totalCommit > 0
            ? ((totalWon / totalCommit) * 100).toFixed(1)
            : '-',
        overCommit: items.filter((i) => i.bias === 'OVER_COMMIT').length,
        overDeliver: items.filter((i) => i.bias === 'OVER_DELIVER').length,
      },
      items,
    }
  }

  /** 客户续费预测：健康度 + 回款完成度 + 活跃度 → 续费概率/预估金额 */
  async renewalForecast(me: AuthUser, days = 90) {
    const now = new Date()
    const until = new Date(now.getTime() + days * 86400000)
    const contracts = await this.db.contract.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: 'EFFECTIVE',
        expireDate: { gte: now, lte: until },
      },
      select: {
        id: true,
        contractNo: true,
        title: true,
        total: true,
        receivedAmount: true,
        expireDate: true,
        ownerId: true,
        accountId: true,
        account: { select: { id: true, name: true, lastActivityAt: true } },
      },
      orderBy: { expireDate: 'asc' },
      take: 80,
    })
    const owners = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))

    const items = await Promise.all(
      contracts.map(async (c) => {
        const health = await this.accountHealth(me, c.accountId)
        const received = Number(c.receivedAmount)
        const total = Number(c.total)
        const payRatio = total > 0 ? received / total : 0
        const idleDays = c.account?.lastActivityAt
          ? Math.floor((now.getTime() - c.account.lastActivityAt.getTime()) / 86400000)
          : 999
        // 概率模型：健康 40% + 回款 30% + 活跃 30%
        const healthScore = health.score / 100
        const payScore = Math.min(payRatio, 1)
        const activeScore = idleDays <= 14 ? 1 : idleDays <= 30 ? 0.6 : idleDays <= 60 ? 0.3 : 0
        const probability = Math.round(
          (healthScore * 0.4 + payScore * 0.3 + activeScore * 0.3) * 100,
        )
        const estimated = (total * (probability / 100)).toFixed(2)
        return {
          contractId: c.id,
          contractNo: c.contractNo,
          accountName: c.account?.name ?? '',
          total: String(c.total),
          receivedAmount: String(c.receivedAmount),
          expireDate: c.expireDate?.toISOString().slice(0, 10) ?? '',
          owner: umap.get(c.ownerId) ?? '',
          healthScore: health.score,
          probability,
          estimated,
          idleDays,
          level:
            probability >= 70 ? 'HIGH' : probability >= 40 ? 'MEDIUM' : 'LOW',
        }
      }),
    )

    const totalEst = items.reduce((s, i) => s + Number(i.estimated), 0)
    return {
      days,
      total: items.length,
      totalEstimated: totalEst.toFixed(2),
      high: items.filter((i) => i.level === 'HIGH').length,
      medium: items.filter((i) => i.level === 'MEDIUM').length,
      low: items.filter((i) => i.level === 'LOW').length,
      items,
    }
  }

  /** 销售配额瀑布：目标 → 已达成 → 加权在途 → 缺口（对标 Salesforce Quota） */
  async quotaWaterfall(me: AuthUser, periodKey?: string) {
    const now = new Date()
    const key = periodKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const [y, m] = key.split('-').map(Number)
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59)

    const [goals, won, openOpps, payments] = await Promise.all([
      this.db.goal.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          periodKey: key,
          metric: 'WON_AMOUNT',
        },
      }),
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { code: 'WON' },
          actualCloseDate: { gte: start, lte: end },
        },
        select: { amount: true, ownerId: true, winRate: true },
      }),
      this.db.opportunity.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          stage: { isClosing: false },
          expectedCloseDate: { gte: start, lte: end },
        },
        select: { amount: true, winRate: true, ownerId: true },
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
    ])

    const target = goals.reduce((a, g) => a + Number(g.targetAmount), 0)
    const wonAmount = won.reduce((a, o) => a + Number(o.amount), 0)
    const weightedPipeline = openOpps.reduce(
      (a, o) => a + (Number(o.amount) * (o.winRate || 0)) / 100,
      0,
    )
    const received = payments.reduce((a, p) => a + Number(p.amount), 0)
    const gap = Math.max(0, target - wonAmount - weightedPipeline)

    return {
      periodKey: key,
      target: target.toFixed(2),
      wonAmount: wonAmount.toFixed(2),
      weightedPipeline: weightedPipeline.toFixed(2),
      received: received.toFixed(2),
      gap: gap.toFixed(2),
      coverage:
        target > 0 ? (((wonAmount + weightedPipeline) / target) * 100).toFixed(1) : '0',
      items: [
        { label: tr('目标', 'Target'), value: target, type: 'total' },
        { label: tr('已赢单', 'Won'), value: wonAmount, type: 'positive' },
        { label: tr('加权在途', 'Weighted pipeline'), value: weightedPipeline, type: 'positive' },
        { label: tr('缺口', 'Gap'), value: gap, type: 'negative' },
        { label: tr('回款', 'Collected'), value: received, type: 'info' },
      ],
      byOwner: await (async () => {
        const owners = await this.db.user.findMany({
          where: { tenantId: me.tenantId, deletedAt: null },
          select: { id: true, name: true },
        })
        return owners.map((u) => {
          const t = goals.filter((g) => g.userId === u.id).reduce((a, g) => a + Number(g.targetAmount), 0)
          const w = won.filter((x) => x.ownerId === u.id).reduce((a, x) => a + Number(x.amount), 0)
          const p = openOpps
            .filter((x) => x.ownerId === u.id)
            .reduce((a, x) => a + (Number(x.amount) * (x.winRate || 0)) / 100, 0)
          return {
            userId: u.id,
            name: u.name,
            target: t.toFixed(2),
            wonAmount: w.toFixed(2),
            weightedPipeline: p.toFixed(2),
            gap: Math.max(0, t - w - p).toFixed(2),
            coverage: t > 0 ? (((w + p) / t) * 100).toFixed(1) : '0',
          }
        })
      })(),
    }
  }

  /** 数据质量检查：缺失字段 / 重复 / 不完整记录 */
  async dataQuality(me: AuthUser) {
    const [leads, accounts, opps] = await Promise.all([
      this.db.lead.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          source: true,
          status: true,
        },
        take: 500,
      }),
      this.db.account.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          industry: true,
          phone: true,
          stage: true,
          ownerId: true,
        },
        take: 500,
      }),
      this.db.opportunity.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          nextStep: true,
          expectedCloseDate: true,
          amount: true,
          competitor: true,
        },
        take: 500,
      }),
    ])

    const issues: Array<{
      type: string
      level: 'HIGH' | 'MEDIUM' | 'LOW'
      entity: string
      entityId: string
      name: string
      message: string
    }> = []

    for (const l of leads) {
      if (!l.phone && !l.email) {
        issues.push({
          type: 'MISSING_CONTACT',
          level: 'HIGH',
          entity: 'LEAD',
          entityId: l.id,
          name: l.name,
          message: tr('线索缺少电话与邮箱', 'Lead has no phone or email'),
        })
      }
    }

    // 客户重名
    const nameCount = new Map<string, number>()
    for (const a of accounts) {
      nameCount.set(a.name, (nameCount.get(a.name) ?? 0) + 1)
    }
    for (const a of accounts) {
      if ((nameCount.get(a.name) ?? 0) > 1) {
        issues.push({
          type: 'DUPLICATE_NAME',
          level: 'MEDIUM',
          entity: 'ACCOUNT',
          entityId: a.id,
          name: a.name,
          message: tr('存在同名客户，建议合并', 'Duplicate account name; consider merging'),
        })
      }
      if (!a.industry) {
        issues.push({
          type: 'MISSING_INDUSTRY',
          level: 'LOW',
          entity: 'ACCOUNT',
          entityId: a.id,
          name: a.name,
          message: tr('客户未填行业', 'Account industry is missing'),
        })
      }
    }

    for (const o of opps) {
      if (!o.nextStep) {
        issues.push({
          type: 'MISSING_NEXT_STEP',
          level: 'MEDIUM',
          entity: 'OPPORTUNITY',
          entityId: o.id,
          name: o.name,
          message: tr('商机缺少下一步', 'Opportunity has no next step'),
        })
      }
    }

    const score = Math.max(0, 100 - issues.filter((i) => i.level === 'HIGH').length * 5 -
      issues.filter((i) => i.level === 'MEDIUM').length * 2)
    return {
      score,
      total: issues.length,
      high: issues.filter((i) => i.level === 'HIGH').length,
      medium: issues.filter((i) => i.level === 'MEDIUM').length,
      low: issues.filter((i) => i.level === 'LOW').length,
      items: issues.slice(0, 50),
    }
  }

  /** 销售作战室看板：开放商机的作战卡完整度与待办 */
  async battlecardBoard(me: AuthUser) {
    const opps = await this.db.opportunity.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { isClosing: false },
      },
      select: {
        id: true,
        name: true,
        amount: true,
        winRate: true,
        competitor: true,
        nextStep: true,
        ownerId: true,
        updatedAt: true,
        stage: { select: { name: true, code: true } },
        account: { select: { name: true } },
      },
      orderBy: { amountBase: 'desc' },
      take: 30,
    })

    const owners = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))

    const cards = await this.db.opportunityBattlecard.findMany({
      where: { tenantId: me.tenantId, opportunityId: { in: opps.map((o) => o.id) } },
    })
    const cardMap = new Map(cards.map((c) => [c.opportunityId, toBattlecard(c)]))
    const items = await Promise.all(
      opps.map(async (o) => {
        const bc = (cardMap.get(o.id) ?? {}) as {
          competitors?: string
          stakeholders?: string
          winThemes?: string
          risks?: string
          actions?: { text: string; done: boolean }[]
        }
        const fields = [
          bc.competitors,
          bc.stakeholders,
          bc.winThemes,
          bc.risks,
        ].filter(Boolean).length
        const actions = bc.actions ?? []
        const doneActions = actions.filter((a) => a.done).length
        const completeness = Math.round(
          ((fields / 4) * 0.6 + (actions.length ? (doneActions / actions.length) * 0.4 : 0)) * 100,
        )
        return {
          id: o.id,
          name: o.name,
          accountName: o.account?.name ?? '',
          amount: String(o.amount),
          winRate: o.winRate,
          stage: o.stage.name,
          owner: umap.get(o.ownerId) ?? '',
          competitor: o.competitor ?? '',
          nextStep: o.nextStep ?? '',
          completeness,
          actionsTotal: actions.length,
          actionsDone: doneActions,
          hasBattlecard: fields > 0,
        }
      }),
    )

    return {
      total: items.length,
      withCard: items.filter((i) => i.hasBattlecard).length,
      avgCompleteness: items.length
        ? Math.round(items.reduce((s, i) => s + i.completeness, 0) / items.length)
        : 0,
      items,
    }
  }

  /** 客户健康干预队列：按风险排序 + 是否已干预 */
  async healthInterventionQueue(me: AuthUser, limit = 15) {
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        stage: true,
        level: true,
        ownerId: true,
        lastActivityAt: true,
      },
      take: 100,
    })
    const owners = await this.db.user.findMany({
      where: { tenantId: me.tenantId },
      select: { id: true, name: true },
    })
    const umap = new Map(owners.map((u) => [u.id, u.name]))

    const rows: Array<Record<string, unknown>> = []
    for (const a of accounts) {
      const health = await this.accountHealth(me, a.id)
      if (health.score >= 80) continue
      // 是否近 7 天已生成过干预活动
      const acted = await this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          entityType: 'ACCOUNT',
          entityId: a.id,
          deletedAt: null,
          createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          OR: [{ subject: { contains: '关怀' } }, { subject: { contains: 'care', mode: 'insensitive' as const } }],
        },
      })
      rows.push({
        id: a.id,
        name: a.name,
        stage: a.stage,
        level: a.level,
        owner: umap.get(a.ownerId) ?? '',
        ownerId: a.ownerId,
        score: health.score,
        levelCode: health.level,
        factors: health.factors,
        lastActivityAt: a.lastActivityAt?.toISOString() ?? null,
        intervened: acted > 0,
      })
    }
    rows.sort((x, y) => Number(x.score) - Number(y.score))
    return {
      total: rows.length,
      intervened: rows.filter((r) => r.intervened).length,
      pending: rows.filter((r) => !r.intervened).length,
      items: rows.slice(0, limit),
    }
  }

  /** 接口用量统计：近 15 分钟按路径聚合 */
  async apiUsage() {
    const { getPerfStats } = await import('../../common/middleware/request-log.middleware')
    const perf = getPerfStats()
    return {
      windowMinutes: perf.windowMinutes,
      total: perf.total,
      errorCount: perf.errorCount,
      errorRate:
        perf.total > 0
          ? ((perf.errorCount / perf.total) * 100).toFixed(1)
          : '0',
      p50: perf.p50,
      p95: perf.p95,
      byPath: perf.slowest,
      // 业务接口占比粗分
      categories: [
        {
          name: tr('查询', 'Reads'),
          count: perf.slowest
            .filter((s) => s.path.includes('/reports') || s.path.includes('list') || s.path.endsWith('s'))
            .reduce((s, x) => s + x.count, 0),
        },
        {
          name: tr('写入', 'Writes'),
          count: perf.slowest
            .filter((s) => s.path.includes('create') || s.path.includes('submit') || s.path.includes('approve'))
            .reduce((s, x) => s + x.count, 0),
        },
      ],
    }
  }

  /** 菜单徽标数量 */
  async menuBadges(me: AuthUser) {
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 86400000)
    const in30 = new Date(now.getTime() + 30 * 86400000)
    const [approvals, pendingSign, expiring7, expiring30, overduePay, overdueLead, unread] =
      await Promise.all([
        this.db.approvalInstance.count({
          where: {
            tenantId: me.tenantId,
            status: 'PENDING',
            steps: { some: { approverId: me.id, action: null } },
          },
        }),
        this.db.contract.count({
          where: { tenantId: me.tenantId, deletedAt: null, status: 'DRAFT' },
        }),
        this.db.contract.count({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            status: 'EFFECTIVE',
            expireDate: { lte: in7 },
          },
        }),
        this.db.contract.count({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            status: 'EFFECTIVE',
            expireDate: { lte: in30 },
          },
        }),
        this.db.paymentPlan.count({
          where: { tenantId: me.tenantId, status: { in: ['OVERDUE', 'PENDING'] }, dueDate: { lt: now } },
        }),
        this.db.lead.count({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            status: { in: ['NEW', 'ACCEPTED', 'CULTIVATING'] },
            nextFollowAt: { lt: now },
          },
        }),
        this.db.notification.count({
          where: { tenantId: me.tenantId, userId: me.id, isRead: false },
        }),
      ])
    return {
      approvals,
      pendingSign,
      expiring7,
      expiring30,
      overduePay,
      overdueLead,
      unread,
      // 汇总：合同相关（待签 + 到期）
      contracts: pendingSign + expiring7,
    }
  }

  /** 合同到期分层：7 天紧急 / 30 天预警 / 90 天关注 */
  async contractExpiryLayers(me: AuthUser) {
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 86400000)
    const in30 = new Date(now.getTime() + 30 * 86400000)
    const in90 = new Date(now.getTime() + 90 * 86400000)
    const base = {
      tenantId: me.tenantId,
      deletedAt: null,
      status: 'EFFECTIVE',
      expireDate: { not: null },
    }
    const [urgent, warn, watch, overdue] = await Promise.all([
      this.db.contract.findMany({
        where: { ...base, expireDate: { gte: now, lte: in7 } },
        orderBy: { expireDate: 'asc' },
        take: 20,
        select: {
          id: true,
          contractNo: true,
          title: true,
          expireDate: true,
          total: true,
          account: { select: { id: true, name: true } },
        },
      }),
      this.db.contract.findMany({
        where: { ...base, expireDate: { gt: in7, lte: in30 } },
        orderBy: { expireDate: 'asc' },
        take: 20,
        select: {
          id: true,
          contractNo: true,
          title: true,
          expireDate: true,
          total: true,
          account: { select: { id: true, name: true } },
        },
      }),
      this.db.contract.findMany({
        where: { ...base, expireDate: { gt: in30, lte: in90 } },
        orderBy: { expireDate: 'asc' },
        take: 20,
        select: {
          id: true,
          contractNo: true,
          title: true,
          expireDate: true,
          total: true,
          account: { select: { id: true, name: true } },
        },
      }),
      this.db.contract.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: 'EFFECTIVE',
          expireDate: { lt: now },
        },
        orderBy: { expireDate: 'asc' },
        take: 20,
        select: {
          id: true,
          contractNo: true,
          title: true,
          expireDate: true,
          total: true,
          account: { select: { id: true, name: true } },
        },
      }),
    ])
    return {
      urgent,
      warn,
      watch,
      overdue,
      counts: {
        urgent: urgent.length,
        warn: warn.length,
        watch: watch.length,
        overdue: overdue.length,
      },
    }
  }

  /** 客户成功自动化看板：旅程推进、分群触达、关怀任务、订阅状态 */
  async successAutomation(me: AuthUser) {
    const from = new Date(Date.now() - 7 * 86400000)
    const [journeyActs, outreachActs, careActs, segmentsRow, briefRow] = await Promise.all([
      this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          createdAt: { gte: from },
          OR: [{ subject: { contains: '旅程' } }, { subject: { contains: 'journey', mode: 'insensitive' as const } }],
        },
      }),
      this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          createdAt: { gte: from },
          OR: [
            { subject: { contains: '分群' } },
            { subject: { contains: '触达' } },
            { subject: { contains: 'outreach', mode: 'insensitive' as const } },
          ],
        },
      }),
      this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          createdAt: { gte: from },
          OR: [{ subject: { contains: '关怀' } }, { subject: { contains: 'care', mode: 'insensitive' as const } }],
        },
      }),
      this.db.customerSegment.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: { id: true, name: true, autoOutreach: true },
      }),
      this.db.setting.findFirst({
        where: { tenantId: me.tenantId, key: 'brief.subscribe', scope: 'TENANT' },
      }),
    ])

    const segs = segmentsRow
    const autoSegs = segs.filter((s) => s.autoOutreach)

    const brief = (briefRow?.value ?? {}) as {
      enabled?: boolean
      frequency?: string
      channels?: string[]
    }

    // 近 7 天自动化活动趋势
    const days: { date: string; count: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      const start = new Date(d)
      start.setHours(0, 0, 0, 0)
      const end = new Date(d)
      end.setHours(23, 59, 59, 999)
      const n = await this.db.activity.count({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          createdAt: { gte: start, lte: end },
          OR: [
            { subject: { contains: '旅程' } },
            { subject: { contains: '分群' } },
            { subject: { contains: '触达' } },
            { subject: { contains: '关怀' } },
            { subject: { contains: '自动' } },
            { subject: { contains: 'journey', mode: 'insensitive' as const } },
            { subject: { contains: 'outreach', mode: 'insensitive' as const } },
            { subject: { contains: 'care', mode: 'insensitive' as const } },
            { subject: { contains: 'automation', mode: 'insensitive' as const } },
          ],
        },
      })
      days.push({ date: start.toISOString().slice(0, 10), count: n })
    }

    return {
      last7d: {
        journeyTasks: journeyActs,
        outreachTasks: outreachActs,
        careTasks: careActs,
        total: journeyActs + outreachActs + careActs,
      },
      segments: {
        total: segs.length,
        auto: autoSegs.length,
        autoNames: autoSegs.map((s) => s.name),
      },
      briefSubscribe: {
        enabled: !!brief.enabled,
        frequency: brief.frequency || 'weekly',
        channels: brief.channels || ['notify'],
      },
      trend: days,
    }
  }

  /** 销售简报订阅设置 */
  async getBriefSubscribe(me: AuthUser) {
    const row = await this.db.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'brief.subscribe', scope: 'TENANT' },
    })
    return (
      (row?.value as Record<string, unknown>) ?? {
        enabled: true,
        frequency: 'weekly',
        channels: ['notify'],
        dayOfWeek: 1,
        time: '09:00',
      }
    )
  }

  async saveBriefSubscribe(me: AuthUser, body: Record<string, unknown>) {
    const value = {
      enabled: body.enabled !== false,
      frequency: String(body.frequency || 'weekly'),
      channels: Array.isArray(body.channels) ? body.channels : ['notify'],
      dayOfWeek: Number(body.dayOfWeek ?? 1),
      time: String(body.time || '09:00'),
      updatedAt: new Date().toISOString(),
      updatedBy: me.name,
    }
    const row = await this.db.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'brief.subscribe', scope: 'TENANT' },
    })
    if (row) {
      await this.db.setting.update({
        where: { id: row.id },
        data: { value: value as never },
      })
    } else {
      await this.db.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'brief.subscribe',
          scope: 'TENANT',
          value: value as never,
        },
      })
    }
    return value
  }

  /** 报价审批流图：定义 + 最近实例步骤 */
  async approvalFlow(me: AuthUser, quoteId?: string) {
    const def = await this.db.approvalDefinition.findFirst({
      where: { tenantId: me.tenantId, code: 'QUOTE_DISCOUNT', isActive: true },
    })
    const rules = (def?.rules ?? {}) as {
      steps?: { type: string; levels: number }[]
      when?: unknown
    }
    const steps = (rules.steps ?? []).map((s, i) => ({
      index: i,
      label: s.type === 'MANAGER' ? tr(`主管审批 L${s.levels}`, `Manager approval L${s.levels}`) : s.type,
      type: s.type,
      levels: s.levels,
    }))

    let instance: Record<string, unknown> | null = null
    if (quoteId) {
      const inst = await this.db.approvalInstance.findFirst({
        where: { tenantId: me.tenantId, entityType: 'QUOTE', entityId: quoteId },
        orderBy: { startedAt: 'desc' },
        include: { steps: { orderBy: { stepIndex: 'asc' } } },
      })
      if (inst) {
        instance = {
          id: inst.id,
          status: inst.status,
          currentStep: inst.currentStep,
          steps: inst.steps,
          snapshot: inst.snapshot,
        }
      }
    }

    return {
      definition: def
        ? {
            id: def.id,
            name: def.name,
            code: def.code,
            isActive: def.isActive,
            rules: def.rules,
          }
        : null,
      steps: steps.length ? steps : [
        { index: 0, label: tr('直属主管', 'Direct manager'), type: 'MANAGER', levels: 1 },
        { index: 1, label: tr('上级主管', 'Second-level manager'), type: 'MANAGER', levels: 2 },
      ],
      instance,
    }
  }
  /** 阶段转化率：相邻阶段商机数比 + 金额比 */
  async stageConversion(me: AuthUser, days = 90) {
    const from = new Date(Date.now() - days * 86400000)
    const funnel = await this.funnel(me)
    const conversions: Array<{
      from: string
      to: string
      fromCount: number
      toCount: number
      rate: string
      fromAmount: string
      toAmount: string
    }> = []
    for (let i = 1; i < funnel.length; i++) {
      const a = funnel[i - 1]
      const b = funnel[i]
      conversions.push({
        from: a.name,
        to: b.name,
        fromCount: a.count,
        toCount: b.count,
        rate: a.count ? ((b.count / a.count) * 100).toFixed(1) : '0',
        fromAmount: a.amount,
        toAmount: b.amount,
      })
    }
    // 近 N 天阶段变更次数（更真实的转化）
    const hist = await this.db.opportunityStageHistory.groupBy({
      by: ['toStageId'],
      where: { tenantId: me.tenantId, changedAt: { gte: from } },
      _count: { _all: true },
    })
    const stageMoveCount = new Map(hist.map((h) => [h.toStageId, h._count._all]))
    return {
      days,
      conversions,
      stageMoves: funnel.map((f) => ({
        stage: f.name,
        moves: stageMoveCount.get(f.stageId) ?? 0,
      })),
    }
  }

  /** 区域业绩分析 */
  async regionPerformance(me: AuthUser) {
    const accounts = await this.db.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        region: true,
        industry: true,
        contracts: {
          where: { status: { in: ['EFFECTIVE', 'FINISHED'] } },
          select: { total: true, receivedAmount: true },
        },
        opportunities: {
          select: { amount: true, stage: { select: { code: true } } },
        },
      },
      take: 300,
    })
    const map = new Map<
      string,
      {
        region: string
        accounts: number
        contractAmount: number
        received: number
        openOppAmount: number
      }
    >()
    for (const a of accounts) {
      const key = a.region || tr('未分区', 'No region')
      const row =
        map.get(key) ??
        { region: key, accounts: 0, contractAmount: 0, received: 0, openOppAmount: 0 }
      row.accounts++
      for (const c of a.contracts) {
        row.contractAmount += Number(c.total)
        row.received += Number(c.receivedAmount)
      }
      for (const o of a.opportunities) {
        if (o.stage.code !== 'WON' && o.stage.code !== 'LOST') {
          row.openOppAmount += Number(o.amount)
        }
      }
      map.set(key, row)
    }
    return [...map.values()]
      .map((r) => ({
        ...r,
        contractAmount: r.contractAmount.toFixed(2),
        received: r.received.toFixed(2),
        openOppAmount: r.openOppAmount.toFixed(2),
      }))
      .sort((a, b) => Number(b.contractAmount) - Number(a.contractAmount))
  }

}
