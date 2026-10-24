import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { BizException, ErrorCodes } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { BASE_CURRENCY_KEY, getBaseCurrency, normalizeCurrency } from '../../common/currency'
import { tr } from '../../common/locale'
import { PrismaService } from '../../common/prisma/prisma.service'
import { ECB_CURRENCIES, fetchEcbRates } from './ecb-rates'

const AUTO_KEY = 'currency.auto'

export interface AutoRateConfig {
  enabled: boolean
  /** 自动拉取的币种；空表示拉取已录入过汇率的全部币种 */
  currencies: string[]
  lastRunAt?: string
  lastDate?: string
  lastError?: string | null
  lastUpdated?: string[]
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger('Currency')

  constructor(private readonly prisma: PrismaService) {}

  private async autoRow(tenantId: string) {
    return this.prisma.setting.findFirst({ where: { tenantId, key: AUTO_KEY, scope: 'TENANT' } })
  }

  async getAuto(tenantId: string): Promise<AutoRateConfig & { supported: string[] }> {
    const row = await this.autoRow(tenantId)
    const v = (row?.value ?? {}) as Partial<AutoRateConfig>
    return { enabled: Boolean(v.enabled), currencies: v.currencies ?? [], ...v, supported: ECB_CURRENCIES } as AutoRateConfig & { supported: string[] }
  }

  private async putAuto(tenantId: string, value: AutoRateConfig) {
    const row = await this.autoRow(tenantId)
    if (row) await this.prisma.setting.update({ where: { id: row.id }, data: { value: value as never } })
    else await this.prisma.setting.create({ data: { tenantId, key: AUTO_KEY, scope: 'TENANT', value: value as never } })
  }

  async setAuto(me: AuthUser, body: { enabled: boolean; currencies?: string[] }) {
    const base = await getBaseCurrency(this.prisma, me.tenantId)
    if (body.enabled && !ECB_CURRENCIES.includes(base)) {
      throw new BizException(
        ErrorCodes.UNPROCESSABLE,
        tr(`欧洲央行参考汇率不含本位币 ${base}，无法自动更新`, `ECB reference rates don't cover the base currency ${base}`),
      )
    }
    const currencies = [...new Set((body.currencies ?? []).map(normalizeCurrency))].filter((c) => c !== base)
    const unsupported = currencies.filter((c) => !ECB_CURRENCIES.includes(c))
    if (unsupported.length) {
      throw new BizException(
        ErrorCodes.VALIDATION_FAILED,
        tr(`欧洲央行参考汇率不含：${unsupported.join('、')}`, `ECB reference rates don't cover: ${unsupported.join(', ')}`),
      )
    }
    const prev = await this.getAuto(me.tenantId)
    await this.putAuto(me.tenantId, { ...prev, enabled: body.enabled, currencies })
    return this.getAuto(me.tenantId)
  }

  /** 拉取一次并写入汇率表（按欧洲央行公布的日期生效）；失败记录原因，不抛出 */
  async runAuto(tenantId: string, userId?: string) {
    const cfg = await this.getAuto(tenantId)
    const base = await getBaseCurrency(this.prisma, tenantId)
    const existing = await this.prisma.exchangeRate.findMany({ where: { tenantId }, select: { currency: true }, distinct: ['currency'] })
    const wanted = [...new Set([...cfg.currencies, ...existing.map((r) => r.currency)])].filter((c) => ECB_CURRENCIES.includes(c) && c !== base)
    const result: AutoRateConfig = { ...cfg, lastRunAt: new Date().toISOString(), lastError: null, lastUpdated: [] }
    try {
      if (!wanted.length) throw new Error(tr('没有需要更新的币种，请先选择币种', 'No currencies to update; choose currencies first'))
      const { date, rates } = await fetchEcbRates(base, wanted)
      const effectiveDate = new Date(`${date}T00:00:00Z`)
      for (const [currency, rate] of Object.entries(rates)) {
        await this.prisma.exchangeRate.upsert({
          where: { tenantId_currency_effectiveDate: { tenantId, currency, effectiveDate } },
          // 同一天手工录入过的汇率优先，不覆盖
          update: {},
          create: { tenantId, currency, rate: String(rate), effectiveDate, source: 'ECB', createdById: userId ?? null },
        })
      }
      result.lastDate = date
      result.lastUpdated = Object.keys(rates)
    } catch (e) {
      result.lastError = (e as Error).message
      this.logger.warn(`auto rate update failed for ${tenantId}: ${result.lastError}`)
    }
    const { supported: _s, ...persist } = result as AutoRateConfig & { supported?: string[] }
    void _s
    await this.putAuto(tenantId, persist)
    return this.getAuto(tenantId)
  }

  /** 每天 07:30 为开启自动更新的租户拉取一次（欧洲央行约在中欧时间 16:00 发布当日汇率） */
  @Cron('30 7 * * *')
  async dailyAuto() {
    const rows = await this.prisma.setting.findMany({ where: { key: AUTO_KEY, scope: 'TENANT' } })
    for (const r of rows) {
      if ((r.value as Partial<AutoRateConfig> | null)?.enabled) await this.runAuto(r.tenantId)
    }
  }

