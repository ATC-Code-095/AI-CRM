import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'
import { Bilingual, normalizeLocale, pick } from '../../common/locale'
import { BotsService } from './bots.service'
import { DevicePushService } from './device-push.service'

/** 通知入口：写站内通知（按接收人的界面语言存储标题与正文），并转发到群机器人与接收人的手机 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly bots: BotsService,
    private readonly devices: DevicePushService,
  ) {}

  async notify(
    tenantId: string,
    userId: string,
    type: string,
    title: string | Bilingual,
    body?: string | Bilingual,
    entityType?: string,
    entityId?: string,
    /** 在调用方事务内写入时传入事务客户端 */
    db?: Prisma.TransactionClient,
  ) {
    const user = await (db ?? this.prisma).user.findFirst({
      where: { id: userId, tenantId },
      select: { locale: true, name: true },
    })
    const locale = normalizeLocale(user?.locale)
    const titleText = pick(title, locale)
    const bodyText = body == null ? null : pick(body, locale)
    this.logger.log(`notify ${type} -> ${userId}`)
    const row = await (db ?? this.prisma).notification.create({
      data: {
        tenantId,
        userId,
        type,
        title: titleText,
        body: bodyText,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      },
    })
    // 群机器人：异步发送，失败只记日志；群里注明接收人
    const who = user?.name ? `${locale === 'en-US' ? 'To' : '接收人'}: ${user.name}` : ''
    setImmediate(() => {
      void this.bots.dispatch(tenantId, type, titleText, [bodyText, who].filter(Boolean).join('\n')).catch((e: Error) =>
        this.logger.warn(`bot dispatch failed: ${e.message}`),
      )
      void this.devices
        .sendToUser(tenantId, userId, {
          title: titleText,
          body: bodyText,
          data: {
            notificationId: row.id,
            type,
            ...(entityType ? { entityType } : {}),
            ...(entityId ? { entityId } : {}),
          },
        })
        .catch((e: Error) => this.logger.warn(`device push failed: ${e.message}`))
    })
    return row
  }
}
