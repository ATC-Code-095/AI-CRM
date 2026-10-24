import type { ContractChangeOrder, ESignSeal, Invoice } from '@prisma/client'

/** 输出与原 settings JSON 一致的字段结构，前端无需改动 */

export function toInvoice(i: Invoice) {
  return {
    id: i.id,
    contractId: i.contractId,
    contractNo: i.contractNo,
    invoiceNo: i.invoiceNo,
    amount: Number(i.amount).toFixed(2),
    type: i.type,
    status: i.status,
    remark: i.remark,
    createdBy: i.createdByName,
    createdAt: i.createdAt.toISOString(),
    updatedBy: i.updatedByName ?? undefined,
    updatedAt: i.updatedAt.toISOString(),
  }
}

export function toChangeOrder(c: ContractChangeOrder) {
  return {
    id: c.id,
    contractId: c.contractId,
    contractNo: c.contractNo,
    title: c.title,
    reason: c.reason,
    amountDelta: Number(c.amountDelta).toFixed(2),
    status: c.status,
    createdBy: c.createdByName,
    createdAt: c.createdAt.toISOString(),
    decidedBy: c.decidedByName ?? undefined,
    decidedAt: c.decidedAt?.toISOString(),
  }
}

export function toSeal(s: ESignSeal) {
  return {
    id: s.id,
    name: s.name,
    type: s.type,
    party: s.party,
    status: s.status,
    createdBy: s.createdByName,
    createdAt: s.createdAt.toISOString(),
  }
}
