import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { BizException, ErrorCodes } from '@ai-crm/shared'

class CreateTokenDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString({ each: true })
  scopes?: string[]
}

@ApiTags('api-tokens')
@Controller('api-tokens')
export class ApiTokensController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.TOKEN_READ)
  list(@CurrentUser() me: AuthUser) {
    return this.prisma.apiToken.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    })
  }

  @Post()
  @Permissions(PERMISSIONS.TOKEN_WRITE)
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateTokenDto) {
    const raw = `ak_${randomBytes(24).toString('hex')}`
    const tokenHash = createHash('sha256').update(raw).digest('hex')
    const row = await this.prisma.apiToken.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        tokenHash,
        scopes: (dto.scopes ?? ['lead:read', 'account:read']) as never,
        expiresAt: new Date(Date.now() + 90 * 86400000),
        createdById: me.id,
      },
    })
    // 明文仅返回一次
    return { ...row, token: raw }
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.TOKEN_WRITE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.apiToken.updateMany({
      where: { id, tenantId: me.tenantId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  @Post('verify')
  @Permissions(PERMISSIONS.TOKEN_READ)
  async verify(@Body() body: { token: string }) {
    const tokenHash = createHash('sha256').update(body.token ?? '').digest('hex')
    const row = await this.prisma.apiToken.findFirst({
      where: { tokenHash, deletedAt: null },
    })
    if (!row) throw new BizException(ErrorCodes.UNAUTHORIZED, 'invalid token')
    return { ok: true, name: row.name, scopes: row.scopes }
  }
}
