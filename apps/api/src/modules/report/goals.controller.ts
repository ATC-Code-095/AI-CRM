import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { BizException, ErrorCodes } from '@ai-crm/shared'
import { tr } from '../../common/locale'

class CreateGoalDto {
  @IsOptional()
  @IsString()
  userId?: string

  @IsString()
  @MinLength(1)
  metric!: string

  @IsString()
  @MinLength(1)
  targetAmount!: string

  @IsString()
  @MinLength(1)
  periodKey!: string
}

@ApiTags('report')
@Controller('goals')
export class GoalsController {
  constructor(private readonly prisma: PrismaService) {}

  /** 目标级联：公司 → 团队（所有人） → 个人（对标 Salesforce Quota Hierarchy） */
  @Get('cascade')
  @Permissions(PERMISSIONS.GOAL_READ)
  async cascade(@CurrentUser() me: AuthUser, @Query('periodKey') periodKey?: string) {
    const now = new Date()
    const key =
      periodKey || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const goals = await this.prisma.goal.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, periodKey: key },
    })
    const users = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      select: { id: true, name: true, managerId: true },
    })
    const umap = new Map(users.map((u) => [u.id, u]))
    const byUser = new Map<string, { userId: string; name: string; manager: string; target: number; metrics: Record<string, number> }>()
    for (const g of goals) {
      const uid = g.userId ?? '__company__'
      const u = umap.get(uid)
      const row =
        byUser.get(uid) ??
        {
          userId: uid,
          name: u?.name ?? (uid === '__company__' ? tr('公司总目标', 'Company target') : tr('未分配', 'Unassigned')),
          manager: umap.get(u?.managerId ?? '')?.name ?? '',
          target: 0,
          metrics: {},
        }
      row.target += Number(g.targetAmount)
      row.metrics[g.metric] = (row.metrics[g.metric] ?? 0) + Number(g.targetAmount)
      byUser.set(uid, row)
    }
    const people = [...byUser.values()].sort((a, b) => b.target - a.target)
    const companyTotal = people.reduce((a, p) => a + p.target, 0)
    return {
      periodKey: key,
      companyTotal: companyTotal.toFixed(2),
      people: people.map((p) => ({ ...p, target: p.target.toFixed(2) })),
      managers: [...new Set(people.map((p) => p.manager).filter(Boolean))],
    }
  }

  @Get()
  @Permissions(PERMISSIONS.GOAL_READ)
  list(@CurrentUser() me: AuthUser, @Query('periodKey') periodKey?: string) {
    return this.prisma.goal.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        ...(periodKey ? { periodKey } : {}),
      },
      orderBy: { periodKey: 'desc' },
    })
  }

  @Post()
  @Permissions(PERMISSIONS.GOAL_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateGoalDto) {
    return this.prisma.goal.create({
      data: {
        tenantId: me.tenantId,
        userId: dto.userId ?? me.id,
        periodType: 'MONTH',
        periodKey: dto.periodKey,
        metric: dto.metric,
        targetAmount: dto.targetAmount,
        createdById: me.id,
      },
    })
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.GOAL_WRITE)
  async update(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { targetAmount?: string },
  ) {
    const g = await this.prisma.goal.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!g) throw new BizException(ErrorCodes.NOT_FOUND, 'goal not found')
    return this.prisma.goal.update({
      where: { id },
      data: { targetAmount: body.targetAmount ?? g.targetAmount },
    })
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.GOAL_WRITE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.goal.updateMany({
      where: { id, tenantId: me.tenantId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }
}
