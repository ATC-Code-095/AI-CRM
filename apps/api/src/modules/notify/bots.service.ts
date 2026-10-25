import { Injectable, Logger } from '@nestjs/common'
import { createHmac, randomUUID } from 'crypto'
import { BizException, ErrorCodes } from '@zhixiao-crm/shared'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

export type BotChannel = 'wechat_work' | 'dingtalk' | 'feishu'

/** 通知分类：机器人按分类订阅（type 前缀见各业务模块的 PushService.notify 调用） */
export const BOT_CATEGORIES = ['APPROVAL', 'LEAD', 'QUOTE', 'CONTRACT', 'PAYMENT', 'CUSTOMER', 'FUNNEL', 'SYSTEM'] as const
export type BotCategory = (typeof BOT_CATEGORIES)[number]

export interface NotifyBot {
  id: string
  name: string
  channel: BotChannel
  webhookUrl: string
  /** 钉钉 / 飞书「加签」密钥，可选 */
  secret?: string
  categories: BotCategory[]
  enabled: boolean
}

const SETTING_KEY = 'notify.bots'
const TIMEOUT_MS = 5000

/** 只允许三家官方机器人地址，避免被用来访问内网（SSRF） */
const ALLOWED_HOSTS: Record<BotChannel, string[]> = {
  wechat_work: ['qyapi.weixin.qq.com'],
  dingtalk: ['oapi.dingtalk.com'],
  feishu: ['open.feishu.cn', 'open.larksuite.com'],
}

export function categoryOf(type: string): BotCategory {
  if (type.startsWith('APPROVAL')) return 'APPROVAL'
  if (type.startsWith('LEAD') || type === 'FOLLOWUP_TIMEOUT' || type === 'POOL_RECYCLE') return 'LEAD'
  if (type.startsWith('QUOTE')) return 'QUOTE'
  if (type.startsWith('CONTRACT') || type === 'RENEWAL_OPP') return 'CONTRACT'
  if (type.startsWith('PAYMENT')) return 'PAYMENT'
  if (type.startsWith('FUNNEL')) return 'FUNNEL'
  if (['HEALTH_ALERT', 'NPS_FOLLOWUP', 'JOURNEY_AUTO', 'OUTREACH'].includes(type) || type.startsWith('SEGMENT')) return 'CUSTOMER'
  return 'SYSTEM'
}

export function validateWebhookUrl(channel: BotChannel, url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('机器人地址格式不正确', 'Invalid bot webhook URL'))
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS[channel]?.includes(u.hostname)) {
    throw new BizException(
      ErrorCodes.VALIDATION_FAILED,
      tr(
        `机器人地址必须是 https://${ALLOWED_HOSTS[channel]?.[0]} 开头的官方地址`,
        `The webhook URL must be an official https://${ALLOWED_HOSTS[channel]?.[0]} address`,
      ),
    )
  }
}

/** 按渠道组装消息体；钉钉 / 飞书有密钥时加签 */
export function buildRequest(bot: Pick<NotifyBot, 'channel' | 'webhookUrl' | 'secret'>, title: string, text: string) {
  const content = text ? `${title}\n${text}` : title
  if (bot.channel === 'dingtalk') {
    let url = bot.webhookUrl
    if (bot.secret) {
      const ts = Date.now()
      const sign = createHmac('sha256', bot.secret).update(`${ts}\n${bot.secret}`).digest('base64')
      url += `${url.includes('?') ? '&' : '?'}timestamp=${ts}&sign=${encodeURIComponent(sign)}`
    }
    return { url, body: { msgtype: 'markdown', markdown: { title, text: `### ${title}\n\n${text}` } } }
  }
  if (bot.channel === 'feishu') {
    const body: Record<string, unknown> = { msg_type: 'text', content: { text: content } }
    if (bot.secret) {
      const ts = Math.floor(Date.now() / 1000)
      body.timestamp = String(ts)
      body.sign = createHmac('sha256', `${ts}\n${bot.secret}`).update('').digest('base64')
    }
    return { url: bot.webhookUrl, body }
  }
  return { url: bot.webhookUrl, body: { msgtype: 'markdown', markdown: { content: `**${title}**\n${text}` } } }
}

