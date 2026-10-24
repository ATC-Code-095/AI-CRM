import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Post, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'
import { BizException, ErrorCodes, PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions, Public } from '../../common/decorators'
import { ImService } from './im.service'
import { ImProvider } from './providers'

enum Provider {
  wechat_work = 'wechat_work',
  dingtalk = 'dingtalk',
  feishu = 'feishu',
}
const providerPipe = new ParseEnumPipe(Provider)

class AppDto {
  @IsString()
  @MaxLength(100)
  appId!: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  agentId?: string

  /** 留空沿用已存密钥 */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  secret?: string

  @IsBoolean()
  enabled!: boolean

  @IsOptional()
  @IsBoolean()
  syncDaily?: boolean
}

class CallbackDto {
  @IsString()
  @MaxLength(512)
  code!: string

  @IsString()
  @MaxLength(2048)
  state!: string

  @IsString()
  @MaxLength(500)
  redirectUri!: string
}

class BindStartDto {
  @IsString()
  @MaxLength(500)
  redirectUri!: string
}

/** 回跳地址只允许本系统的 /login/sso/<平台> 页面，避免授权码被带到其他地址 */
function checkRedirect(provider: string, redirectUri: string) {
  let u: URL
  try {
    u = new URL(redirectUri)
  } catch {
    throw new BizException(ErrorCodes.VALIDATION_FAILED, 'invalid redirectUri')
  }
  if (!['http:', 'https:'].includes(u.protocol) || u.pathname !== `/login/sso/${provider}`) {
    throw new BizException(ErrorCodes.VALIDATION_FAILED, 'invalid redirectUri')
  }
}

/** 企业微信 / 钉钉 / 飞书：应用配置、通讯录同步（管理员） */
@ApiTags('im')
@Controller('im')
export class ImAdminController {
  constructor(private readonly im: ImService) {}

  @Get('apps')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  @ApiOperation({ summary: '三个平台的应用配置（不返回密钥）与上次同步结果' })
  view(@CurrentUser() me: AuthUser) {
    return this.im.view(me.tenantId)
  }

  @Put('apps/:provider')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  save(@CurrentUser() me: AuthUser, @Param('provider', providerPipe) provider: ImProvider, @Body() dto: AppDto) {
    return this.im.saveApp(me.tenantId, provider, dto)
  }

  @Post('apps/:provider/test')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '用应用凭证取一次访问令牌' })
  test(@CurrentUser() me: AuthUser, @Param('provider', providerPipe) provider: ImProvider) {
    return this.im.test(me.tenantId, provider)
  }

  @Post('apps/:provider/sync')
  @Permissions(PERMISSIONS.ORG_USER_WRITE)
  @ApiOperation({ summary: '立即同步通讯录（部门与成员）' })
  sync(@CurrentUser() me: AuthUser, @Param('provider', providerPipe) provider: ImProvider) {
    return this.im.sync(me.tenantId, provider)
  }
}

/** 扫码登录（无需登录）与本人账号绑定 */
@ApiTags('auth')
@Controller('auth')
export class SsoController {
  constructor(private readonly im: ImService) {}

  @Public()
  @Get('sso/providers')
  @ApiOperation({ summary: '登录页：可用的扫码登录方式' })
  providers(@Query('tenant') tenant?: string) {
    return this.im.providersFor(tenant || undefined)
  }

  @Public()
  @Get('sso/:provider/start')
  @ApiOperation({ summary: '取平台扫码授权地址' })
  start(
    @Param('provider', providerPipe) provider: ImProvider,
    @Query('redirectUri') redirectUri: string,
    @Query('tenant') tenant?: string,
  ) {
    checkRedirect(provider, redirectUri)
    return this.im.startUrl(tenant || undefined, provider, redirectUri)
  }

  @Public()
  @Post('sso/:provider/callback')
  @HttpCode(200)
  @ApiOperation({ summary: '扫码回调：登录，或完成本人账号绑定' })
  callback(@Param('provider', providerPipe) provider: ImProvider, @Body() dto: CallbackDto) {
    checkRedirect(provider, dto.redirectUri)
    return this.im.callback(provider, dto.code, dto.state, dto.redirectUri)
  }

  @Get('identities')
  @ApiOperation({ summary: '我绑定的企业微信 / 钉钉 / 飞书账号' })
  identities(@CurrentUser() me: AuthUser) {
    return this.im.myIdentities(me.tenantId, me.id)
  }

  @Post('identities/:provider/start')
  @ApiOperation({ summary: '开始绑定：返回扫码授权地址' })
  bindStart(@CurrentUser() me: AuthUser, @Param('provider', providerPipe) provider: ImProvider, @Body() dto: BindStartDto) {
    checkRedirect(provider, dto.redirectUri)
    return this.im.startUrl(undefined, provider, dto.redirectUri, me.id, me.tenantId)
  }

  @Delete('identities/:provider')
  unbind(@CurrentUser() me: AuthUser, @Param('provider', providerPipe) provider: ImProvider) {
    return this.im.unbind(me.tenantId, me.id, provider)
  }
}
