import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator'
import {
  ActivityType,
  ErrorCodes,
  BizException,
  LeadSource,
  LeadStatus,
  PERMISSIONS,
} from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { LeadsService } from './leads.service'
import { tr } from '../../common/locale'

class CreateLeadDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsString()
  industry?: string

  @IsIn(Object.values(LeadSource))
  source!: LeadSource

  @IsOptional()
  @IsString()
  campaignId?: string

  @IsOptional()
  @IsString()
  remark?: string

  @IsOptional()
  nextFollowAt?: Date

  @IsOptional()
  expectedAmount?: string
}

class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  remark?: string

  @IsOptional()
  nextFollowAt?: Date

  @IsOptional()
  @IsIn(Object.values(LeadStatus))
  status?: LeadStatus
}

class ConvertLeadDto {
  @IsIn(['create_account', 'link_account'])
  mode!: 'create_account' | 'link_account'

  @IsOptional()
  @IsString()
  existingAccountId?: string

  @IsOptional()
  @IsString()
  accountName?: string

  @IsOptional()
  @IsString()
  contactName?: string

  @IsOptional()
  @IsString()
  mobile?: string

  @IsOptional()
  @IsString()
  contactTitle?: string

  @IsOptional()
  createOpportunity?: boolean

  @IsOptional()
  @IsString()
  opportunityName?: string

  @IsOptional()
  @IsString()
  expectedCloseDate?: string

  @IsOptional()
  @IsString()
  amount?: string

  @IsOptional()
  forceCreate?: boolean
}

class ActivityDto {
  @IsIn(Object.values(ActivityType))
  type!: ActivityType

  @IsString()
  @MinLength(1)
  subject!: string

  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  dueAt?: Date
}

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List leads' })
  @Permissions(PERMISSIONS.LEAD_READ)
  async list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('ownerId') ownerId?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    if (exp === 'csv') {
      const csv = await this.leads.listCsv(me, { q, status, ownerId })
      res!.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads_${Date.now()}.csv"`,
      })
      return '﻿' + csv
    }
    return this.leads.list(me, {
      page: Number(page),
      pageSize: Number(pageSize),
      q,
      status,
      ownerId,
    })
  }

  @Get(':id')
  @Permissions(PERMISSIONS.LEAD_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.leads.detail(me, id)
  }

  @Post()
  @Permissions(PERMISSIONS.LEAD_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(me, dto as unknown as Record<string, unknown>)
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.LEAD_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(me, id, dto as unknown as Record<string, unknown>)
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.LEAD_DELETE)
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.leads.remove(me, id)
  }

  @Post(':id/restore')
  @Permissions(PERMISSIONS.LEAD_WRITE)
  restore(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.leads.restore(me, id)
  }

  @Post('batch-assign')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  batchAssign(@CurrentUser() me: AuthUser, @Body() body: { ids: string[]; ownerId: string }) {
    return this.leads.batchAssign(me, body.ids ?? [], body.ownerId)
  }

  @Post('batch-close')
  @Permissions(PERMISSIONS.LEAD_CLOSE)
  batchClose(@CurrentUser() me: AuthUser, @Body() body: { ids: string[]; reason?: string }) {
    return this.leads.batchClose(me, body.ids ?? [], body.reason ?? tr('批量关闭', 'Bulk closed'))
  }

  @Post('batch-recycle')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  batchRecycle(@CurrentUser() me: AuthUser, @Body() body: { ids: string[]; reason?: string }) {
    return this.leads.batchRecycle(me, body.ids ?? [], body.reason)
  }

  @Post(':id/assign')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  assign(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: { ownerId: string }) {
    return this.leads.assign(me, id, body.ownerId)
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close lead' })
  @Permissions(PERMISSIONS.LEAD_CLOSE)
  close(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: { reason: string }) {
    if (!body?.reason) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'reason required')
    return this.leads.close(me, id, body.reason)
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert lead to account/contact/opp' })
  @Permissions(PERMISSIONS.LEAD_CONVERT)
  convert(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @Req() req: { headers: Record<string, string | undefined> },
  ) {
    return this.leads.convert(me, id, dto as never, req.headers['idempotency-key'])
  }

  @Get(':id/activities')
  @Permissions(PERMISSIONS.LEAD_READ)
  activities(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.leads.activities(me, id)
  }

  @Post(':id/activities')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  addActivity(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ActivityDto) {
    return this.leads.addActivity(me, id, dto)
  }
}