/** 三家机器人在 HTTP 200 时用 errcode / code 表示失败 */
function errorOf(json: unknown): string | null {
  const j = (json ?? {}) as { errcode?: number; errmsg?: string; code?: number; msg?: string; StatusCode?: number }
  if (typeof j.errcode === 'number' && j.errcode !== 0) return `${j.errcode} ${j.errmsg ?? ''}`.trim()
  if (typeof j.code === 'number' && j.code !== 0) return `${j.code} ${j.msg ?? ''}`.trim()
  return null
}

@Injectable()
export class BotsService {
  private readonly logger = new Logger('NotifyBots')

  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string): Promise<NotifyBot[]> {
    const row = await this.prisma.setting.findFirst({ where: { tenantId, key: SETTING_KEY, scope: 'TENANT' } })
    return Array.isArray(row?.value) ? (row.value as unknown as NotifyBot[]) : []
  }

  /** 返回给前端时不带密钥，只告诉是否已设置 */
  async listMasked(tenantId: string) {
    return (await this.list(tenantId)).map(({ secret, ...b }) => ({ ...b, hasSecret: Boolean(secret) }))
  }

  /** 保存全部机器人；secret 留空表示沿用原密钥，传 null 表示清除 */
  async save(
    tenantId: string,
    items: Array<Omit<NotifyBot, 'id' | 'secret'> & { id?: string; secret?: string | null }>,
  ) {
    const prev = new Map((await this.list(tenantId)).map((b) => [b.id, b]))
    const bots: NotifyBot[] = items.map((it) => {
      validateWebhookUrl(it.channel, it.webhookUrl)
      const old = it.id ? prev.get(it.id) : undefined
      const secret = it.secret === null ? undefined : it.secret || old?.secret
      return {
        id: it.id || randomUUID(),
        name: it.name.trim() || it.channel,
        channel: it.channel,
        webhookUrl: it.webhookUrl.trim(),
        ...(secret ? { secret } : {}),
        categories: it.categories.filter((c) => (BOT_CATEGORIES as readonly string[]).includes(c)),
        enabled: it.enabled !== false,
      }
    })
    const existing = await this.prisma.setting.findFirst({ where: { tenantId, key: SETTING_KEY, scope: 'TENANT' } })
    if (existing) {
      await this.prisma.setting.update({ where: { id: existing.id }, data: { value: bots as never } })
    } else {
      await this.prisma.setting.create({ data: { tenantId, key: SETTING_KEY, scope: 'TENANT', value: bots as never } })
    }
    return this.listMasked(tenantId)
  }

  async send(bot: Pick<NotifyBot, 'channel' | 'webhookUrl' | 'secret'>, title: string, text: string) {
    validateWebhookUrl(bot.channel, bot.webhookUrl)
    const { url, body } = buildRequest(bot, title, text)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const json = await res.json().catch(() => null)
    const err = !res.ok ? `HTTP ${res.status}` : errorOf(json)
    return { ok: !err, status: res.status, error: err }
  }

  /** 新通知转发到订阅了该分类的机器人；失败只记日志，不影响业务 */
  async dispatch(tenantId: string, type: string, title: string, text: string) {
    const category = categoryOf(type)
    const bots = (await this.list(tenantId)).filter((b) => b.enabled && b.categories.includes(category))
    for (const b of bots) {
      try {
        const r = await this.send(b, title, text)
        if (!r.ok) this.logger.warn(`bot ${b.name} (${b.channel}) failed: ${r.error}`)
      } catch (e) {
        this.logger.warn(`bot ${b.name} (${b.channel}) error: ${(e as Error).message}`)
      }
    }
  }
}