  /** 本位币 + 每个外币的最新汇率 + 单据中已使用的币种 */
  async overview(me: AuthUser) {
    const base = await getBaseCurrency(this.prisma, me.tenantId)
    const rates = await this.prisma.exchangeRate.findMany({
      where: { tenantId: me.tenantId },
      orderBy: [{ currency: 'asc' }, { effectiveDate: 'desc' }],
    })
    const latest = new Map<string, { rate: string; effectiveDate: string }>()
    for (const r of rates) {
      if (!latest.has(r.currency)) latest.set(r.currency, { rate: String(r.rate), effectiveDate: r.effectiveDate.toISOString().slice(0, 10) })
    }
    return {
      base,
      currencies: [base, ...[...latest.keys()].filter((c) => c !== base)],
      latest: Object.fromEntries(latest),
      rates: rates.map((r) => ({
        id: r.id,
        currency: r.currency,
        rate: String(r.rate),
        effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
        source: r.source,
      })),
    }
  }

  /** 改本位币：只允许在尚未录入汇率、且没有外币单据时（汇率都是相对本位币的） */
  async setBase(me: AuthUser, currency: string) {
    const cur = normalizeCurrency(currency)
    if (!/^[A-Z]{3}$/.test(cur)) throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('币种需为 3 位字母代码', 'Currency must be a 3-letter code'))
    const base = await getBaseCurrency(this.prisma, me.tenantId)
    if (cur === base) return { base }
    const [rates, foreign] = await Promise.all([
      this.prisma.exchangeRate.count({ where: { tenantId: me.tenantId } }),
      Promise.all([
        this.prisma.quote.count({ where: { tenantId: me.tenantId, currency: { notIn: [base, ''] } } }),
        this.prisma.contract.count({ where: { tenantId: me.tenantId, currency: { notIn: [base, ''] } } }),
        this.prisma.opportunity.count({ where: { tenantId: me.tenantId, currency: { notIn: [base, ''] } } }),
      ]).then((n) => n.reduce((a, b) => a + b, 0)),
    ])
    if (rates || foreign) {
      throw new BizException(
        ErrorCodes.CONFLICT,
        tr(
          '已有汇率或外币单据，不能再修改本位币（汇率都相对本位币录入）',
          'Exchange rates or foreign-currency documents already exist, so the base currency can no longer be changed',
        ),
      )
    }
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.setting.findFirst({ where: { tenantId: me.tenantId, key: BASE_CURRENCY_KEY, scope: 'TENANT' } })
      if (row) await tx.setting.update({ where: { id: row.id }, data: { value: cur } })
      else await tx.setting.create({ data: { tenantId: me.tenantId, key: BASE_CURRENCY_KEY, scope: 'TENANT', value: cur } })
      // 现有单据都是旧本位币：统一改成新本位币（金额不变），并重算本位币金额
      await tx.opportunity.updateMany({ where: { tenantId: me.tenantId }, data: { currency: cur } })
      await tx.quote.updateMany({ where: { tenantId: me.tenantId }, data: { currency: cur } })
      await tx.contract.updateMany({ where: { tenantId: me.tenantId }, data: { currency: cur } })
    })
    return { base: cur }
  }

  async addRate(me: AuthUser, body: { currency: string; rate: string | number; effectiveDate: string }) {
    const cur = normalizeCurrency(body.currency)
    const base = await getBaseCurrency(this.prisma, me.tenantId)
    if (!/^[A-Z]{3}$/.test(cur) || cur === base) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('请选择本位币以外的币种', 'Choose a currency other than the base currency'))
    }
    const rate = Number(body.rate)
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('汇率必须大于 0', 'Rate must be greater than 0'))
    }
    const date = new Date(`${String(body.effectiveDate).slice(0, 10)}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('生效日期无效', 'Invalid effective date'))
    }
    return this.prisma.exchangeRate.upsert({
      where: { tenantId_currency_effectiveDate: { tenantId: me.tenantId, currency: cur, effectiveDate: date } },
      update: { rate: String(rate), createdById: me.id },
      create: { tenantId: me.tenantId, currency: cur, rate: String(rate), effectiveDate: date, createdById: me.id },
    })
  }

  async removeRate(me: AuthUser, id: string) {
    const r = await this.prisma.exchangeRate.deleteMany({ where: { id, tenantId: me.tenantId } })
    if (!r.count) throw new BizException(ErrorCodes.NOT_FOUND, 'rate not found')
    return { ok: true }
  }

  /**
   * 按当前汇率表重新折算本租户全部单据的本位币金额（补录或更正汇率后使用）。
   * 写回原金额即触发数据库触发器重算。
   */
  async recompute(me: AuthUser) {
    const t = me.tenantId
    const [opps, quotes, contracts, plans, pays] = await this.prisma.$transaction([
      this.prisma.$executeRaw`UPDATE "Opportunity" SET "amount" = "amount" WHERE "tenantId" = ${t}`,
      this.prisma.$executeRaw`UPDATE "Quote" SET "total" = "total" WHERE "tenantId" = ${t}`,
      this.prisma.$executeRaw`UPDATE "Contract" SET "total" = "total" WHERE "tenantId" = ${t}`,
      this.prisma.$executeRaw`UPDATE "PaymentPlan" SET "amount" = "amount" WHERE "tenantId" = ${t}`,
      this.prisma.$executeRaw`UPDATE "Payment" SET "amount" = "amount" WHERE "tenantId" = ${t}`,
    ])
    return { opportunities: opps, quotes, contracts, paymentPlans: plans, payments: pays }
  }
}
