import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString } from 'class-validator'
import { PERMISSIONS, QuoteStatus } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PushService } from '../notify/push.service'
import { ApprovalsService } from './approvals.service'

class ActionDto {
  @IsOptional()
  @IsString()
  comment?: string
}

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly push: PushService,
  ) {}

  /** 催办：给当前审批人发提醒 */
  @Post(':id/urge')
  @Permissions(PERMISSIONS.APPROVAL_READ)
  async urge(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const detail = await this.approvals.detail(me, id)
    const steps = detail.steps as Array<{ stepIndex: number; approverId: string; action: string | null }>
    const current = steps.find((s) => s.stepIndex === detail.currentStep && !s.action)
    if (!current) return { ok: false, message: 'no pending step' }
    await this.push.notify(
      me.tenantId,
      current.approverId,
      'APPROVAL_URGE',
      { zh: '审批催办', en: 'Approval reminder' },
      { zh: '有单据等待你审批，请尽快处理', en: 'A document is waiting for your approval. Please handle it soon.' },
      detail.entityType,
      detail.entityId,
    )
    return { ok: true, to: current.approverId }
  }

  @Get('todo')
  @Permissions(PERMISSIONS.APPROVAL_READ)
  todo(@CurrentUser() me: AuthUser, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.approvals.todo(me, Number(page), Number(pageSize))
  }

  @Get('mine')
  @Permissions(PERMISSIONS.APPROVAL_READ)
  mine(@CurrentUser() me: AuthUser, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.approvals.mine(me, Number(page), Number(pageSize))
  }

  /** 审批流配置（须在 :id 之前注册） */
  @Get('definitions')
  @Permissions(PERMISSIONS.APPROVAL_READ)
  listDefinitions(@CurrentUser() me: AuthUser) {
    return this.approvals.listDefinitions(me)
  }

  @Post('definitions/:id')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  updateDefinition(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; rules?: unknown; threshold?: string },
  ) {
    return this.approvals.updateDefinition(me, id, body)
  }

  @Get(':id')
  @Permissions(PERMISSIONS.APPROVAL_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.approvals.detail(me, id)
  }

  @Post('batch-approve')
  @Permissions(PERMISSIONS.APPROVAL_APPROVE)
  async batchApprove(
    @CurrentUser() me: AuthUser,
    @Body() body: { ids: string[]; action?: 'approve' | 'reject'; comment?: string },
  ) {
    const action = body.action === 'reject' ? 'reject' : 'approve'
    const results: { id: string; ok: boolean; error?: string }[] = []
    for (const id of body.ids ?? []) {
      try {
        if (action === 'reject') {
          await this.approvals.reject(me, id, body.comment)
        } else {
          await this.approvals.approve(me, id, body.comment)
        }
        results.push({ id, ok: true })
      } catch (e) {
        results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return {
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    }
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.APPROVAL_APPROVE)
  approve(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ActionDto) {
    return this.approvals.approve(me, id, dto.comment)
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.APPROVAL_REJECT)
  reject(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ActionDto) {
    return this.approvals.reject(me, id, dto.comment)
  }

  @Post(':id/cancel')
  @Permissions(PERMISSIONS.APPROVAL_CANCEL)
  cancel(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.approvals.cancel(me, id)
  }
}

void QuoteStatus
