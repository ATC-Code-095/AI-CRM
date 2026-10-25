import { Body, Controller, Get, Param, Post, Put, Query, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { ReportsService } from './reports.service'

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales-funnel')
  @Permissions(PERMISSIONS.REPORT_READ)
  async funnel(
    @CurrentUser() me: AuthUser,
    @Res({ passthrough: true }) res?: { set: (h: Record<string, string>) => void },
    @Query('export') exp?: string,
  ) {
    const rows = await this.reports.funnel(me)
    if (exp === 'csv') {
      const header = ['code', 'name', 'count', 'amount', 'weightedAmount']
      const csv = [
        header.join(','),
        ...rows.map((r: Record<string, unknown>) =>
          header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','),
        ),
      ].join('\n')
      res?.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sales-funnel_${Date.now()}.csv"`,
      })
      return '﻿' + csv
    }
    return rows
  }

  @Get('owner-performance')
  @Permissions(PERMISSIONS.REPORT_READ)
  async ownerPerformance(
    @CurrentUser() me: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: { set: (h: Record<string, string>) => void },
  ) {
    const rows = await this.reports.ownerPerformance(me, from, to)
    if (exp === 'csv') {
      const header = ['name', 'newLeads', 'oppCount', 'wonAmount', 'openAmount', 'contractAmount', 'receivedAmount']
      const csv = [header.join(','), ...rows.map((r: Record<string, unknown>) => header.map((h) => `"${String(r[h] ?? '')}"`).join(','))].join('\n')
      res?.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="owner-performance_${Date.now()}.csv"`,
      })
      return '\ufeff' + csv
    }
    return rows
  }

  @Get('revenue-trend')
  @Permissions(PERMISSIONS.REPORT_READ)
  revenueTrend(@CurrentUser() me: AuthUser, @Query('months') months = '6') {
    return this.reports.revenueTrend(me, Number(months))
  }

  @Get('quota-waterfall')
  @Permissions(PERMISSIONS.REPORT_READ)
  quotaWaterfall(@CurrentUser() me: AuthUser, @Query('period') period?: string) {
    return this.reports.quotaWaterfall(me, period)
  }

  @Get('goal-attainment')
  @Permissions(PERMISSIONS.REPORT_READ)
  goalAttainment(@CurrentUser() me: AuthUser, @Query('periodKey') periodKey?: string) {
    return this.reports.goalAttainment(me, periodKey)
  }

  @Get('dashboard')
  @Permissions(PERMISSIONS.REPORT_READ)
  dashboard(@CurrentUser() me: AuthUser) {
    return this.reports.dashboard(me)
  }

  @Get('contract-expiring')
  @Permissions(PERMISSIONS.REPORT_READ)
  async contractExpiring(@CurrentUser() me: AuthUser, @Query('days') days = '30') {
    return this.reports.contractExpiring(me, Number(days))
  }

  @Get('weekly-brief')
  @Permissions(PERMISSIONS.REPORT_READ)
  async weeklyBrief(@CurrentUser() me: AuthUser) {
    return this.reports.weeklyBrief(me)
  }

  @Get('sales-leaderboard')
  @Permissions(PERMISSIONS.REPORT_READ)
  salesLeaderboard(@CurrentUser() me: AuthUser, @Query('days') days = '30') {
    return this.reports.salesLeaderboard(me, Number(days))
  }

  @Get('payment-forecast')
  @Permissions(PERMISSIONS.REPORT_READ)
  paymentForecast(@CurrentUser() me: AuthUser, @Query('days') days = '90') {
    return this.reports.paymentForecast(me, Number(days))
  }

  @Get('smart-reminders')
  @Permissions(PERMISSIONS.REPORT_READ)
  smartReminders(@CurrentUser() me: AuthUser) {
    return this.reports.smartReminders(me)
  }


  @Get('loss-analysis')
  @Permissions(PERMISSIONS.REPORT_READ)
  lossAnalysis(@CurrentUser() me: AuthUser, @Query('days') days = '90') {
    return this.reports.lossAnalysis(me, Number(days))
  }

  @Get('care-reminders')
  @Permissions(PERMISSIONS.REPORT_READ)
  careReminders(@CurrentUser() me: AuthUser) {
    return this.reports.careReminders(me)
  }


  @Get('sales-cycle')
  @Permissions(PERMISSIONS.REPORT_READ)
  salesCycle(@CurrentUser() me: AuthUser, @Query('days') days = '90') {
    return this.reports.salesCycle(me, Number(days))
  }

  @Get('revisit-plan')
  @Permissions(PERMISSIONS.REPORT_READ)
  revisitPlan(@CurrentUser() me: AuthUser, @Query('days') days = '30') {
    return this.reports.revisitPlan(me, Number(days))
  }

  @Post('outreach')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  outreachBatch(
    @CurrentUser() me: AuthUser,
    @Body() body: { accountIds?: string[]; template?: string; days?: number },
  ) {
    return this.reports.outreachBatch(me, body ?? {})
  }


  @Get('goal-breakdown')
  @Permissions(PERMISSIONS.REPORT_READ)
  goalBreakdown(@CurrentUser() me: AuthUser, @Query('year') year?: string) {
    return this.reports.goalBreakdown(me, year ? Number(year) : new Date().getFullYear())
  }


  @Get('payment-aging')
  @Permissions(PERMISSIONS.REPORT_READ)
  paymentAging(@CurrentUser() me: AuthUser) {
    return this.reports.paymentAging(me)
  }

  @Get('sales-brief')
  @Permissions(PERMISSIONS.REPORT_READ)
  salesBrief(@CurrentUser() me: AuthUser) {
    return this.reports.salesBrief(me)
  }

  @Post('sales-brief/share')
  @Permissions(PERMISSIONS.REPORT_READ)
  shareBrief(
    @CurrentUser() me: AuthUser,
    @Body() body: { userIds?: string[]; note?: string },
  ) {
    return this.reports.shareBrief(me, body ?? {})
  }


  @Get('account-health/:accountId')
  @Permissions(PERMISSIONS.REPORT_READ)
  accountHealth(@CurrentUser() me: AuthUser, @Param('accountId') accountId: string) {
    return this.reports.accountHealth(me, accountId)
  }

  @Post('account-health/:accountId/intervene')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  healthIntervene(
    @CurrentUser() me: AuthUser,
    @Param('accountId') accountId: string,
    @Body() body: { action: string; note?: string },
  ) {
    return this.reports.healthIntervene(me, accountId, body?.action, body?.note)
  }

  @Get('at-risk-accounts')
  @Permissions(PERMISSIONS.REPORT_READ)
  atRiskAccounts(@CurrentUser() me: AuthUser, @Query('limit') limit?: string) {
    return this.reports.atRiskAccounts(me, limit ? Number(limit) : 15)
  }


  @Get('customer-rfm')
  @Permissions(PERMISSIONS.REPORT_READ)
  customerRfm(@CurrentUser() me: AuthUser) {
    return this.reports.customerRfm(me)
  }

  @Get('followup-efficiency')
  @Permissions(PERMISSIONS.REPORT_READ)
  followupEfficiency(@CurrentUser() me: AuthUser) {
    return this.reports.followupEfficiency(me)
  }

  @Get('stage-velocity')
  @Permissions(PERMISSIONS.REPORT_READ)
  stageVelocity(@CurrentUser() me: AuthUser) {
    return this.reports.stageVelocity(me)
  }

  @Get('deal-gantt')
  @Permissions(PERMISSIONS.REPORT_READ)
  dealGantt(@CurrentUser() me: AuthUser, @Query('limit') limit?: string) {
    return this.reports.dealGantt(me, limit ? Number(limit) : 8)
  }

  @Get('source-analysis')
  @Permissions(PERMISSIONS.REPORT_READ)
  sourceAnalysis(@CurrentUser() me: AuthUser) {
    return this.reports.sourceAnalysis(me)
  }

  @Get('lifecycle-distribution')
  @Permissions(PERMISSIONS.REPORT_READ)
  lifecycleDistribution(@CurrentUser() me: AuthUser) {
    return this.reports.lifecycleDistribution(me)
  }

  @Get('competitor-analysis')
  @Permissions(PERMISSIONS.REPORT_READ)
  competitorAnalysis(@CurrentUser() me: AuthUser) {
    return this.reports.competitorAnalysis(me)
  }

  @Get('daily-report')
  @Permissions(PERMISSIONS.REPORT_READ)
  dailyReport(@CurrentUser() me: AuthUser) {
    return this.reports.dailyReport(me)
  }

  @Get('forecast-accuracy')
  @Permissions(PERMISSIONS.REPORT_READ)
  forecastAccuracy(@CurrentUser() me: AuthUser) {
    return this.reports.forecastAccuracy(me)
  }

  @Get('commission')
  @Permissions(PERMISSIONS.REPORT_READ)
  async commission(
    @CurrentUser() me: AuthUser,
    @Query('periodKey') periodKey?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: { set: (h: Record<string, string>) => void },
  ) {
    const rows = await this.reports.commission(me, periodKey)
    if (exp !== 'csv') return rows
    const header = ['name', 'receivedAmount', 'rate', 'commission', 'paymentCount', 'status']
    const body = rows.rows as Array<Record<string, unknown>>
    const csv = [
      header.join(','),
      ...body.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    res?.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="commission_${rows.periodKey}.csv"`,
    })
    return '﻿' + csv
  }

  @Get('commission/rules')
  @Permissions(PERMISSIONS.REPORT_READ)
  commissionRules(@CurrentUser() me: AuthUser) {
    return this.reports.commissionRules(me)
  }

  @Put('commission/rules')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  saveCommissionRules(
    @CurrentUser() me: AuthUser,
    @Body() body: { tiers: Array<{ min: number; max: number | null; rate: number }> },
  ) {
    return this.reports.saveCommissionRules(me, body?.tiers ?? [])
  }

  @Post('commission/payout')
  @Permissions(PERMISSIONS.PAYMENT_CONFIRM)
  commissionPayout(
    @CurrentUser() me: AuthUser,
    @Body() body: { periodKey?: string; userId: string; status: string; note?: string },
  ) {
    return this.reports.commissionPayout(me, body)
  }

  @Get('win-review')
  @Permissions(PERMISSIONS.REPORT_READ)
  winReview(@CurrentUser() me: AuthUser, @Query('days') days?: string) {
    return this.reports.winReview(me, days ? Number(days) : 90)
  }

  @Get('cash-funnel')
  @Permissions(PERMISSIONS.REPORT_READ)
  cashFunnel(@CurrentUser() me: AuthUser) {
    return this.reports.cashFunnel(me)
  }

  @Get('touchpoint-calendar')
  @Permissions(PERMISSIONS.REPORT_READ)
  touchpointCalendar(@CurrentUser() me: AuthUser, @Query('month') month?: string) {
    return this.reports.touchpointCalendar(me, month)
  }

  @Get('tag-cloud')
  @Permissions(PERMISSIONS.REPORT_READ)
  tagCloud(@CurrentUser() me: AuthUser) {
    return this.reports.tagCloud(me)
  }

  @Get('sales-coach/:opportunityId')
  @Permissions(PERMISSIONS.REPORT_READ)
  salesCoach(
    @CurrentUser() me: AuthUser,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.reports.salesCoach(me, opportunityId)
  }

  @Get('entity-timeline/:entityType/:entityId')
  @Permissions(PERMISSIONS.REPORT_READ)
  entityTimeline(
    @CurrentUser() me: AuthUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.reports.entityTimeline(me, entityType, entityId)
  }

  @Post('next-actions')
  @Permissions(PERMISSIONS.REPORT_READ)
  nextActions(
    @CurrentUser() me: AuthUser,
    @Body() body: { opportunityId?: string; accountId?: string },
  ) {
    return this.reports.nextActions(me, body)
  }

  @Get('forecast-board')
  @Permissions(PERMISSIONS.REPORT_READ)
  forecastBoard(@CurrentUser() me: AuthUser) {
    return this.reports.forecastBoard(me)
  }

  @Get('score-board')
  @Permissions(PERMISSIONS.REPORT_READ)
  scoreBoard(@CurrentUser() me: AuthUser, @Query('limit') limit?: string) {
    return this.reports.scoreBoard(me, limit ? Number(limit) : 20)
  }

  @Get('opportunity-score/:opportunityId')
  @Permissions(PERMISSIONS.REPORT_READ)
  opportunityScore(
    @CurrentUser() me: AuthUser,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.reports.opportunityScore(me, opportunityId)
  }

  @Get('renewal-board')
  @Permissions(PERMISSIONS.REPORT_READ)
  renewalBoard(@CurrentUser() me: AuthUser, @Query('days') days?: string) {
    return this.reports.renewalBoard(me, days ? Number(days) : 90)
  }

  @Get('funnel-health')
  @Permissions(PERMISSIONS.REPORT_READ)
  funnelHealth(@CurrentUser() me: AuthUser) {
    return this.reports.funnelHealth(me)
  }

  @Get('funnel-health-trend')
  @Permissions(PERMISSIONS.REPORT_READ)
  funnelHealthTrend(@CurrentUser() me: AuthUser) {
    return this.reports.funnelHealthTrend(me)
  }

  @Get('funnel-alerts')
  @Permissions(PERMISSIONS.REPORT_READ)
  funnelAlerts(@CurrentUser() me: AuthUser) {
    return this.reports.funnelAlerts(me)
  }

  @Get('health-trend/:accountId')
  @Permissions(PERMISSIONS.REPORT_READ)
  healthTrend(@CurrentUser() me: AuthUser, @Param('accountId') accountId: string) {
    return this.reports.healthTrend(me, accountId)
  }

  @Get('team-health-trend')
  @Permissions(PERMISSIONS.REPORT_READ)
  teamHealthTrend(@CurrentUser() me: AuthUser) {
    return this.reports.teamHealthTrend(me)
  }

  @Get('stage-conversion')
  @Permissions(PERMISSIONS.REPORT_READ)
  stageConversion(@CurrentUser() me: AuthUser, @Query('days') days?: string) {
    return this.reports.stageConversion(me, days ? Number(days) : 90)
  }

  @Get('region-performance')
  @Permissions(PERMISSIONS.REPORT_READ)
  regionPerformance(@CurrentUser() me: AuthUser) {
    return this.reports.regionPerformance(me)
  }

  @Get('forecast-bias')
  @Permissions(PERMISSIONS.REPORT_READ)
  forecastBias(@CurrentUser() me: AuthUser, @Query('month') month?: string) {
    return this.reports.forecastBias(me, month)
  }

  @Get('renewal-forecast')
  @Permissions(PERMISSIONS.REPORT_READ)
  renewalForecast(@CurrentUser() me: AuthUser, @Query('days') days?: string) {
    return this.reports.renewalForecast(me, days ? Number(days) : 90)
  }

  @Get('data-quality')
  @Permissions(PERMISSIONS.REPORT_READ)
  dataQuality(@CurrentUser() me: AuthUser) {
    return this.reports.dataQuality(me)
  }

  @Get('battlecard-board')
  @Permissions(PERMISSIONS.REPORT_READ)
  battlecardBoard(@CurrentUser() me: AuthUser) {
    return this.reports.battlecardBoard(me)
  }

  @Get('health-intervention-queue')
  @Permissions(PERMISSIONS.REPORT_READ)
  healthInterventionQueue(@CurrentUser() me: AuthUser, @Query('limit') limit?: string) {
    return this.reports.healthInterventionQueue(me, limit ? Number(limit) : 15)
  }

  @Get('api-usage')
  @Permissions(PERMISSIONS.REPORT_READ)
  apiUsage() {
    return this.reports.apiUsage()
  }

  /** 菜单徽标：各模块待办数量 */
  @Get('menu-badges')
  @Permissions(PERMISSIONS.REPORT_READ)
  menuBadges(@CurrentUser() me: AuthUser) {
    return this.reports.menuBadges(me)
  }

  /** 合同到期分层提醒：7/30/90 天 */
  @Get('contract-expiry-layers')
  @Permissions(PERMISSIONS.REPORT_READ)
  contractExpiryLayers(@CurrentUser() me: AuthUser) {
    return this.reports.contractExpiryLayers(me)
  }

  @Get('success-automation')
  @Permissions(PERMISSIONS.REPORT_READ)
  successAutomation(@CurrentUser() me: AuthUser) {
    return this.reports.successAutomation(me)
  }

  @Get('brief-subscribe')
  @Permissions(PERMISSIONS.REPORT_READ)
  getBriefSubscribe(@CurrentUser() me: AuthUser) {
    return this.reports.getBriefSubscribe(me)
  }

  @Post('brief-subscribe')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  saveBriefSubscribe(@CurrentUser() me: AuthUser, @Body() body: Record<string, unknown>) {
    return this.reports.saveBriefSubscribe(me, body ?? {})
  }

  @Get('approval-flow')
  @Permissions(PERMISSIONS.REPORT_READ)
  approvalFlow(@CurrentUser() me: AuthUser, @Query('quoteId') quoteId?: string) {
    return this.reports.approvalFlow(me, quoteId)
  }
}
