import { Injectable, Logger } from '@nestjs/common'
import { BizException, ErrorCodes } from '@ai-crm/shared'
import { PrismaService } from '../../common/prisma/prisma.service'
import { normalizeLocale, sysLabel, tr, UiLocale } from '../../common/locale'
import { AiConfigService } from './ai-config.service'
import { complete, LlmConfig } from './llm'
import { MockAiAdapter } from './mock-ai.adapter'

type Source = 'ai' | 'mock'

/**
 * AI 助手：租户在系统设置里配置了外部模型（Claude 或 OpenAI 兼容接口）就调用它，
 * 否则或调用失败时用内置模拟。发给模型的是该记录的实际业务数据（只在本租户内读取）。
 */
@Injectable()
export class AiGateway {
  private readonly logger = new Logger(AiGateway.name)

  constructor(
    private readonly mock: MockAiAdapter,
    private readonly prisma: PrismaService,
    private readonly config: AiConfigService,
  ) {}

  private system(locale: UiLocale) {
    return tr(
      '你是 B2B 销售团队的 CRM 助手。只根据给出的业务数据回答，数据里没有的信息不要编造。用简体中文，简洁、具体、可执行。',
      'You are a CRM assistant for a B2B sales team. Answer only from the business data provided and never invent facts that are not in it. Write in English; be concise, specific and actionable.',
      locale,
    )
  }

