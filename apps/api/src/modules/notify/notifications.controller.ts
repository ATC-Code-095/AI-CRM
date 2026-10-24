import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator'
import { AuthUser, CurrentUser } from '../../common/decorators'
import { NotificationsService } from './notifications.service'

class NotificationPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  mutedTypes?: string[]
}

/**
 * 站内通知：只读写当前登录用户自己的通知（service 层按 me.id 过滤），任何已登录用户都可用。
 * 原先误要求 approval:read，导致财务、运营、客服角色收不到任何通知。
 */
@ApiTags('notify')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() me: AuthUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('type') type?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.notifications.list(
      me,
      unreadOnly === 'true' || unreadOnly === '1',
      Number(page),
      Number(pageSize),
      type,
    )
  }

  /** 通知偏好：订阅类型 */
  @Get('preferences')
  getPreferences(@CurrentUser() me: AuthUser) {
    return this.notifications.getPreferences(me)
  }

  @Put('preferences')
  setPreferences(@CurrentUser() me: AuthUser, @Body() body: NotificationPreferencesDto) {
    return this.notifications.setPreferences(me, body?.mutedTypes ?? [])
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() me: AuthUser) {
    return this.notifications.unreadCount(me)
  }

  @Post(':id/read')
  markRead(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(me, id)
  }

  @Post('read-all')
  readAll(@CurrentUser() me: AuthUser) {
    return this.notifications.readAll(me)
  }
}
