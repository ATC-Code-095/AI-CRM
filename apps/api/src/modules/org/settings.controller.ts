import { Body, Controller, Get, Patch, Put, Query } from '@nestjs/common'
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator'
import { BizException, ErrorCodes, PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'

class UpdateSettingDto {
  @IsString()
  @MinLength(1)
  key!: string

  @IsOptional()
  value?: unknown
}

class RenewalPlaybookDto {
  @IsOptional()
  @IsString()
  accountId?: string

  @IsObject()
  steps!: Record<string, boolean>
}

/** 可经通用 PATCH /settings 读写的配置键（docs/13 §4 + 已上线的功能开关与阈值） */
const EDITABLE_KEYS = new Set([
  'i18n.default_locale',
  'discount_approval_threshold',
  'contract_approval_amount',
  'amount_approval_threshold',
  'lead.assign_rule',
  'lead.assign_on_create',
  'file.max_size_mb',
  'form.rate_limit_per_ip_min',
  'quote.no_prefix',
  'contract.no_prefix',
  'payment.no_prefix',
  'ticket.no_prefix',
  'opportunity.default_pipeline_code',
  'session.refresh_ttl_days',
  'commission.rate',
  'partner.commission.rate',
  'feature.webhooks',
  'feature.checkin',
  'feature.import',
])

/** 有专用接口维护（含校验）的配置：可在列表中查看，但不能经通用接口改写 */
const READONLY_KEYS = new Set([
  'lead.assign_cursor',
  'commission.rules',
  'brief.subscribe',
  'group.approval.rules',
  'group.brief.subscribe',
  'group.alert.schedule',
])

@Controller('settings')
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  async list(@CurrentUser() me: AuthUser) {
    // 只返回配置项：业务数据已迁至正式表，含密钥的配置（如 esign.provider）走专用接口脱敏返回
    const rows = await this.prisma.setting.findMany({
      where: { tenantId: me.tenantId, scope: 'TENANT', key: { in: [...EDITABLE_KEYS, ...READONLY_KEYS] } },
      orderBy: { key: 'asc' },
    })
    // 功能开关默认值
    const defaults = [
      { key: 'feature.webhooks', value: true },
      { key: 'feature.checkin', value: true },
      { key: 'feature.import', value: true },
    ]
    const map = new Map(rows.map((r) => [r.key, r]))
    for (const d of defaults) {
      if (!map.has(d.key)) {
        rows.push({
          id: `default-${d.key}`,
          tenantId: me.tenantId,
          key: d.key,
          value: d.value as never,
          scope: 'TENANT',
          userId: null,
          updatedAt: new Date(),
        })
      }
    }
    return rows
  }

  /** 续约剧本进度 */
  @Get('renewal-playbook')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async getRenewalPlaybook(@CurrentUser() me: AuthUser, @Query('accountId') accountId?: string) {
    const row = await this.prisma.playbookProgress.findFirst({ where: this.playbookWhere(me, accountId) })
    return { accountId: accountId ?? null, steps: (row?.steps as Record<string, boolean>) ?? {} }
  }

  @Put('renewal-playbook')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  async saveRenewalPlaybook(@CurrentUser() me: AuthUser, @Body() dto: RenewalPlaybookDto) {
    if (dto.accountId) {
      const account = await this.prisma.account.findFirst({
        where: { id: dto.accountId, tenantId: me.tenantId, deletedAt: null },
        select: { id: true },
      })
      if (!account) throw new BizException(ErrorCodes.NOT_FOUND, 'account not found')
    }
    const steps = Object.fromEntries(
      Object.entries(dto.steps).map(([k, v]) => [k, Boolean(v)]),
    )
    const where = this.playbookWhere(me, dto.accountId)
    const existing = await this.prisma.playbookProgress.findFirst({ where })
    const row = existing
      ? await this.prisma.playbookProgress.update({ where: { id: existing.id }, data: { steps } })
      : await this.prisma.playbookProgress.create({ data: { ...where, steps } })
    return { accountId: dto.accountId ?? null, steps: row.steps }
  }

  /** 有 accountId 时租户共享该客户进度；否则为用户自己的全局剧本 */
  private playbookWhere(me: AuthUser, accountId?: string) {
    return accountId
      ? { tenantId: me.tenantId, accountId, userId: null }
      : { tenantId: me.tenantId, accountId: null, userId: me.id }
  }


  @Patch()
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async update(@CurrentUser() me: AuthUser, @Body() dto: UpdateSettingDto) {
    if (!EDITABLE_KEYS.has(dto.key)) {
      throw new BizException(ErrorCodes.NOT_FOUND, `unknown setting key: ${dto.key}`)
    }
    const existing = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, scope: 'TENANT', key: dto.key },
    })
    if (existing) {
      return this.prisma.setting.update({
        where: { id: existing.id },
        data: { value: dto.value as never },
      })
    }
    return this.prisma.setting.create({
      data: {
        tenantId: me.tenantId,
        scope: 'TENANT',
        key: dto.key,
        value: dto.value as never,
      },
    })
  }
}
