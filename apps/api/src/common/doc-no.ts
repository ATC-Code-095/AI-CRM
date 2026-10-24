import { Prisma } from '@prisma/client'
import { PrismaService } from './prisma/prisma.service'

export type DbClient = PrismaService | Prisma.TransactionClient

/** 可在业务参数中改前缀的单据：默认前缀 → 配置键 */
const PREFIX_KEYS: Record<string, string> = {
  QT: 'quote.no_prefix',
  HT: 'contract.no_prefix',
  SK: 'payment.no_prefix',
  GD: 'ticket.no_prefix',
}

/** 单号：前缀 + yyyyMMdd + 4 位日序列。前缀优先取业务参数（1–8 位字母数字或短横线），否则用默认前缀 */
export async function nextDocNo(
  prisma: DbClient,
  tenantId: string,
  defaultPrefix: string,
): Promise<string> {
  let prefix = defaultPrefix
  const key = PREFIX_KEYS[defaultPrefix]
  if (key) {
    const row = await prisma.setting.findFirst({ where: { tenantId, scope: 'TENANT', key, userId: null } })
    const configured = row?.value === null || row?.value === undefined ? '' : String(row.value).trim()
    if (/^[A-Za-z0-9-]{1,8}$/.test(configured)) prefix = configured
  }
  const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const row = await prisma.docSequence.upsert({
    where: {
      tenantId_prefix_dayKey: { tenantId, prefix, dayKey },
    },
    update: { current: { increment: 1 } },
    create: { tenantId, prefix, dayKey, current: 1 },
  })
  return `${prefix}${dayKey}${String(row.current).padStart(4, '0')}`
}
