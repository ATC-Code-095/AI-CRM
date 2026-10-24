import { Injectable } from '@nestjs/common'
import { AiPort } from './ai.port'
import { PrismaService } from '../../common/prisma/prisma.service'
import { sysLabel, tr } from '../../common/locale'

/** 确定性 Mock，便于单测（settings.ai_enabled=false 时也可用） */
@Injectable()
export class MockAiAdapter implements AiPort {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(input: { entityType: string; entityId: string; locale: string }) {
    let content = tr(`【${input.entityType}】${input.entityId} 摘要：`, `[${input.entityType}] ${input.entityId} summary:`)
    if (input.entityType === 'OPPORTUNITY') {
      const o = await this.prisma.opportunity.findUnique({
        where: { id: input.entityId },
        include: { stage: true },
      })
      content = o
        ? tr(
            `商机「${o.name}」处于${o.stage.name}，金额 ${o.amount}，赢率 ${o.winRate}%，下一步：${o.nextStep ?? '待补充'}。`,
            `Opportunity "${o.name}" is in ${sysLabel(o.stage.name)}, amount ${o.amount}, win rate ${o.winRate}%, next step: ${o.nextStep ?? 'to be added'}.`,
          )
        : content
    } else if (input.entityType === 'LEAD') {
      const l = await this.prisma.lead.findUnique({ where: { id: input.entityId } })
      content = l
        ? tr(`线索「${l.name}」来源 ${l.source}，状态 ${l.status}，评分 ${l.score}。`, `Lead "${l.name}": source ${l.source}, status ${l.status}, score ${l.score}.`)
        : content
    } else {
      const a = await this.prisma.account.findUnique({ where: { id: input.entityId } })
      content = a ? tr(`客户「${a.name}」等级 ${a.level}，阶段 ${a.stage}。`, `Account "${a.name}": level ${a.level}, stage ${a.stage}.`) : content
    }
    await this.save(input, 'SUMMARY', { content })
    return { content }
  }

  async suggestNext(input: { opportunityId: string; locale: string }) {
    const o = await this.prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      include: { stage: true },
    })
    const suggestions = o?.stage.code === 'PROPOSAL'
      ? [tr('跟进报价反馈', 'Follow up on quote feedback'), tr('确认预算与决策人', 'Confirm budget and decision-maker'), tr('预约方案评审会', 'Schedule a proposal review')]
      : [tr('补充下一步动作', 'Add the next step'), tr('确认关键人日程', 'Confirm key contacts\' availability'), tr('完善需求纪要', 'Complete the requirements notes')]
    await this.save(
      { entityType: 'OPPORTUNITY', entityId: input.opportunityId, locale: input.locale },
      'NEXT',
      { suggestions },
    )
    return { suggestions }
  }

  async risk(input: { opportunityId: string; locale: string }) {
    const o = await this.prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      include: { stage: true },
    })
    const reasons: string[] = []
    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'
    if (o && Number(o.winRate) < 30) {
      level = 'MEDIUM'
      reasons.push(tr('赢率偏低', 'Low win rate'))
    }
    if (o && !o.nextStep) {
      level = 'HIGH'
      reasons.push(tr('缺少下一步', 'No next step'))
    }
    if (o?.stage.code === 'NEGOTIATION' && Number(o.amount) > 100000) {
      level = 'MEDIUM'
      reasons.push(tr('大额谈判期，建议审批折扣/条款', 'Large deal in negotiation: get discounts and terms approved'))
    }
    if (!reasons.length) reasons.push(tr('暂无明显风险信号', 'No obvious risk signals'))
    await this.save(
      { entityType: 'OPPORTUNITY', entityId: input.opportunityId, locale: input.locale },
      'RISK',
      { level, reasons },
    )
    return { level, reasons }
  }

  private async save(
    input: { entityType: string; entityId: string; locale: string },
    type: string,
    content: unknown,
  ) {
    await this.prisma.aiSuggestion.create({
      data: {
        tenantId: (
          await this.prisma.opportunity.findUnique({
            where: { id: input.entityId },
            select: { tenantId: true },
          })
        )?.tenantId ??
          (
            await this.prisma.lead.findUnique({
              where: { id: input.entityId },
              select: { tenantId: true },
            })
          )?.tenantId ??
          (
            await this.prisma.account.findUnique({
              where: { id: input.entityId },
              select: { tenantId: true },
            })
          )?.tenantId ??
          'unknown',
        entityType: input.entityType,
        entityId: input.entityId,
        type,
        content: content as never,
        provider: 'mock',
        model: 'mock-1',
      },
    })
  }
}
