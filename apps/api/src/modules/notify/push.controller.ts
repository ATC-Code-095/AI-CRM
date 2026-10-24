import { Body, Controller, Delete, Get, Post } from '@nestjs/common'
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { DevicePushService } from './device-push.service'

class RegisterDeviceDto {
  @IsIn(['ios', 'android', 'harmony'])
  platform!: 'ios' | 'android' | 'harmony'

  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  token!: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string
}

class UnregisterDeviceDto {
  @IsString()
  @MaxLength(4096)
  token!: string
}

/** 手机 App 推送：登记 / 注销本机设备（只影响本人），管理员查看推送通道状态 */
@ApiTags('push')
@Controller('push')
export class PushController {
  constructor(private readonly devices: DevicePushService) {}

  @Post('devices')
  @ApiOperation({ summary: '登记本机推送令牌（App 登录后调用）' })
  register(@CurrentUser() me: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devices.register(me.tenantId, me.id, dto.platform, dto.token, dto.appVersion)
  }

  @Delete('devices')
  @ApiOperation({ summary: '注销本机推送令牌（退出登录时调用）' })
  unregister(@CurrentUser() me: AuthUser, @Body() dto: UnregisterDeviceDto) {
    return this.devices.unregister(me.id, dto.token)
  }

  @Get('status')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  @ApiOperation({ summary: 'APNs / FCM / 华为 Push Kit 是否已配置' })
  status() {
    return this.devices.status()
  }
}
