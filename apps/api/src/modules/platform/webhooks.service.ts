import { Injectable, Logger } from '@nestjs/common'
import { createHmac } from 'crypto'
import { BizException, ErrorCodes } from '@zhixiao-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name)

  constructor(private readonly prisma: PrismaService) {}

  async list(me: AuthUser) {
    return this.prisma.webhook.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async deliveries(me: AuthUser, page = 1, pageSize = 20) {
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const where = { tenantId: me.tenantId }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.webhookDelivery.count({ where }),
      this.prisma.webhookDelivery.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (p - 1) * size,
        take: size,
      }),
    ])
    return {
      items,
      page: p,
      pageSize: size,
      total,
      hasMore: p * size < total,
    }
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    return this.prisma.webhook.create({
      data: {
        tenantId: me.tenantId,
        url: data.url as string,
        secret: (data.secret as string) || 'whsec_dev',
        events: (data.events as string[]) ?? [],
        isActive: true,
      },
    })
  }

  async update(
    me: AuthUser,
    id: string,
    data: { url?: string; secret?: string; events?: string[]; isActive?: boolean },
  ) {
    const existing = await this.prisma.webhook.findFirst({ where: { id, tenantId: me.tenantId } })
    if (!existing) throw new BizException(ErrorCodes.NOT_FOUND, 'webhook not found')
    return this.prisma.webhook.update({
      where: { id },
      data: {
        url: data.url ?? undefined,
        // 空字符串表示不修改密钥
        secret: data.secret || undefined,
        events: data.events ?? undefined,
        isActive: data.isActive ?? undefined,
      },
    })
  }

  async remove(me: AuthUser, id: string) {
    await this.prisma.webhook.deleteMany({ where: { id, tenantId: me.tenantId } })
    return { ok: true }
  }

  /** 异步发射：匹配 event 的 webhook，HMAC 签名，失败记 delivery；指定 webhookId 时只投递该条且不校验订阅事件（用于测试） */
  async emit(
    tenantIdOrUser: string | AuthUser,
    event: string,
    payload: unknown,
    opts: { webhookId?: string } = {},
  ) {
    const tenantId = typeof tenantIdOrUser === 'string' ? tenantIdOrUser : tenantIdOrUser.tenantId
    const hooks = await this.prisma.webhook.findMany({
      where: { tenantId, isActive: true, ...(opts.webhookId ? { id: opts.webhookId } : {}) },
    })
    const matched = opts.webhookId
      ? hooks
      : hooks.filter((h) => {
          const events = (h.events as string[]) ?? []
          return events.includes(event) || events.includes('*')
        })
    const bodyObj = {
      event,
      tenantId,
      occurredAt: new Date().toISOString(),
      data: payload,
    }
    const results: Array<{ id: string; ok: boolean; status?: number }> = []
    for (const hook of matched) {
      const raw = JSON.stringify(bodyObj)
      const t = Math.floor(Date.now() / 1000)
      const sig = createHmac('sha256', hook.secret).update(`${t}.${raw}`).digest('hex')
      let success = false
      let code: number | null = null
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const res = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ZhiXiao-Event': event,
            'X-ZhiXiao-Signature': `t=${t},v1=${sig}`,
          },
          body: raw,
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        code = res.status
        success = res.ok
      } catch (e) {
        this.logger.warn(`webhook deliver failed ${hook.url}: ${(e as Error).message}`)
      }
      await this.prisma.webhookDelivery.create({
        data: {
          tenantId,
          webhookId: hook.id,
          event,
          payload: bodyObj as never,
          responseCode: code,
          success,
        },
      })
      results.push({ id: hook.id, ok: success, status: code ?? undefined })
    }
    return { delivered: results.length, results }
  }
}
