import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsIn, IsString } from 'class-validator'
import { PERMISSIONS, ShareRole } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { SharesService } from './shares.service'

class ShareDto {
  @IsString()
  userId!: string

  @IsIn(Object.values(ShareRole))
  role!: ShareRole
}

@ApiTags('share')
@Controller()
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Get('accounts/:id/shares')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  list(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.shares.list(me, 'ACCOUNT', id)
  }

  @Post('accounts/:id/share')
  @Permissions(PERMISSIONS.ACCOUNT_SHARE)
  share(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ShareDto) {
    return this.shares.share(me, 'ACCOUNT', id, dto.userId, dto.role)
  }

  @Delete('accounts/:id/share/:userId')
  @Permissions(PERMISSIONS.ACCOUNT_SHARE)
  unshare(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.shares.unshare(me, 'ACCOUNT', id, userId)
  }

  @Post('opportunities/:id/share')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  shareOpp(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ShareDto) {
    return this.shares.share(me, 'OPPORTUNITY', id, dto.userId, dto.role)
  }

  @Delete('opportunities/:id/share/:userId')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  unshareOpp(@CurrentUser() me: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.shares.unshare(me, 'OPPORTUNITY', id, userId)
  }
}
