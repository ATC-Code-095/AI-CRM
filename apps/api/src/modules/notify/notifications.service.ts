import { Injectable } from '@nestjs/common'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(me: AuthUser, unreadOnly: boolean, page = 1, pageSize = 20, type?: string) {
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const where = {
      tenantId: me.tenantId,
      userId: me.id,
      ...(unreadOnly ? { isRead: false } : {}),
      // type 前缀过滤：APPROVAL / CONTRACT / POOL / API / QUOTE ...
      ...(type ? { type: { startsWith: type } } : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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

  async unreadCount(me: AuthUser) {
    const count = await this.prisma.notification.count({
      where: { tenantId: me.tenantId, userId: me.id, isRead: false },
    })
    return { count }
  }

  async markRead(me: AuthUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, tenantId: me.tenantId, userId: me.id },
      data: { isRead: true },
    })
    return { ok: true }
  }

  /** 通知偏好：静音类型列表 */
  async getPreferences(me: AuthUser) {
    const row = await this.prisma.setting.findFirst({
      where: {
        tenantId: me.tenantId,
        key: 'notification.prefs',
        scope: 'USER',
        userId: me.id,
      },
    })
    const v = (row?.value ?? {}) as { mutedTypes?: string[] }
    return { mutedTypes: v.mutedTypes ?? [] }
  }

  async setPreferences(me: AuthUser, mutedTypes: string[]) {
    const row = await this.prisma.setting.findFirst({
      where: {
        tenantId: me.tenantId,
        key: 'notification.prefs',
        scope: 'USER',
        userId: me.id,
      },
    })
    const value = { mutedTypes: Array.isArray(mutedTypes) ? mutedTypes : [] }
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: value as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'notification.prefs',
          scope: 'USER',
          userId: me.id,
          value: value as never,
        },
      })
    }
    return { ok: true, mutedTypes: value.mutedTypes }
  }

  async readAll(me: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { tenantId: me.tenantId, userId: me.id, isRead: false },
      data: { isRead: true },
    })
    return { ok: true }
  }

  async push(
    tenantId: string,
    userId: string,
    type: string,
    title: string,
    body: string | null,
    entityType?: string,
    entityId?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        tenantId,
        userId,
        type,
        title,
        body,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
      },
    })
  }
}