  /** 读取记录与近期跟进（限本租户），拼成给模型的上下文；记录不存在报 404 */
  private async context(tenantId: string, entityType: string, entityId: string, locale: UiLocale): Promise<string> {
    const L = (zh: string, en: string) => tr(zh, en, locale)
    const acts = await this.prisma.activity.findMany({
      where: { tenantId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { type: true, subject: true, content: true, status: true, createdAt: true },
    })
    const actLines = acts.map(
      (a) => `- ${a.createdAt.toISOString().slice(0, 10)} ${a.type}/${a.status} ${a.subject}${a.content ? `: ${a.content.slice(0, 160)}` : ''}`,
    )
    const lines: string[] = []
    if (entityType === 'OPPORTUNITY') {
      const o = await this.prisma.opportunity.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        include: { stage: true, account: { select: { name: true, industry: true, level: true } } },
      })
      if (!o) throw new BizException(ErrorCodes.NOT_FOUND, 'opportunity not found')
      lines.push(
        `${L('商机', 'Opportunity')}: ${o.name}`,
        `${L('客户', 'Account')}: ${o.account?.name ?? '-'} (${L('行业', 'industry')} ${o.account?.industry ?? '-'}, ${L('等级', 'level')} ${o.account?.level ?? '-'})`,
        `${L('阶段', 'Stage')}: ${sysLabel(o.stage.name, locale)} (${o.stage.code})`,
        `${L('金额', 'Amount')}: ${o.amount} ${o.currency}`,
        `${L('赢率', 'Win rate')}: ${o.winRate}%`,
        `${L('预计成交', 'Expected close')}: ${o.expectedCloseDate.toISOString().slice(0, 10)}`,
        `${L('下一步', 'Next step')}: ${o.nextStep ?? L('未填写', 'not set')}`,
        `${L('竞争对手', 'Competitor')}: ${o.competitor ?? L('未填写', 'not set')}`,
      )
    } else if (entityType === 'LEAD') {
      const l = await this.prisma.lead.findFirst({ where: { id: entityId, tenantId, deletedAt: null } })
      if (!l) throw new BizException(ErrorCodes.NOT_FOUND, 'lead not found')
      lines.push(
        `${L('线索', 'Lead')}: ${l.name}`,
        `${L('联系人', 'Contact')}: ${l.contactName ?? '-'}`,
        `${L('行业', 'Industry')}: ${l.industry ?? '-'}`,
        `${L('来源', 'Source')}: ${l.source}`,
        `${L('状态', 'Status')}: ${l.status}`,
        `${L('评分', 'Score')}: ${l.score}`,
        `${L('备注', 'Remark')}: ${l.remark ?? '-'}`,
      )
    } else {
      const a = await this.prisma.account.findFirst({
        where: { id: entityId, tenantId, deletedAt: null },
        include: {
          opportunities: {
            where: { deletedAt: null },
            take: 10,
            orderBy: { updatedAt: 'desc' },
            include: { stage: { select: { name: true } } },
          },
        },
      })
      if (!a) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
      lines.push(
        `${L('客户', 'Account')}: ${a.name}`,
        `${L('行业', 'Industry')}: ${a.industry ?? '-'}, ${L('等级', 'level')} ${a.level}, ${L('阶段', 'stage')} ${a.stage}`,
        `${L('商机', 'Opportunities')}:`,
        ...a.opportunities.map((o) => `- ${o.name} · ${sysLabel(o.stage.name, locale)} · ${o.amount} ${o.currency}`),
      )
    }
    lines.push(`${L('近期跟进', 'Recent activities')}:`, ...(actLines.length ? actLines : [L('（无）', '(none)')]))
    return lines.join('\n')
  }

  /** 调外部模型；未配置或失败返回 null，由调用方退回模拟 */
  private async ask(cfg: LlmConfig | null, locale: UiLocale, prompt: string): Promise<string | null> {
    if (!cfg) return null
    try {
      return await complete(cfg, this.system(locale), prompt)
    } catch (e) {
      this.logger.warn(`AI provider failed, using mock: ${(e as Error).message}`)
      return null
    }
  }

  async summarize(input: { tenantId: string; entityType: string; entityId: string; locale: string }) {
    const locale = normalizeLocale(input.locale)
    const ctx = await this.context(input.tenantId, input.entityType, input.entityId, locale)
    const text = await this.ask(
      await this.config.runtime(input.tenantId),
      locale,
      `${ctx}\n\n${tr('用 2–3 句话总结这条记录的现状和最需要关注的一点。', 'Summarize the current state of this record and the one thing that needs attention most, in 2–3 sentences.', locale)}`,
    )
    if (text) return { content: text, source: 'ai' as Source }
    return { ...(await this.mock.summarize(input)), source: 'mock' as Source }
  }

  async suggestNext(input: { tenantId: string; opportunityId: string; locale: string }) {
    const locale = normalizeLocale(input.locale)
    const ctx = await this.context(input.tenantId, 'OPPORTUNITY', input.opportunityId, locale)
    const text = await this.ask(
      await this.config.runtime(input.tenantId),
      locale,
      `${ctx}\n\n${tr(
        '给出 3 条推进这个商机的下一步动作。只输出一个 JSON 字符串数组，不要其他文字。',
        'Give 3 next actions to move this opportunity forward. Output only a JSON array of strings, nothing else.',
        locale,
      )}`,
    )
    const arr = text ? parseJson<unknown>(text, '[') : null
    if (Array.isArray(arr) && arr.length) return { suggestions: arr.map(String).slice(0, 5), source: 'ai' as Source }
    if (text) return { suggestions: text.split('\n').map((s) => s.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 3), source: 'ai' as Source }
    return { ...(await this.mock.suggestNext(input)), source: 'mock' as Source }
  }

  async risk(input: { tenantId: string; opportunityId: string; locale: string }) {
    const locale = normalizeLocale(input.locale)
    const ctx = await this.context(input.tenantId, 'OPPORTUNITY', input.opportunityId, locale)
    const text = await this.ask(
      await this.config.runtime(input.tenantId),
      locale,
      `${ctx}\n\n${tr(
        '评估这个商机的输单风险。只输出 JSON：{"level":"LOW|MEDIUM|HIGH","reasons":["…"]}，reasons 最多 3 条。',
        'Assess the risk of losing this opportunity. Output only JSON: {"level":"LOW|MEDIUM|HIGH","reasons":["…"]} with at most 3 reasons.',
        locale,
      )}`,
    )
    const obj = text ? parseJson<{ level?: string; reasons?: unknown[] }>(text, '{') : null
    if (obj && ['LOW', 'MEDIUM', 'HIGH'].includes(String(obj.level))) {
      return {
        level: obj.level as 'LOW' | 'MEDIUM' | 'HIGH',
        reasons: (obj.reasons ?? []).map(String).slice(0, 5),
        source: 'ai' as Source,
      }
    }
    return { ...(await this.mock.risk(input)), source: 'mock' as Source }
  }
}

/** 模型偶尔在 JSON 外加说明或代码块：取第一个完整的 [...] 或 {...} */
function parseJson<T>(text: string, open: '[' | '{'): T | null {
  const close = open === '[' ? ']' : '}'
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
