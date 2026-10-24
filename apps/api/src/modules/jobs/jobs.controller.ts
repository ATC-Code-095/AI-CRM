import { Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { JobsService } from './jobs.service'

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('payment-plan-overdue')
  @Permissions(PERMISSIONS.PAYMENT_CONFIRM)
  overdue() {
    return this.jobs.runOverdueScan()
  }

  /** 线索自动分配（轮询 ACTIVE 销售） */
  @Post('auto-assign-leads')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  autoAssign(@CurrentUser() me: AuthUser) {
    return this.jobs.autoAssignLeads(me.tenantId)
  }

  /** 合同到期自动生成续费商机 */
  @Post('create-renewal-opps')
  @Permissions(PERMISSIONS.OPPORTUNITY_WRITE)
  renewals(@CurrentUser() me: AuthUser) {
    return this.jobs.createRenewalOpps(me.tenantId)
  }

  /** 跟进超时提醒 */
  @Post('nudge-stale-followups')
  @Permissions(PERMISSIONS.REPORT_READ)
  nudge(@CurrentUser() me: AuthUser) {
    return this.jobs.nudgeStaleFollowups(me.tenantId)
  }

  /** 客户旅程自动化 */
  @Post('journey-automation')
  @Permissions(PERMISSIONS.REPORT_READ)
  journey(@CurrentUser() me: AuthUser) {
    return this.jobs.journeyAutomation(me.tenantId)
  }

  /** 分群自动化调度 */
  @Post('segment-scheduler')
  @Permissions(PERMISSIONS.REPORT_READ)
  segmentScheduler(@CurrentUser() me: AuthUser) {
    return this.jobs.segmentScheduler(me.tenantId)
  }

  /** 销售漏斗自动推进 */
  @Post('funnel-auto-advance')
  @Permissions(PERMISSIONS.OPPORTUNITY_UPDATE_STAGE)
  funnelAuto(@CurrentUser() me: AuthUser) {
    return this.jobs.funnelAutoAdvance(me.tenantId)
  }

  /** 系统健康巡检报告 */
  @Post('health-report')
  @Permissions(PERMISSIONS.REPORT_READ)
  healthReport(@CurrentUser() me: AuthUser) {
    return this.jobs.healthReport(me.tenantId)
  }

  /** 公海自动回收 */
  @Post('pool-auto-recycle')
  @Permissions(PERMISSIONS.LEAD_ASSIGN)
  poolRecycle(@CurrentUser() me: AuthUser) {
    return this.jobs.poolAutoRecycle(me.tenantId)
  }

  /** 合同到期分层通知 */
  @Post('contract-expiry-notify')
  @Permissions(PERMISSIONS.REPORT_READ)
  expiryNotify(@CurrentUser() me: AuthUser) {
    return this.jobs.contractExpiryNotify(me.tenantId)
  }

  /** 接口用量告警 */
  @Post('api-usage-alert')
  @Permissions(PERMISSIONS.REPORT_READ)
  apiUsageAlert() {
    return this.jobs.apiUsageAlert()
  }

  /** 一键跑完当日自动化 */
  @Post('run-daily')
  @Permissions(PERMISSIONS.REPORT_READ)
  async runDaily(@CurrentUser() me: AuthUser) {
    const assign = await this.jobs.autoAssignLeads(me.tenantId)
    const renewals = await this.jobs.createRenewalOpps(me.tenantId)
    const nudge = await this.jobs.nudgeStaleFollowups(me.tenantId)
    const journey = await this.jobs.journeyAutomation(me.tenantId)
    const segments = await this.jobs.segmentScheduler(me.tenantId)
    const pool = await this.jobs.poolAutoRecycle(me.tenantId)
    const expiry = await this.jobs.contractExpiryNotify(me.tenantId)
    const apiAlert = await this.jobs.apiUsageAlert()
    const health = await this.jobs.healthReport(me.tenantId)
    return { assign, renewals, nudge, journey, segments, pool, expiry, apiAlert, health }
  }
}
