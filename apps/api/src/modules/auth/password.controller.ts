import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { hashPassword, verifyPassword } from '../../common/password'
import { ErrorCodes, BizException, SUPPORTED_LOCALES } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'

class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  oldPassword!: string

  @IsString()
  @MinLength(8)
  newPassword!: string
}

class PreferencesDto {
  @IsOptional()
  @IsIn([...SUPPORTED_LOCALES])
  locale?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string
}

@ApiTags('auth')
@Controller('auth')
export class PasswordController {
  constructor(private readonly prisma: PrismaService) {}

  // 只改当前登录用户自己的密码（仍校验旧密码），任何已登录用户都可用；
  // 原先要求 org:user:read，导致除超级管理员外的角色都无法改密码
  @Post('change-password')
  async change(@CurrentUser() me: AuthUser, @Body() dto: ChangePasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: me.id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    const ok = await verifyPassword(dto.oldPassword, user.passwordHash)
    if (!ok) throw new BizException(ErrorCodes.UNAUTHORIZED, 'old password wrong')
    const passwordHash = await hashPassword(dto.newPassword)
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    return { ok: true }
  }

  // 同上：只改自己的语言 / 时区
  @Post('preferences')
  async prefs(@CurrentUser() me: AuthUser, @Body() body: PreferencesDto) {
    return this.prisma.user.update({
      where: { id: me.id },
      data: {
        ...(body.locale ? { locale: body.locale } : {}),
        ...(body.timezone ? { timezone: body.timezone } : {}),
      },
      select: { id: true, locale: true, timezone: true },
    })
  }
}
