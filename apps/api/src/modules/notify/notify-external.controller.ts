import { Body, Controller, Get, Post, Put } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { BizException, ErrorCodes, PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { tr } from '../../common/locale'
import { BOT_CATEGORIES, BotCategory, BotChannel, BotsService } from './bots.service'

const CHANNELS = ['wechat_work', 'dingtalk', 'feishu'] as const

class SendDto {
  @IsIn(CHANNELS)
  channel!: BotChannel

  @IsString()
  @MinLength(1)
  title!: string

  @IsOptional()
  @IsString()
  text?: string

  /** 不传则发给该渠道已配置的全部机器人 */
  @IsOptional()
  @IsString()
  webhookUrl?: string
}

class BotDto {
  @IsOptional()
  @IsString()
  id?: string

  @IsString()
  @MaxLength(60)
  name!: string

  @IsIn(CHANNELS)
  channel!: BotChannel

  @IsString()
  @MaxLength(500)
  webhookUrl!: string

  /** 留空沿用原密钥；null 清除 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  secret?: string | null

  @IsArray()
  @IsIn(BOT_CATEGORIES, { each: true })
  categories!: BotCategory[]

  @IsBoolean()
  enabled!: boolean
}

class SaveBotsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BotDto)
  items!: BotDto[]
}

class TestBotDto {
  /** 已保存的机器人 id；或直接给出渠道与地址（保存前试发） */
  @IsOptional()
  @IsString()
  id?: string

  @IsOptional()
  @IsIn(CHANNELS)
  channel?: BotChannel

  @IsOptional()
  @IsString()
  webhookUrl?: string

  @IsOptional()
  @IsString()
  secret?: string
}

/** 企业微信 / 钉钉 / 飞书群机器人：配置、试发，以及手动发送 */
@ApiTags('notify-external')
@Controller('notify')
export class NotifyExternalController {
  constructor(private readonly bots: BotsService) {}

  @Get('bots')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  @ApiOperation({ summary: '群机器人列表（不返回密钥）' })
  list(@CurrentUser() me: AuthUser) {
    return this.bots.listMasked(me.tenantId).then((items) => ({ items, categories: BOT_CATEGORIES }))
  }

  @Put('bots')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '保存群机器人配置（整体覆盖）' })
  save(@CurrentUser() me: AuthUser, @Body() dto: SaveBotsDto) {
    return this.bots.save(me.tenantId, dto.items).then((items) => ({ items }))
  }

  @Post('bots/test')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '向群机器人发送一条测试消息' })
  async test(@CurrentUser() me: AuthUser, @Body() dto: TestBotDto) {
    let bot: { channel: BotChannel; webhookUrl: string; secret?: string } | undefined
    if (dto.id) {
      bot = (await this.bots.list(me.tenantId)).find((b) => b.id === dto.id)
      if (!bot) throw new BizException(ErrorCodes.NOT_FOUND, 'bot not found')
    } else if (dto.channel && dto.webhookUrl) {
      bot = { channel: dto.channel, webhookUrl: dto.webhookUrl, secret: dto.secret }
    } else {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, 'id or channel + webhookUrl required')
    }
    try {
      return await this.bots.send(
        bot,
        tr('智销 CRM 测试消息', 'ZhiXiao CRM test message'),
        tr(`由 ${me.name ?? me.email} 发送，收到即表示机器人配置正确。`, `Sent by ${me.name ?? me.email}. If you see this, the bot is set up correctly.`),
      )
    } catch (e) {
      if (e instanceof BizException) throw e
      return { ok: false, error: (e as Error).message }
    }
  }

  @Post('external')
  @Permissions(PERMISSIONS.WEBHOOK_WRITE)
  @ApiOperation({ summary: '手动向群机器人发送消息' })
  async send(@CurrentUser() me: AuthUser, @Body() dto: SendDto) {
    const targets = dto.webhookUrl
      ? [{ channel: dto.channel, webhookUrl: dto.webhookUrl }]
      : (await this.bots.list(me.tenantId)).filter((b) => b.enabled && b.channel === dto.channel)
    if (!targets.length) return { ok: false, message: 'webhookUrl required' }
    const results = []
    for (const b of targets) {
      try {
        results.push(await this.bots.send(b, dto.title, dto.text ?? ''))
      } catch (e) {
        if (e instanceof BizException) throw e
        results.push({ ok: false, error: (e as Error).message })
      }
    }
    return { ok: results.every((r) => r.ok), channel: dto.channel, results }
  }
}
