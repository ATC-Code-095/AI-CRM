import { Injectable } from '@nestjs/common'
import { BizException, ErrorCodes, ShareRole } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'

@Injectable()
export class SharesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(me: AuthUser, entityType: string, entityId: string) {
    await this.assertOwner(me, entityType, entityId)
    return this.prisma.entityShare.findMany({
      where: { tenantId: me.tenantId, entityType, entityId },
    })
  }

  async share(
    me: AuthUser,
    entityType: string,
    entityId: string,
    userId: string,
    role: ShareRole,
  ) {
    await this.assertOwner(me, entityType, entityId)
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    return this.prisma.entityShare.upsert({
      where: {
        tenantId_entityType_entityId_userId: {
          tenantId: me.tenantId,
          entityType,
          entityId,
          userId,
        },
      },
      update: { role },
      create: {
        tenantId: me.tenantId,
        entityType,
        entityId,
        userId,
        role,
        createdById: me.id,
      },
    })
  }

  async unshare(me: AuthUser, entityType: string, entityId: string, userId: string) {
    await this.assertOwner(me, entityType, entityId)
    await this.prisma.entityShare.deleteMany({
      where: { tenantId: me.tenantId, entityType, entityId, userId },
    })
    return { ok: true }
  }

  async isSharedToMe(me: AuthUser, entityType: string, entityId: string): Promise<boolean> {
    const row = await this.prisma.entityShare.findFirst({
      where: { tenantId: me.tenantId, entityType, entityId, userId: me.id },
    })
    return !!row
  }

  async sharedIds(me: AuthUser, entityType: string): Promise<string[]> {
    const rows = await this.prisma.entityShare.findMany({
      where: { tenantId: me.tenantId, entityType, userId: me.id },
      select: { entityId: true },
    })
    return rows.map((r) => r.entityId)
  }

  private async assertOwner(me: AuthUser, entityType: string, entityId: string) {
    let row: { ownerId: string } | null = null
    if (entityType === 'ACCOUNT') {
      row = await this.prisma.account.findFirst({
        where: { id: entityId, tenantId: me.tenantId, deletedAt: null },
        select: { ownerId: true },
      })
    } else if (entityType === 'OPPORTUNITY') {
      row = await this.prisma.opportunity.findFirst({
        where: { id: entityId, tenantId: me.tenantId, deletedAt: null },
        select: { ownerId: true },
      })
    } else {
      row = await this.prisma.lead.findFirst({
        where: { id: entityId, tenantId: me.tenantId, deletedAt: null },
        select: { ownerId: true },
      })
    }
    if (!row) throw new BizException(ErrorCodes.NOT_FOUND, 'entity not found')
    if (row.ownerId !== me.id && me.dataScope !== 'ALL') {
      throw new BizException(ErrorCodes.FORBIDDEN, 'only owner can share')
    }
  }
}
