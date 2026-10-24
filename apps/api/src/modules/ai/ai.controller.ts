import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { currentLocale } from '../../common/locale'
import { AiConfigService } from './ai-config.service'
import { AiGateway } from './ai-gateway'

class SummarizeDto {
  @IsIn(['OPPORTUNITY', 'ACCOUNT', 'LEAD'])
  entityType!: 'OPPORTUNITY' | 'ACCOUNT' | 'LEAD'

  @IsString()
  entityId!: string
}

class SuggestDto {
  @IsString()
  opportunityId!: string
}

class RiskDto {
  @IsString()
  opportunityId!: string
}

class AiConfigDto {
  @IsIn(['mock', 'openai', 'anthropic'])
  provider!: 'mock' | 'openai' | 'anthropic'

  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string

  /** 留空表示沿用已存密钥 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string
}

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiGateway,
    private readonly config: AiConfigService,
  ) {}

  @Post('summarize')
  @Permissions(PERMISSIONS.AI_ASSIST)
  summarize(@CurrentUser() me: AuthUser, @Body() dto: SummarizeDto) {
    return this.ai.summarize({ ...dto, tenantId: me.tenantId, locale: currentLocale() })
  }

  @Post('suggest-next')
  @Permissions(PERMISSIONS.AI_ASSIST)
  suggest(@CurrentUser() me: AuthUser, @Body() dto: SuggestDto) {
    return this.ai.suggestNext({ opportunityId: dto.opportunityId, tenantId: me.tenantId, locale: currentLocale() })
  }

  @Post('risk')
  @Permissions(PERMISSIONS.AI_ASSIST)
  risk(@CurrentUser() me: AuthUser, @Body() dto: RiskDto) {
    return this.ai.risk({ opportunityId: dto.opportunityId, tenantId: me.tenantId, locale: currentLocale() })
  }

  @Get('config')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  @ApiOperation({ summary: 'AI 接口配置（不返回密钥）' })
  getConfig(@CurrentUser() me: AuthUser) {
    return this.config.view(me.tenantId)
  }

  @Put('config')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '保存 AI 接口配置：mock / openai（兼容接口）/ anthropic' })
  saveConfig(@CurrentUser() me: AuthUser, @Body() dto: AiConfigDto) {
    return this.config.save(me.tenantId, dto)
  }

  @Post('config/test')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '用当前配置发送一次测试请求' })
  test(@CurrentUser() me: AuthUser) {
    return this.config.test(me.tenantId)
  }
}
