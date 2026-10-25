import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { ApiTags } from '@nestjs/swagger'
import { PERMISSIONS, ErrorCodes, BizException } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

class RecycleDto {
  @IsString()
  entityType!: 'LEAD' | 'ACCOUNT'

  @IsString()
  entityId!: string

  @IsOptional()
  @IsString()
  reason?: string
}

class ClaimDto {
  @IsString()
  entityType!: 'LEAD' | 'ACCOUNT'

  @IsString()
  entityId!: string
}

/**
 * 公海（客户池）：未跟进/超期未联系的线索与客户，可回收再分配
 * 规则：nextFollowAt 逾期 7 天 或 最近活动 > 30 天 且状态非转化/赢单
 */
@ApiTags('pool')
@Controller('pool')
export class PoolController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leads')
  @Permissions(PERMISSIONS.LEAD_READ)
  async leads(@CurrentUser() me: AuthUser, @Query('pageSize') pageSize = '50') {
    const cutoff = new Date(Date.now() - 7 * 86400000)
    const items = await this.prisma.lead.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['NEW', 'ACCEPTED', 'CULTIVATING'] },
        OR: [
          { nextFollowAt: { lt: cutoff } },
          { nextFollowAt: null, createdAt: { lt: cutoff } },
        ],
      },
      take: Math.min(Number(pageSize), 100),
      orderBy: { nextFollowAt: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        ownerId: true,
        nextFollowAt: true,
        createdAt: true,
      },
    })
    return { items, total: items.length }
  }

  @Get('accounts')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async accounts(@CurrentUser() me: AuthUser, @Query('pageSize') pageSize = '50') {
    const cutoff = new Date(Date.now() - 30 * 86400000)
    const items = await this.prisma.account.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        stage: { in: ['POTENTIAL', 'AT_RISK'] },
        lastActivityAt: { lt: cutoff },
      },
      take: Math.min(Number(pageSize), 100),
      orderBy: { lastActivityAt: 'asc' },
      select: {
        id: true,
        name: true,
        ownerId: true,
        lastActivityAt: true,
        level: true,
      },
    })
    return { items, total: items.length }
  }

  /** 回收：负责人改为空闲公海账号或保留，标记 reason */
  @Post('recycle')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  async recycle(@CurrentUser() me: AuthUser, @Body() dto: RecycleDto) {
    if (dto.entityType === 'LEAD') {
      const row = await this.prisma.lead.findFirst({
        where: { id: dto.entityId, tenantId: me.tenantId, deletedAt: null },
      })
      if (!row) throw new BizException(ErrorCodes.NOT_FOUND, 'lead not found')
      return this.prisma.lead.update({
        where: { id: row.id },
        data: {
          status: 'NEW',
          nextFollowAt: null,
          remark: [row.remark, `${tr('公海回收', 'Returned to pool')}: ${dto.reason ?? ''}`].filter(Boolean).join(' | '),
          updatedById: me.id,
        },
      })
    }
    const row = await this.prisma.account.findFirst({
      where: { id: dto.entityId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!row) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    return this.prisma.account.update({
      where: { id: row.id },
      data: {
        stage: 'POTENTIAL',
        remark: [row.remark, `${tr('公海回收', 'Returned to pool')}: ${dto.reason ?? ''}`].filter(Boolean).join(' | '),
        updatedById: me.id,
      },
    })
  }

  /** 领取 */
  @Post('claim')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  async claim(@CurrentUser() me: AuthUser, @Body() dto: ClaimDto) {
    if (dto.entityType === 'LEAD') {
      return this.prisma.lead.update({
        where: { id: dto.entityId },
        data: { ownerId: me.id, status: 'ACCEPTED', updatedById: me.id },
      })
    }
    return this.prisma.account.update({
      where: { id: dto.entityId },
      data: { ownerId: me.id, updatedById: me.id },
    })
  }

  /** 合并重复客户：source 并入 target 后软删 source；可按字段覆盖保留值 */
  @Post('merge')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async merge(
    @CurrentUser() me: AuthUser,
    @Body() body: { sourceId: string; targetId: string; fields?: Record<string, unknown> },
  ) {
    const [source, target] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: body.sourceId, tenantId: me.tenantId, deletedAt: null },
      }),
      this.prisma.account.findFirst({
        where: { id: body.targetId, tenantId: me.tenantId, deletedAt: null },
      }),
    ])
    if (!source || !target) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    if (source.id === target.id) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'same account')
    }
    const allowed = [
      'name',
      'phone',
      'industry',
      'region',
      'level',
      'stage',
      'website',
      'address',
      'remark',
    ] as const
    const patch: Record<string, unknown> = {}
    if (body.fields) {
      for (const k of allowed) {
        if (k in body.fields) patch[k] = body.fields[k] ?? null
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({
        where: { accountId: source.id, tenantId: me.tenantId },
        data: { accountId: target.id },
      })
      await tx.opportunity.updateMany({
        where: { accountId: source.id, tenantId: me.tenantId },
        data: { accountId: target.id },
      })
      await tx.contract.updateMany({
        where: { accountId: source.id, tenantId: me.tenantId },
        data: { accountId: target.id },
      })
      await tx.account.update({
        where: { id: target.id },
        data: { ...patch, updatedById: me.id },
      })
      await tx.account.update({
        where: { id: source.id },
        data: { deletedAt: new Date(), updatedById: me.id },
      })
    })
    return { ok: true, targetId: target.id }
  }

  /** 查重 */
  @Get('duplicates')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async duplicates(@CurrentUser() me: AuthUser) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, phone: true },
    })
    const byName = new Map<string, string[]>()
    const byPhone = new Map<string, string[]>()
    for (const a of accounts) {
      const n = (a.name || '').trim().toLowerCase()
      if (n) byName.set(n, [...(byName.get(n) ?? []), a.id])
      if (a.phone) byPhone.set(a.phone, [...(byPhone.get(a.phone) ?? []), a.id])
    }
    const nameDup = [...byName.entries()].filter(([, ids]) => ids.length > 1)
    const phoneDup = [...byPhone.entries()].filter(([, ids]) => ids.length > 1)
    return {
      byName: nameDup.map(([name, ids]) => ({ name, ids })),
      byPhone: phoneDup.map(([phone, ids]) => ({ phone, ids })),
    }
  }
}
