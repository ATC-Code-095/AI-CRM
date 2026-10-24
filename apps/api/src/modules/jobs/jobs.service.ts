import { Prisma } from '@prisma/client'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { createLeadAssigner } from '../lead/lead-assign'
import { Bilingual, UiLocale, normalizeLocale, pick, tr } from '../../common/locale'

/** 销售流程自动化：回款逾期 / 线索自动分配 / 续费商机 / 跟进超时 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** 定时任务没有请求语言：自动写入的记录按负责人的界面语言生成 */
  private async localeOf(userId: string | null | undefined): Promise<UiLocale> {
    if (!userId) return 'zh-CN'
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { locale: true } })
    return normalizeLocale(u?.locale)
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markPlanOverdue() {
    const res = await this.runOverdueScan()
    this.logger.log(`payment plan overdue scan: ${res.updated}`)
    return res
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async dailyAutomation() {
    const assign = await this.autoAssignLeads()
    const renewals = await this.createRenewalOpps()
    const nudge = await this.nudgeStaleFollowups()
    const journey = await this.journeyAutomation()
    const segments = await this.segmentScheduler()
    const health = await this.healthReport()
    this.logger.log(
      `daily automation assign=${assign.assigned} renewals=${renewals.created} nudge=${nudge.nudged} journey=${journey.created} segments=${segments.created} health=${health.status}`,
    )
    return { assign, renewals, nudge, journey, segments, health }
  }

  /** 也可手动调用：POST /jobs/payment-plan-overdue */
  async runOverdueScan() {
    const now = new Date()
    const rows = await this.prisma.paymentPlan.findMany({
      where: {
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      take: 500,
    })
    let updated = 0
    for (const p of rows) {
      await this.prisma.paymentPlan.update({
        where: { id: p.id },
        data: { status: 'OVERDUE' },
      })
      updated++
    }
    return { scanned: rows.length, updated }
  }

  /** 线索自动分配：滞留的新线索按 lead.assign_rule 重新分给在职销售（规则见 lead/lead-assign.ts） */
  async autoAssignLeads(tenantId?: string) {
    const tenants = tenantId
      ? [{ id: tenantId }]
      : await this.prisma.tenant.findMany({ select: { id: true } })
    let assigned = 0
    for (const t of tenants) {
      const assigner = await createLeadAssigner(this.prisma, t.id)
      if (assigner.rule === 'MANUAL' || !assigner.pool.length) continue
      // 公海线索：NEW 且 nextFollowAt 逾期 7 天 或 创建超 3 天仍 NEW
      const cutoff = new Date(Date.now() - 7 * 86400000)
      const createdCutoff = new Date(Date.now() - 3 * 86400000)
      const leads = await this.prisma.lead.findMany({
        where: {
          tenantId: t.id,
          deletedAt: null,
          status: 'NEW',
          OR: [
            { nextFollowAt: { lt: cutoff } },
            { nextFollowAt: null, createdAt: { lt: createdCutoff } },
          ],
        },
        take: 50,
        orderBy: { createdAt: 'asc' },
      })
      for (const lead of leads) {
        const ownerId = await assigner.next()
        if (!ownerId) break
        const owner = { id: ownerId }
        await this.prisma.lead.update({
          where: { id: lead.id },
          data: { ownerId: owner.id, status: 'ACCEPTED', updatedById: owner.id },
        })
        await this.push.notify(
          t.id,
          owner.id,
          'LEAD_AUTO_ASSIGN',
          { zh: '线索自动分配', en: 'Lead auto-assigned' },
          { zh: `线索「${lead.name}」已自动分配给你，请及时跟进`, en: `Lead "${lead.name}" has been assigned to you. Please follow up.` },
          'LEAD',
          lead.id,
        )
        assigned++
      }
      await assigner.save()
    }
    return { assigned }
  }

  /** 合同将到期（30天）→ 自动生成续费商机（幂等：同客户同名未关闭商机不重复建） */
  async createRenewalOpps(tenantId?: string) {
    const now = new Date()
    const until = new Date(now.getTime() + 30 * 86400000)
    const contracts = await this.prisma.contract.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        status: 'EFFECTIVE',
        expireDate: { gte: now, lte: until },
      },
      include: { account: { select: { id: true, name: true } } },
      take: 200,
    })
    let created = 0
    for (const c of contracts) {
      const loc = await this.localeOf(c.ownerId)
      // 续费商机按名称去重：中英文两种名称都视为已存在
      const names = [`续费-${c.contractNo}`, `Renewal-${c.contractNo}`]
      const name = tr(names[0], names[1], loc)
      const exists = await this.prisma.opportunity.findFirst({
        where: {
          tenantId: c.tenantId,
          deletedAt: null,
          name: { in: names },
          stage: { isClosing: false },
        },
      })
      if (exists) continue
      const pipeline = await this.prisma.pipeline.findFirst({
        where: { tenantId: c.tenantId, isDefault: true },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
      })
      if (!pipeline?.stages.length) continue
      const stage = pipeline.stages[0]
      await this.prisma.opportunity.create({
        data: {
          tenantId: c.tenantId,
          name,
          accountId: c.accountId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          amount: c.total,
          currency: c.currency,
          winRate: stage.winRate,
          expectedCloseDate: c.expireDate ?? now,
          ownerId: c.ownerId,
          nextStep: tr('合同到期续费沟通', 'Discuss renewal before contract expiry', loc),
          source: 'PARTNER',
          createdById: c.ownerId,
          updatedById: c.ownerId,
        },
      })
      await this.push.notify(
        c.tenantId,
        c.ownerId,
        'RENEWAL_OPP',
        { zh: '续费商机已生成', en: 'Renewal opportunity created' },
        {
          zh: `合同 ${c.contractNo} 将于 ${(c.expireDate ?? now).toISOString().slice(0, 10)} 到期，已自动创建续费商机`,
          en: `Contract ${c.contractNo} expires on ${(c.expireDate ?? now).toISOString().slice(0, 10)}; a renewal opportunity was created`,
        },
        'CONTRACT',
        c.id,
      )
      created++
    }
    return { scanned: contracts.length, created }
  }

  /** 跟进超时：线索超过 7 天无活动 → 提醒负责人 */
  async nudgeStaleFollowups(tenantId?: string) {
    const cutoff = new Date(Date.now() - 7 * 86400000)
    const leads = await this.prisma.lead.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        status: { in: ['NEW', 'ACCEPTED', 'CONTACTED', 'QUALIFIED', 'CULTIVATING'] },
      },
      select: {
        id: true,
        name: true,
        tenantId: true,
        ownerId: true,
        updatedAt: true,
      },
      take: 200,
    })
    let nudged = 0
    for (const l of leads) {
      const lastAct = await this.prisma.activity.findFirst({
        where: { tenantId: l.tenantId, entityType: 'LEAD', entityId: l.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })
      const last = lastAct?.createdAt ?? l.updatedAt
      if (last.getTime() > cutoff.getTime()) continue
      await this.push.notify(
        l.tenantId,
        l.ownerId,
        'FOLLOWUP_TIMEOUT',
        { zh: '线索跟进超时', en: 'Lead follow-up overdue' },
        { zh: `线索「${l.name}」已超过 7 天未跟进，请处理`, en: `Lead "${l.name}" has had no follow-up for over 7 days` },
        'LEAD',
        l.id,
      )
      nudged++
    }
    return { nudged }
  }

  /** 客户旅程自动化：按里程碑缺口自动生成下一跳行动 */
  async journeyAutomation(tenantId?: string) {
    const where = tenantId ? { tenantId, deletedAt: null } : { deletedAt: null }
    const accounts = await this.prisma.account.findMany({
      where,
      select: {
        id: true,
        name: true,
        ownerId: true,
        tenantId: true,
        lastActivityAt: true,
      },
      take: 80,
    })
    let created = 0
    for (const a of accounts) {
      const [acts, opps, contracts, pays] = await Promise.all([
        this.prisma.activity.count({
          where: {
            entityType: 'ACCOUNT',
            entityId: a.id,
            deletedAt: null,
          },
        }),
        this.prisma.opportunity.count({
          where: { accountId: a.id, deletedAt: null },
        }),
        this.prisma.contract.count({
          where: {
            accountId: a.id,
            deletedAt: null,
            status: { in: ['EFFECTIVE', 'FINISHED'] },
          },
        }),
        this.prisma.payment.count({
          where: {
            contract: { accountId: a.id },
            deletedAt: null,
            status: { in: ['CONFIRMED', 'RECONCILED'] },
          },
        }),
      ])

      let title: Bilingual | null = null
      let body: Bilingual = { zh: '', en: '' }
      if (acts === 0) {
        const loc = await this.localeOf(a.ownerId)
        title = { zh: '旅程自动化：待首次接触', en: 'Journey automation: first contact needed' }
        body = {
          zh: `客户「${a.name}」尚无跟进记录，建议 3 天内完成首次接触`,
          en: `Account "${a.name}" has no activity yet. Make first contact within 3 days.`,
        }
        await this.prisma.activity.create({
          data: {
            tenantId: a.tenantId,
            type: 'CALL',
            subject: tr(`旅程自动化：首次接触 ${a.name}`, `Journey automation: first contact ${a.name}`, loc),
            status: 'PLANNED',
            content: tr('客户旅程里程碑：首次接触', 'Customer journey milestone: first contact', loc),
            entityType: 'ACCOUNT',
            entityId: a.id,
            ownerId: a.ownerId,
            dueAt: new Date(Date.now() + 3 * 86400000),
            source: 'AI',
            createdById: a.ownerId,
            updatedById: a.ownerId,
          },
        })
      } else if (opps === 0) {
        title = { zh: '旅程自动化：待立项', en: 'Journey automation: qualify an opportunity' }
        body = {
          zh: `客户「${a.name}」已有跟进但无商机，建议评估立项`,
          en: `Account "${a.name}" has activity but no opportunity. Consider qualifying one.`,
        }
      } else if (contracts === 0) {
        title = { zh: '旅程自动化：促成交', en: 'Journey automation: drive to close' }
        body = {
          zh: `客户「${a.name}」有商机未签约，建议推进报价/合同`,
          en: `Account "${a.name}" has open opportunities but no contract. Push the quote or contract.`,
        }
      } else if (pays === 0) {
        title = { zh: '旅程自动化：催回款', en: 'Journey automation: collect payment' }
        body = {
          zh: `客户「${a.name}」合同未见回款，请跟进收款计划`,
          en: `Account "${a.name}" has contracts but no payments. Follow up on the payment plan.`,
        }
      }

      if (title) {
        await this.push.notify(a.tenantId, a.ownerId, 'JOURNEY_AUTO', title, body, 'ACCOUNT', a.id)
        created++
      }
    }
    return { scanned: accounts.length, created }
  }

  /** 分群自动化调度：对开启 autoOutreach 的分群执行触达 */
  async segmentScheduler(tenantId?: string) {
    const tenants = tenantId
      ? [{ id: tenantId }]
      : await this.prisma.tenant.findMany({ select: { id: true } })
    let ran = 0
    let created = 0
    for (const t of tenants) {
      const segs = await this.prisma.customerSegment.findMany({
        where: { tenantId: t.id, deletedAt: null, autoOutreach: true },
      })
      const autoSegs = segs.filter((s) => s.autoOutreach)
      for (const seg of autoSegs) {
        const where: Record<string, unknown> = {
          tenantId: t.id,
          deletedAt: null,
        }
        if (seg.stage) where.stage = seg.stage
        if (seg.industry) where.industry = seg.industry
        if (seg.level) where.level = seg.level
        let accounts = await this.prisma.account.findMany({
          where,
          select: { id: true, name: true, ownerId: true, customValues: true },
          take: 30,
        })
        if (seg.tag) {
          accounts = accounts.filter((a) => {
            const tags = ((a.customValues as { tags?: string[] })?.tags ?? []) as string[]
            return tags.includes(String(seg.tag))
          })
        }
        const due = new Date(Date.now() + 3 * 86400000)
        for (const a of accounts) {
          const loc = await this.localeOf(a.ownerId)
          await this.prisma.activity.create({
            data: {
              tenantId: t.id,
              type: 'CALL',
              subject: tr(`分群自动触达：${a.name}`, `Segment outreach: ${a.name}`, loc),
              status: 'PLANNED',
              content: tr(`【自动】分群「${seg.name}」例行关怀`, `[Auto] Routine care for segment "${seg.name}"`, loc),
              entityType: 'ACCOUNT',
              entityId: a.id,
              ownerId: a.ownerId,
              dueAt: due,
              source: 'AI',
              createdById: a.ownerId,
              updatedById: a.ownerId,
            },
          })
          await this.push.notify(
            t.id,
            a.ownerId,
            'SEGMENT_AUTO',
            { zh: `分群自动触达 · ${seg.name}`, en: `Segment outreach · ${seg.name}` },
            { zh: `请在 3 天内联系「${a.name}」`, en: `Please contact "${a.name}" within 3 days` },
            'ACCOUNT',
            a.id,
          )
          created++
        }
        ran++
      }
    }
    return { segments: ran, created }
  }

  /** 系统健康巡检报告 */
  async healthReport(tenantId?: string) {
    const now = new Date()
    const from = new Date(now.getTime() - 24 * 3600_000)

    // DB
    let db = 'ok'
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      db = 'down'
    }

    // 业务量
    const [leads, opps, contracts, payments, activities, notifications] = await Promise.all([
      this.prisma.lead.count({
        where: { ...(tenantId ? { tenantId } : {}), createdAt: { gte: from } },
      }),
      this.prisma.opportunity.count({
        where: { ...(tenantId ? { tenantId } : {}), createdAt: { gte: from } },
      }),
      this.prisma.contract.count({
        where: { ...(tenantId ? { tenantId } : {}), createdAt: { gte: from } },
      }),
      this.prisma.payment.count({
        where: { ...(tenantId ? { tenantId } : {}), createdAt: { gte: from } },
      }),
      this.prisma.activity.count({
        where: { ...(tenantId ? { tenantId } : {}), createdAt: { gte: from } },
      }),
      this.prisma.notification.count({
        where: { ...(tenantId ? { tenantId } : {}) },
      }),
    ])

    // 待办积压
    const pendingApprovals = await this.prisma.approvalInstance.count({
      where: { ...(tenantId ? { tenantId } : {}), status: 'PENDING' },
    })
    const overduePlans = await this.prisma.paymentPlan.count({
      where: {
        ...(tenantId ? { tenantId } : {}),
        dueDate: { lt: now },
        status: { in: ['PENDING', 'PARTIAL'] },
      },
    })

    // 备份文件（如可读）
    let backup: { last: string | null; status: string } = { last: null, status: 'unknown' }
    try {
      const fs = await import('fs')
      const dir = process.env.BACKUP_DIR || './backups'
      if (fs.existsSync(dir)) {
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.dump') || f.endsWith('.sql') || f.endsWith('.gz'))
          .map((f) => ({ f, mtime: fs.statSync(`${dir}/${f}`).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
        if (files[0]) {
          backup = {
            last: new Date(files[0].mtime).toISOString(),
            status:
              Date.now() - files[0].mtime < 26 * 3600_000 ? 'fresh' : 'stale',
          }
        }
      }
    } catch {
      // ignore
    }

    const report = {
      generatedAt: now.toISOString(),
      db,
      metrics24h: {
        leads,
        opportunities: opps,
        contracts,
        payments,
        activities,
        notifications,
      },
      backlog: {
        pendingApprovals,
        overduePaymentPlans: overduePlans,
      },
      backup,
      status:
        db === 'ok' && pendingApprovals < 50 && overduePlans < 50 ? 'HEALTHY' : 'ATTENTION',
    }

    // 存档最近 7 份；定时任务不带租户时记为全系统报告
    const tid = tenantId ?? null
    await this.prisma.systemHealthReport.create({
      data: { tenantId: tid, status: report.status, report: report as Prisma.InputJsonValue },
    })
    const stale = await this.prisma.systemHealthReport.findMany({
      where: { tenantId: tid },
      orderBy: { generatedAt: 'desc' },
      skip: 7,
      select: { id: true },
    })
    if (stale.length) {
      await this.prisma.systemHealthReport.deleteMany({ where: { id: { in: stale.map((x) => x.id) } } })
    }
    return report
  }

  /** 销售漏斗自动推进：有报价且停留过久 → 提示/推进到提案阶段 */
  async funnelAutoAdvance(tenantId?: string) {
    const cutoff = new Date(Date.now() - 7 * 86400000)
    const where = {
      ...(tenantId ? { tenantId } : {}),
      deletedAt: null,
      updatedAt: { lt: cutoff },
      stage: { isClosing: false },
    }
    const opps = await this.prisma.opportunity.findMany({
      where,
      select: {
        id: true,
        name: true,
        ownerId: true,
        tenantId: true,
        stageId: true,
        updatedAt: true,
        stage: { select: { id: true, code: true, name: true, sortOrder: true, pipelineId: true } },
        pipeline: { select: { id: true, stages: { orderBy: { sortOrder: 'asc' } } } },
      },
      take: 50,
    })

    let advanced = 0
    let nudged = 0
    for (const o of opps) {
      const quotes = await this.prisma.quote.count({
        where: { opportunityId: o.id, deletedAt: null },
      })
      const stages = o.pipeline?.stages ?? []
      const idx = stages.findIndex((s) => s.id === o.stageId)
      const next = idx >= 0 ? stages[idx + 1] : undefined

      // 有报价且仍在早期阶段 → 自动推进到下一阶段
      if (quotes > 0 && next && idx < stages.length - 2) {
        await this.prisma.$transaction(async (tx) => {
          await tx.opportunity.update({
            where: { id: o.id },
            data: { stageId: next.id, winRate: next.winRate, updatedById: o.ownerId },
          })
          await tx.opportunityStageHistory.create({
            data: {
              tenantId: o.tenantId,
              opportunityId: o.id,
              fromStageId: o.stageId,
              toStageId: next.id,
              toWinRate: next.winRate,
              changedById: o.ownerId,
              note: tr('漏斗自动推进（已有报价）', 'Auto-advanced (quote exists)', await this.localeOf(o.ownerId)),
            },
          })
        })
        await this.push.notify(
          o.tenantId,
          o.ownerId,
          'FUNNEL_AUTO',
          { zh: '漏斗自动推进', en: 'Opportunity auto-advanced' },
          { zh: `商机「${o.name}」已自动推进到「${next.name}」`, en: `Opportunity "${o.name}" advanced to "${next.name}"` },
          'OPPORTUNITY',
          o.id,
        )
        advanced++
      } else {
        await this.push.notify(
          o.tenantId,
          o.ownerId,
          'FUNNEL_STALL',
          { zh: '漏斗停滞提醒', en: 'Stalled opportunity' },
          {
            zh: `商机「${o.name}」在「${o.stage.name}」停留超过 7 天，请更新进展`,
            en: `Opportunity "${o.name}" has been in "${o.stage.name}" for over 7 days. Please update it.`,
          },
          'OPPORTUNITY',
          o.id,
        )
        nudged++
      }
    }
    return { scanned: opps.length, advanced, nudged }
  }

  /** 公海自动回收：线索 7 天未跟进 / 客户 30 天无活动 → 状态回公海 */
  async poolAutoRecycle(tenantId?: string) {
    const now = new Date()
    const leadCut = new Date(now.getTime() - 7 * 86400000)
    const accCut = new Date(now.getTime() - 30 * 86400000)
    const leads = await this.prisma.lead.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        status: { in: ['NEW', 'ACCEPTED', 'CULTIVATING'] },
        OR: [{ nextFollowAt: { lt: leadCut } }, { nextFollowAt: null, createdAt: { lt: leadCut } }],
      },
      take: 200,
      select: { id: true, tenantId: true, ownerId: true, name: true, remark: true },
    })
    let leadRecycled = 0
    for (const l of leads) {
      await this.prisma.lead.update({
        where: { id: l.id },
        data: {
          status: 'NEW',
          nextFollowAt: null,
          remark: [l.remark, `${tr('公海自动回收', 'Auto-returned to pool', await this.localeOf(l.ownerId))} ${now.toISOString().slice(0, 10)}`]
            .filter(Boolean)
            .join(' | '),
        },
      })
      if (l.ownerId) {
        await this.push.notify(
          l.tenantId,
          l.ownerId,
          'POOL_RECYCLE',
          { zh: '线索已回收公海', en: 'Lead returned to pool' },
          { zh: `线索「${l.name}」超过 7 天未跟进，已自动回收到公海`, en: `Lead "${l.name}" had no follow-up for 7 days and was returned to the pool` },
          'LEAD',
          l.id,
        )
      }
      leadRecycled++
    }
    const accounts = await this.prisma.account.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        deletedAt: null,
        stage: { in: ['POTENTIAL', 'AT_RISK'] },
        lastActivityAt: { lt: accCut },
      },
      take: 200,
      select: { id: true, tenantId: true, ownerId: true, name: true, remark: true },
    })
    let accRecycled = 0
    for (const a of accounts) {
      await this.prisma.account.update({
        where: { id: a.id },
        data: {
          stage: 'POTENTIAL',
          remark: [a.remark, `${tr('公海自动回收', 'Auto-returned to pool', await this.localeOf(a.ownerId))} ${now.toISOString().slice(0, 10)}`]
            .filter(Boolean)
            .join(' | '),
        },
      })
      if (a.ownerId) {
        await this.push.notify(
          a.tenantId,
          a.ownerId,
          'POOL_RECYCLE',
          { zh: '客户已回收公海', en: 'Account returned to pool' },
          { zh: `客户「${a.name}」超过 30 天无活动，已自动回收到公海`, en: `Account "${a.name}" had no activity for 30 days and was returned to the pool` },
          'ACCOUNT',
          a.id,
        )
      }
      accRecycled++
    }
    return { leadRecycled, accRecycled, leadCandidates: leads.length, accCandidates: accounts.length }
  }

  /** 合同到期分层通知：7 天紧急 / 30 天预警 / 90 天关注 */
  async contractExpiryNotify(tenantId?: string) {
    const now = new Date()
    const in7 = new Date(now.getTime() + 7 * 86400000)
    const in30 = new Date(now.getTime() + 30 * 86400000)
    const in90 = new Date(now.getTime() + 90 * 86400000)
    const base = {
      ...(tenantId ? { tenantId } : {}),
      deletedAt: null,
      status: 'EFFECTIVE',
      expireDate: { not: null as unknown as undefined },
    }
    const [urgent, warn, watch] = await Promise.all([
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { gte: now, lte: in7 } },
        select: {
          id: true,
          tenantId: true,
          contractNo: true,
          title: true,
          expireDate: true,
          ownerId: true,
          account: { select: { name: true } },
        },
        take: 50,
      }),
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { gt: in7, lte: in30 } },
        select: {
          id: true,
          tenantId: true,
          contractNo: true,
          title: true,
          expireDate: true,
          ownerId: true,
          account: { select: { name: true } },
        },
        take: 50,
      }),
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { gt: in30, lte: in90 } },
        select: {
          id: true,
          tenantId: true,
          contractNo: true,
          title: true,
          expireDate: true,
          ownerId: true,
          account: { select: { name: true } },
        },
        take: 50,
      }),
    ])
    let notified = 0
    const send = async (
      rows: typeof urgent,
      level: 'URGENT' | 'WARN' | 'WATCH',
      title: Bilingual,
    ) => {
      for (const c of rows) {
        const days = Math.ceil(
          ((c.expireDate?.getTime() ?? now.getTime()) - now.getTime()) / 86400000,
        )
        await this.push.notify(
          c.tenantId,
          c.ownerId,
          `CONTRACT_EXPIRY_${level}`,
          title,
          {
            zh: `合同 ${c.contractNo}「${c.title}」（${c.account?.name ?? '-'}）${days} 天后到期，请安排续签`,
            en: `Contract ${c.contractNo} "${c.title}" (${c.account?.name ?? '-'}) expires in ${days} days. Please arrange renewal.`,
          },
          'CONTRACT',
          c.id,
        )
        notified++
      }
    }
    await send(urgent, 'URGENT', { zh: '合同 7 天内到期', en: 'Contract expires within 7 days' })
    await send(warn, 'WARN', { zh: '合同 30 天内到期', en: 'Contract expires within 30 days' })
    await send(watch, 'WATCH', { zh: '合同 90 天内到期', en: 'Contract expires within 90 days' })
    return {
      urgent: urgent.length,
      warn: warn.length,
      watch: watch.length,
      notified,
    }
  }

  /** 接口用量告警：错误率 / P95 超阈值时通知管理员 */
  async apiUsageAlert() {
    const { getPerfStats } = await import('../../common/middleware/request-log.middleware')
    const perf = getPerfStats()
    const errorRate = perf.total > 0 ? (perf.errorCount / perf.total) * 100 : 0
    const thresholds = { errorRate: 5, p95: 2000, total: 5000 }
    const alertsI18n: Bilingual[] = []
    if (errorRate >= thresholds.errorRate) {
      alertsI18n.push({
        zh: `错误率 ${errorRate.toFixed(1)}% ≥ ${thresholds.errorRate}%`,
        en: `Error rate ${errorRate.toFixed(1)}% ≥ ${thresholds.errorRate}%`,
      })
    }
    if (perf.p95 >= thresholds.p95) {
      const s = `P95 ${perf.p95}ms ≥ ${thresholds.p95}ms`
      alertsI18n.push({ zh: s, en: s })
    }
    if (perf.total >= thresholds.total) {
      alertsI18n.push({
        zh: `窗口请求量 ${perf.total} ≥ ${thresholds.total}`,
        en: `Requests in window ${perf.total} ≥ ${thresholds.total}`,
      })
    }
    const alerts = alertsI18n.map((a) => pick(a))
    if (!alerts.length) {
      return { ok: true, alerted: false, errorRate: errorRate.toFixed(1), p95: perf.p95 }
    }
    // 通知全部管理员
    const admins = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, tenantId: true },
      take: 20,
    })
    for (const u of admins) {
      await this.push.notify(
        u.tenantId,
        u.id,
        'API_USAGE_ALERT',
        { zh: '接口用量告警', en: 'API usage alert' },
        { zh: alertsI18n.map((a) => a.zh).join('；'), en: alertsI18n.map((a) => a.en).join('; ') },
        'SYSTEM',
        'api-usage',
      )
    }
    return {
      ok: true,
      alerted: true,
      alerts,
      errorRate: errorRate.toFixed(1),
      p95: perf.p95,
      total: perf.total,
      notified: admins.length,
    }
  }
}
