import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator'
import { PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { OpportunitiesService } from './opportunities.service'

class CreateOpportunityDto {
  /** 币种（3 位代码），不填为本位币 */
  @IsOptional()
  @IsString()
  currency?: string

  @IsString()
  @MinLength(1)
  name!: string

  @IsString()
  accountId!: string

  @IsOptional()
  @IsString()
  primaryContactId?: string

  @IsOptional()
  @IsString()
  amount?: string

  @IsString()
  expectedCloseDate!: string

  @IsOptional()
  @IsString()
  stageCode?: string

  @IsOptional()
  @IsString()
  nextStep?: string

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsString()
  competitor?: string

  @IsOptional()
  @IsString()
  description?: string
}

class UpdateOpportunityDto {
  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  amount?: string

  @IsOptional()
  @IsString()
  expectedCloseDate?: string

  @IsOptional()
  @IsString()
  nextStep?: string

  @IsOptional()
  @IsString()
  competitor?: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  winRate?: number

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number

  @IsOptional()
  customValues?: Record<string, unknown>
}

class StageDto {
  @IsString()
  stageId!: string

  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  winRate?: number
}

class CloseLostDto {
  @IsString()
  @MinLength(1)
  closeReason!: string

  @IsOptional()
  @IsString()
  note?: string
}

@ApiTags('opportunities')
@Controller()
export class OpportunitiesController {
  constructor(private readonly opps: OpportunitiesService) {}

  @Get('pipelines')
  @Permissions(PERMISSIONS.PIPELINE_READ)
  pipelines(@CurrentUser() me: AuthUser) {
    return this.opps.pipelines(me)
  }

  @Get('boards/pipeline')
  @Permissions(PERMISSIONS.OPPORTUNITY_READ)
  board(@CurrentUser() me: AuthUser, @Query('ownerId') ownerId?: string) {
    return this.opps.board(me, ownerId)
  }

  @Get('opportunities/forecast')
  @Permissions(PERMISSIONS.OPPORTUNITY_FORECAST)
  forecast(@CurrentUser() me: AuthUser, @Query('month') month?: string) {
    return this.opps.forecast(me, month)
  }

  @Get('opportunities/forecast-commits')
  @Permissions(PERMISSIONS.OPPORTUNITY_FORECAST)
  forecastCommits(@CurrentUser() me: AuthUser, @Query('month') month?: string) {
    return this.opps.forecastCommits(me, month)
  }

  @Post('opportunities/forecast-commit')
  @Permissions(PERMISSIONS.OPPORTUNITY_FORECAST)
  forecastCommit(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      month?: string
      commitAmount?: string
      bestAmount?: string
      worstAmount?: string
      note?: string
    },
  ) {
    return this.opps.forecastCommit(me, body)
  }

  @Get('opportunities/:id/battlecard')
  @Permissions(PERMISSIONS.OPPORTUNITY_READ)
  battlecard(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.opps.battlecard(me, id)
  }

  @Put('opportunities/:id/battlecard')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  saveBattlecard(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.opps.saveBattlecard(me, id, body)
  }

  @Get('opportunities')
  @Permissions(PERMISSIONS.OPPORTUNITY_READ)
  async list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('q') q?: string,
    @Query('stageId') stageId?: string,
    @Query('accountId') accountId?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: { set: (h: Record<string, string>) => void },
  ) {
    if (exp === 'csv') {
      const rows = await this.opps.list(me, {
        page: 1,
        pageSize: 5000,
        q,
        stageId,
        accountId,
      })
      const items = rows.items as Array<Record<string, unknown>>
      const header = ['name', 'amount', 'winRate', 'expectedCloseDate', 'stage']
      const csv = [
        header.join(','),
        ...items.map((r) => {
          const stage = (r.stage as { name?: string } | undefined)?.name ?? ''
          return [
            `"${String(r.name ?? '').replace(/"/g, '""')}"`,
            `"${String(r.amount ?? '')}"`,
            `"${String(r.winRate ?? '')}"`,
            `"${(() => {
              const d = r.expectedCloseDate
              if (!d) return ''
              if (d instanceof Date) return d.toISOString().slice(0, 10)
              return String(d).slice(0, 10)
            })()}"`,
            `"${stage}"`,
          ].join(',')
        }),
      ].join('\n')
      res?.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="opportunities_${Date.now()}.csv"`,
      })
      return '﻿' + csv
    }
    return this.opps.list(me, {
      page: Number(page),
      pageSize: Number(pageSize),
      q,
      stageId,
      accountId,
    })
  }

  @Get('opportunities/:id')
  @Permissions(PERMISSIONS.OPPORTUNITY_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.opps.detail(me, id)
  }

  @Post('opportunities')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateOpportunityDto) {
    return this.opps.create(me, dto as unknown as Record<string, unknown>)
  }

  @Patch('opportunities/:id')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.opps.update(me, id, dto as unknown as Record<string, unknown>)
  }

  @Post('opportunities/batch-stage')
  @Permissions(PERMISSIONS.OPPORTUNITY_UPDATE_STAGE)
  batchStage(@CurrentUser() me: AuthUser, @Body() body: { ids: string[]; stageId: string; note?: string }) {
    return this.opps.batchUpdateStage(me, body.ids ?? [], body.stageId, body.note)
  }

  @Patch('opportunities/:id/stage')
  @Permissions(PERMISSIONS.OPPORTUNITY_UPDATE_STAGE)
  updateStage(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: StageDto) {
    return this.opps.updateStage(me, id, dto)
  }

  @Post('opportunities/:id/close-won')
  @Permissions(PERMISSIONS.OPPORTUNITY_CLOSE)
  closeWon(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.opps.closeWon(me, id)
  }

  @Post('opportunities/:id/close-lost')
  @Permissions(PERMISSIONS.OPPORTUNITY_CLOSE)
  closeLost(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: CloseLostDto) {
    return this.opps.closeLost(me, id, dto)
  }

  @Post('opportunities/:id/members')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  addMember(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { userId: string; role?: string },
  ) {
    return this.opps.addMember(me, id, body.userId, body.role)
  }

  @Delete('opportunities/:id/members/:userId')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  removeMember(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.opps.removeMember(me, id, userId)
  }

  @Delete('opportunities/:id')
  @Permissions(PERMISSIONS.OPPORTUNITY_DELETE)
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.opps.remove(me, id)
  }
}
