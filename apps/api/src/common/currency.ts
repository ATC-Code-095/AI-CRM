import { BizException, ErrorCodes } from '@zhixiao-crm/shared'
import type { Prisma, PrismaClient } from '@prisma/client'
import { tr } from './locale'

/** 本位币设置键（Setting, scope TENANT）；数据库触发器 crm_base_currency() 读同一个键 */
export const BASE_CURRENCY_KEY = 'currency.base'
export const DEFAULT_BASE_CURRENCY = 'CNY'

type Db = PrismaClient | Prisma.TransactionClient

export function normalizeCurrency(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

export async function getBaseCurrency(db: Db, tenantId: string): Promise<string> {
  const row = await db.setting.findFirst({ where: { tenantId, key: BASE_CURRENCY_KEY, scope: 'TENANT' } })
  const v = typeof row?.value === 'string' ? row.value : ''
  return normalizeCurrency(v) || DEFAULT_BASE_CURRENCY
}

/**
 * 单据币种：未指定用本位币；外币必须已录入汇率，否则报 422（避免按 1:1 误折算）。
 */
export async function resolveCurrency(db: Db, tenantId: string, requested?: unknown): Promise<string> {
  const base = await getBaseCurrency(db, tenantId)
  const cur = normalizeCurrency(requested) || base
  if (!/^[A-Z]{3}$/.test(cur)) {
    throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('币种需为 3 位字母代码，如 USD', 'Currency must be a 3-letter code such as USD'))
  }
  if (cur === base) return cur
  const rate = await db.exchangeRate.findFirst({ where: { tenantId, currency: cur }, select: { id: true } })
  if (!rate) {
    throw new BizException(
      ErrorCodes.UNPROCESSABLE,
      tr(
        `币种 ${cur} 尚未设置汇率，请先在 系统设置 → 多币种 中录入`,
        `No exchange rate for ${cur} yet. Add one under Settings → Currencies first.`,
      ),
    )
  }
  return cur
}

/**
 * 报表用的「本位币视图」：读取金额字段时返回折算后的本位币金额（字段名不变）。
 * 跨单据汇总、排名、业绩、佣金都应通过它读取；单张单据的详情仍用原币金额。
 * 数据库聚合（_sum / orderBy）不经过它，需直接使用 *Base 字段。
 */
export function baseView(prisma: PrismaClient) {
  return prisma.$extends({
    name: 'base-currency-view',
    result: {
      opportunity: {
        amount: { needs: { amountBase: true }, compute: (o) => o.amountBase },
      },
      quote: {
        total: { needs: { totalBase: true }, compute: (q) => q.totalBase },
      },
      contract: {
        total: { needs: { totalBase: true }, compute: (c) => c.totalBase },
        receivedAmount: { needs: { receivedAmountBase: true }, compute: (c) => c.receivedAmountBase },
      },
      payment: {
        amount: { needs: { amountBase: true }, compute: (p) => p.amountBase },
      },
      paymentPlan: {
        amount: { needs: { amountBase: true }, compute: (p) => p.amountBase },
        receivedAmount: { needs: { receivedAmountBase: true }, compute: (p) => p.receivedAmountBase },
      },
    },
  })
}

export type BaseViewClient = ReturnType<typeof baseView>
