import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions, Public } from '../../common/decorators'
import { CampaignsService } from './campaigns.service'

/** 内存限流表：ip -> timestamps（单实例开发够用） */
const rateMap = new Map<string, number[]>()

class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  type?: string

  @IsOptional()
  @IsString()
  description?: string
}

class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string

  @IsOptional()
  @IsString()
  type?: string

  @IsOptional()
  @IsString()
  status?: string

  @IsOptional()
  @IsString()
  description?: string
}

class PublicSubmitDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  company?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  remark?: string
}

@ApiTags('campaign')
@Controller()
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get('campaigns')
  @Permissions(PERMISSIONS.CAMPAIGN_READ)
  list(@CurrentUser() me: AuthUser) {
    return this.campaigns.list(me)
  }

  @Post('campaigns')
  @Permissions(PERMISSIONS.CAMPAIGN_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(me, dto as unknown as Record<string, unknown>)
  }

  @Patch('campaigns/:id')
  @Permissions(PERMISSIONS.CAMPAIGN_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(me, id, dto)
  }

  @Post('forms')
  @Permissions(PERMISSIONS.FORM_WRITE)
  createForm(
    @CurrentUser() me: AuthUser,
    @Body() body: { name: string; campaignId?: string },
  ) {
    return this.campaigns.createForm(me, body.name, body.campaignId)
  }

  @Public()
  @Post('forms/:id/submit')
  submit(@Param('id') id: string, @Body() dto: PublicSubmitDto, @Req() req: Request) {
    // 简易限流：同 IP 60s 内 5 次（补遗 §12）
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const now = Date.now()
    const windowMs = 60_000
    const hits = (rateMap.get(ip) ?? []).filter((t) => now - t < windowMs)
    if (hits.length >= 5) {
      throw new HttpException(
        { code: 42900, message: 'Too many requests', data: null },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    hits.push(now)
    rateMap.set(ip, hits)
    return this.campaigns.submitForm(id, dto as unknown as Record<string, unknown>)
  }

  @Get('forms/:id')
  @Permissions(PERMISSIONS.FORM_READ)
  formDetail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.campaigns.formDetail(me, id)
  }
}
