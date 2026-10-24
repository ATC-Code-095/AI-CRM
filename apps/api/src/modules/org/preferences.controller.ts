import { Body, Controller, Delete, Get, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { AuthUser, CurrentUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

class PutPreferenceDto {
  @IsString()
  @MinLength(1)
  key!: string

  @IsOptional()
  value?: unknown
}

/**
 * 用户级偏好 KV（scope=USER）
 *
 * 用于承载「列表视图」「星标关注」等跨设备一致性数据；
 * 无需租户管理权限，任何登录用户只能读写自己的行。
 * 另提供 shared 读取：同一租户下按约定的共享 key（shared.*）可读他人写入的共享视图。
 */
@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '读取我的偏好（单键或全部）' })
  async get(@CurrentUser() me: AuthUser, @Query('key') key?: string) {
    if (key) {
      const row = await this.prisma.setting.findFirst({
        where: { tenantId: me.tenantId, scope: 'USER', userId: me.id, key },
      })
      return { key, value: row?.value ?? null }
    }
    const rows = await this.prisma.setting.findMany({
      where: { tenantId: me.tenantId, scope: 'USER', userId: me.id },
      orderBy: { key: 'asc' },
    })
    return { items: rows.map((r) => ({ key: r.key, value: r.value })) }
  }

  @Put()
  @ApiOperation({ summary: '写入我的偏好（upsert）' })
  async put(@CurrentUser() me: AuthUser, @Body() dto: PutPreferenceDto) {
    const existing = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, scope: 'USER', userId: me.id, key: dto.key },
    })
    if (existing) {
      await this.prisma.setting.update({
        where: { id: existing.id },
        data: { value: (dto.value ?? null) as never },
      })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          scope: 'USER',
          userId: me.id,
          key: dto.key,
          value: (dto.value ?? null) as never,
        },
      })
    }
    return { key: dto.key, value: dto.value ?? null }
  }

  @Delete()
  @ApiOperation({ summary: '删除我的偏好键' })
  async remove(@CurrentUser() me: AuthUser, @Query('key') key: string) {
    await this.prisma.setting.deleteMany({
      where: { tenantId: me.tenantId, scope: 'USER', userId: me.id, key },
    })
    return { ok: true }
  }

  @Get('shared')
  @ApiOperation({ summary: '读取团队共享项（key 需以 shared. 开头）' })
  async shared(@CurrentUser() me: AuthUser, @Query('key') key: string) {
    if (!key || !key.startsWith('shared.')) return { items: [] }
    const rows = await this.prisma.setting.findMany({
      where: { tenantId: me.tenantId, scope: 'USER', key },
    })
    const users = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId, id: { in: rows.map((r) => r.userId ?? '') } },
      select: { id: true, name: true },
    })
    const nameMap = new Map(users.map((u) => [u.id, u.name]))
    return {
      items: rows.map((r) => ({
        userId: r.userId,
        ownerName: nameMap.get(r.userId ?? '') ?? tr('同事', 'Colleague'),
        value: r.value,
        mine: r.userId === me.id,
      })),
    }
  }
}
