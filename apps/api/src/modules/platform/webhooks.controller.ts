import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { WebhooksService } from './webhooks.service'

class CreateWebhookDto {
  @IsString()
  @MinLength(1)
  url!: string

  @IsOptional()
  @IsString()
  secret?: string

  @IsArray()
  @IsString({ each: true })
  events!: string[]
}

class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  url?: string

  @IsOptional()
  @IsString()
  secret?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

@ApiTags('platform')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @Permissions(PERMISSIONS.WEBHOOK_READ)
  list(@CurrentUser() me: AuthUser) {
    return this.webhooks.list(me)
  }

  @Post()
  @Permissions(PERMISSIONS.WEBHOOK_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(me, dto as unknown as Record<string, unknown>)
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.WEBHOOK_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.update(me, id, dto)
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.WEBHOOK_WRITE)
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.webhooks.remove(me, id)
  }

  @Post(':id/test')
  @Permissions(PERMISSIONS.WEBHOOK_WRITE)
  test(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.webhooks.emit(
      me,
      'webhook.test',
      { ok: true, at: new Date().toISOString() },
      { webhookId: id },
    )
  }

  @Get('deliveries')
  @Permissions(PERMISSIONS.WEBHOOK_READ)
  deliveries(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.webhooks.deliveries(me, Number(page), Number(pageSize))
  }
}

void Req
