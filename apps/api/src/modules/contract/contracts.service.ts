import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import {
  BizException,
  ErrorCodes,
  PageResult,
  addMoney,
  parseMoney,
} from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { nextDocNo } from '../../common/doc-no'
import { assertVersion } from '../../common/optimistic'
import { idempotentGuard, idempotentStore } from '../../common/idempotency'
import { writeAudit } from '../../common/audit'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { entityVisibleAccountIds, withEntityScope } from '../../common/entity-scope'
import { WebhooksService } from '../platform/webhooks.service'
import { toChangeOrder, toInvoice, toSeal } from './contract-docs.mapper'
import { settingText, tenantSetting } from '../../common/tenant-setting'
import { type ApprovalStepRule, prismaApproverLookup, resolveApproverChain } from '../workflow/approver-chain'
import { tr } from '../../common/locale'
import { resolveCurrency } from '../../common/currency'

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly push: PushService,
  ) {}

  async list(me: AuthUser, page: number, pageSize: number, accountId?: string): Promise<PageResult<unknown>> {
    const base = {
      tenantId: me.tenantId,
      deletedAt: null,
      ...(accountId ? { accountId } : {}),
    }
    const visibleIds = await entityVisibleAccountIds(this.prisma, me.tenantId, me.id)
    const where = withEntityScope(base as Record<string, unknown>, visibleIds) as never
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { createdAt: 'desc' },
        include: { account: { select: { id: true, name: true } } },
      }),
    ])
    return { items, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  async detail(me: AuthUser, id: string) {
    const c = await this.prisma.contract.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            shortName: true,
            phone: true,
            address: true,
            accountNo: true,
          },
        },
        lines: { orderBy: { sortOrder: 'asc' } },
        plans: { orderBy: { seq: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })
    if (!c) throw new BizException(ErrorCodes.NOT_FOUND, 'contract not found')
    const owner = await this.prisma.user.findFirst({
      where: { id: c.ownerId },
      select: { id: true, name: true, phone: true, email: true, title: true },
    })
    return { ...c, owner }
  }

  async updateMeta(
    me: AuthUser,
    id: string,
    body: { title?: string; terms?: string; templateId?: string },
  ) {
    await this.detail(me, id)
    const templateId =
      body.templateId === undefined ? undefined : await this.ownTemplateId(this.prisma, me, body.templateId)
    return this.prisma.contract.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.terms !== undefined ? { terms: body.terms } : {}),
        ...(templateId !== undefined ? { templateId } : {}),
        updatedById: me.id,
      },
    })
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    const row = await this.prisma.$transaction(async (tx) => {
      const contractNo = await nextDocNo(tx, me.tenantId, 'HT')
      const oppCurrency = data.opportunityId
        ? (await tx.opportunity.findFirst({ where: { id: String(data.opportunityId), tenantId: me.tenantId }, select: { currency: true } }))?.currency
        : undefined
      const currency = await resolveCurrency(tx, me.tenantId, data.currency || oppCurrency)
      const row = await tx.contract.create({
        data: {
          tenantId: me.tenantId,
          contractNo,
          title: data.title as string,
          accountId: data.accountId as string,
          opportunityId: (data.opportunityId as string) ?? null,
          status: 'DRAFT',
          total: '0',
          receivedAmount: '0',
          currency,
          ownerId: me.id,
          terms: (data.terms as string) ?? null,
          projectId: await this.ownProjectId(tx, me, data.projectId),
          templateId: await this.ownTemplateId(tx, me, data.templateId),
          createdById: me.id,
          updatedById: me.id,
        },
      })
      await writeAudit(tx, {
        tenantId: me.tenantId,
        userId: me.id,
        action: 'CREATE',
        entity: 'CONTRACT',
        entityId: row.id,
        after: { contractNo: row.contractNo, title: row.title },
      })
      return row
    })
    return row
  }

  /** 项目制：校验项目属于本租户后返回 projectId */
  private async ownProjectId(tx: Prisma.TransactionClient, me: AuthUser, projectId: unknown) {
    if (!projectId) return null
    const p = await tx.project.findFirst({
      where: { id: String(projectId), tenantId: me.tenantId, deletedAt: null },
      select: { id: true },
    })
    if (!p) throw new BizException(ErrorCodes.NOT_FOUND, 'project not found')
    return p.id
  }

  /** 合同模板须属于本租户；空值表示解除关联 */
  private async ownTemplateId(db: Prisma.TransactionClient | PrismaService, me: AuthUser, templateId: unknown) {
    if (!templateId) return null
    const t = await db.docTemplate.findFirst({
      where: { id: String(templateId), tenantId: me.tenantId, kind: 'CONTRACT', deletedAt: null },
      select: { id: true },
    })
    if (!t) throw new BizException(ErrorCodes.NOT_FOUND, 'template not found')
    return t.id
  }

  /** 锁定合同行，串行化同一合同的开票/变更等金额校验 */
  private async lockContract(tx: Prisma.TransactionClient, me: AuthUser, id: string) {
    const rows = await tx.$queryRaw<{ id: string; total: Prisma.Decimal; contractNo: string }[]>`
      SELECT id, total, "contractNo" FROM "Contract"
      WHERE id = ${id} AND "tenantId" = ${me.tenantId} AND "deletedAt" IS NULL
      FOR UPDATE`
    if (!rows.length) throw new BizException(ErrorCodes.NOT_FOUND, 'contract not found')
    return rows[0]
  }

  /** 批量删除草稿合同 */
  async batchDelete(me: AuthUser, ids: string[]) {
    const res = await this.prisma.contract.updateMany({
      where: {
        id: { in: ids },
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['DRAFT', 'REJECTED'] },
      },
      data: { deletedAt: new Date(), deletedById: me.id },
    })
    return { ok: res.count, failed: ids.length - res.count }
  }

  /** 批量发起电子签 */
  async batchRequestSign(me: AuthUser, ids: string[]) {
    let ok = 0
    for (const id of ids) {
      try {
        await this.requestSign(me, id)
        ok++
      } catch {
        /* 状态不允许则跳过 */
      }
    }
    return { ok, failed: ids.length - ok }
  }

  /** 续签工作台：按到期分桶统计 + 列表 */
  /** 电子签进度看板：待签 / 单方已签 / 双方已签 */
  async eSignBoard(me: AuthUser) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        status: { in: ['DRAFT', 'APPROVING', 'EFFECTIVE'] },
      },
      take: 200,
      orderBy: { updatedAt: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    })
    const items = contracts.map((c) => {
      const logs = String(c.remark ?? '')
        .split(' | ')
        .filter((x) => x.startsWith('esign:'))
      const signedA = logs.some((x) => x.startsWith('esign:A:'))
      const signedB = logs.some((x) => x.startsWith('esign:B:'))
      return {
        id: c.id,
        contractNo: c.contractNo,
        title: c.title,
        status: c.status,
        total: String(c.total),
        account: c.account,
        signedA,
        signedB,
        bothSigned: signedA && signedB,
        logs,
      }
    })
    return {
      buckets: {
        pending: items.filter((x) => !x.signedA && !x.signedB).length,
        partial: items.filter((x) => (x.signedA || x.signedB) && !x.bothSigned).length,
        done: items.filter((x) => x.bothSigned).length,
      },
      items,
    }
  }

  async renewalPipeline(me: AuthUser) {
    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 86400000)
    const in60 = new Date(now.getTime() + 60 * 86400000)
    const in90 = new Date(now.getTime() + 90 * 86400000)
    const base = {
      tenantId: me.tenantId,
      deletedAt: null,
      status: 'EFFECTIVE',
      expireDate: { not: null as unknown as undefined },
    }
    const select = {
      id: true,
      contractNo: true,
      title: true,
      expireDate: true,
      total: true,
      receivedAmount: true,
      ownerId: true,
      account: { select: { id: true, name: true } },
    } as const
    const [overdue, d30, d60, d90] = await Promise.all([
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { lt: now } },
        orderBy: { expireDate: 'asc' },
        take: 50,
        select,
      }),
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { gte: now, lte: in30 } },
        orderBy: { expireDate: 'asc' },
        take: 50,
        select,
      }),
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { gt: in30, lte: in60 } },
        orderBy: { expireDate: 'asc' },
        take: 50,
        select,
      }),
      this.prisma.contract.findMany({
        where: { ...base, expireDate: { gt: in60, lte: in90 } },
        orderBy: { expireDate: 'asc' },
        take: 50,
        select,
      }),
    ])
    return {
      buckets: {
        overdue: overdue.length,
        d30: d30.length,
        d60: d60.length,
        d90: d90.length,
      },
      items: [
        ...overdue.map((x) => ({ ...x, bucket: 'OVERDUE' as const })),
        ...d30.map((x) => ({ ...x, bucket: 'D30' as const })),
        ...d60.map((x) => ({ ...x, bucket: 'D60' as const })),
        ...d90.map((x) => ({ ...x, bucket: 'D90' as const })),
      ],
    }
  }

  /** 一键续签：生成新合同草稿（复制行项目，日期顺延） */
  async renew(me: AuthUser, id: string, opts: { withQuote?: boolean } = {}) {
    const c = await this.detail(me, id)
    const contractNo = await nextDocNo(this.prisma, me.tenantId, 'HT')
    const expire = c.expireDate ? new Date(c.expireDate) : new Date()
    const newStart = expire
    const newEnd = new Date(expire.getTime() + 365 * 86400000)
    const row = await this.prisma.contract.create({
      data: {
        tenantId: me.tenantId,
        contractNo,
        title: tr(`${c.title}（续签）`, `${c.title} (renewal)`),
        accountId: c.accountId,
        status: 'DRAFT',
        signDate: null,
        effectiveDate: newStart,
        expireDate: newEnd,
        total: c.total,
        receivedAmount: '0',
        currency: c.currency,
        ownerId: me.id,
        terms: c.terms,
        remark: tr(`续签自 ${c.contractNo}`, `Renewed from ${c.contractNo}`),
        createdById: me.id,
        updatedById: me.id,
      },
    })
    if (c.lines?.length) {
      await this.prisma.contractLine.createMany({
        data: c.lines.map((l, i) => ({
          tenantId: me.tenantId,
          contractId: row.id,
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountRate: l.discountRate,
          amount: l.amount,
          sortOrder: i,
        })),
      })
    }
    // 可选：同时生成续签报价
    let quote: { id: string; quoteNo: string } | null = null
    if (opts.withQuote) {
      const quoteNo = await nextDocNo(this.prisma, me.tenantId, 'QT')
      const q = await this.prisma.quote.create({
        data: {
          tenantId: me.tenantId,
          quoteNo,
          accountId: c.accountId,
          subject: tr(`${c.title}（续签报价）`, `${c.title} (renewal quote)`),
          status: 'DRAFT',
          currency: c.currency,
          subtotal: c.total,
          discountAmount: '0',
          taxAmount: '0',
          total: c.total,
          terms: c.terms,
          remark: tr(`续签报价，对应合同 ${c.contractNo}`, `Renewal quote for contract ${c.contractNo}`),
          ownerId: me.id,
          createdById: me.id,
          updatedById: me.id,
        },
      })
      if (c.lines?.length) {
        await this.prisma.quoteLine.createMany({
          data: c.lines.map((l, i) => ({
            tenantId: me.tenantId,
            quoteId: q.id,
            productId: l.productId,
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            discountRate: l.discountRate,
            amount: l.amount,
            sortOrder: i,
          })),
        })
      }
      quote = { id: q.id, quoteNo: q.quoteNo }
    }
    return { ...row, quote }
  }

  /** 发票管理 */
  async listInvoices(me: AuthUser, contractId?: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { tenantId: me.tenantId, ...(contractId ? { contractId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    return { items: rows.map(toInvoice), total: rows.length }
  }

  /** 三方对账：合同额 / 已开票 / 已回款，输出差异与预警级别 */
  async invoiceReconcile(me: AuthUser, onlyIssues = false) {
    const [contracts, invoices, payments] = await Promise.all([
      this.prisma.contract.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        select: {
          id: true,
          contractNo: true,
          title: true,
          status: true,
          total: true,
          receivedAmount: true,
          currency: true,
          totalBase: true,
          account: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.invoice.findMany({
        where: { tenantId: me.tenantId, status: 'ISSUED' },
        select: { contractId: true, amount: true },
      }),
      this.prisma.payment.findMany({
        where: {
          tenantId: me.tenantId,
          deletedAt: null,
          status: { in: ['CONFIRMED', 'RECONCILED'] },
        },
        select: { contractId: true, amount: true },
      }),
    ])
    const invByContract = new Map<string, number>()
    const invCountByContract = new Map<string, number>()
    for (const inv of invoices) {
      const key = inv.contractId
      invByContract.set(key, (invByContract.get(key) ?? 0) + Number(inv.amount))
      invCountByContract.set(key, (invCountByContract.get(key) ?? 0) + 1)
    }
    const payByContract = new Map<string, number>()
    for (const p of payments) {
      payByContract.set(p.contractId, (payByContract.get(p.contractId) ?? 0) + Number(p.amount))
    }

    const rows = contracts.map((c) => {
      const total = Number(c.total)
      const invoiced = invByContract.get(c.id) ?? 0
      const received = payByContract.get(c.id) ?? Number(c.receivedAmount)
      const pendingInvoice = total - invoiced
      const pendingPayment = total - received
      const invoicePayGap = invoiced - received
      const flags: string[] = []
      if (invoiced > total + 0.01) flags.push('OVER_INVOICED')
      if (received > total + 0.01) flags.push('OVER_RECEIVED')
      if (received > 0.01 && invoiced <= 0.01) flags.push('NO_INVOICE')
      if (invoiced > received + 0.01 && c.status === 'EFFECTIVE') flags.push('INVOICE_AHEAD')
      if (received > invoiced + 0.01) flags.push('PAY_AHEAD')
      if (Math.abs(invoicePayGap) > 0.01 && c.status === 'FINISHED' && pendingInvoice > 0.01) {
        flags.push('CLOSED_UNDER_INVOICE')
      }
      const level = flags.length === 0 ? 'OK' : flags.some((f) => f.startsWith('OVER_') || f === 'NO_INVOICE') ? 'RISK' : 'WARN'
      return {
        contractId: c.id,
        contractNo: c.contractNo,
        title: c.title,
        accountName: c.account?.name ?? '',
        status: c.status,
        currency: c.currency,
        /** 合同折算率（本位币 / 原币），用于汇总 */
        baseRate: total > 0 ? Number(c.totalBase) / total : 1,
        contractTotal: total.toFixed(2),
        invoicedAmount: invoiced.toFixed(2),
        receivedAmount: received.toFixed(2),
        pendingInvoice: pendingInvoice.toFixed(2),
        pendingPayment: pendingPayment.toFixed(2),
        invoicePayGap: invoicePayGap.toFixed(2),
        invoiceCount: invCountByContract.get(c.id) ?? 0,
        flags,
        level,
      }
    })
    const issues = rows.filter((r) => r.flags.length > 0)
    const summary = {
      totalContracts: rows.length,
      issueCount: issues.length,
      riskCount: issues.filter((r) => r.level === 'RISK').length,
      warnCount: issues.filter((r) => r.level === 'WARN').length,
      // 各行是合同原币；汇总按合同折算率换成本位币
      contractTotal: rows.reduce((a, r) => a + Number(r.contractTotal) * r.baseRate, 0).toFixed(2),
      invoicedAmount: rows.reduce((a, r) => a + Number(r.invoicedAmount) * r.baseRate, 0).toFixed(2),
      receivedAmount: rows.reduce((a, r) => a + Number(r.receivedAmount) * r.baseRate, 0).toFixed(2),
      gap: rows
        .reduce((a, r) => a + (Number(r.invoicedAmount) - Number(r.receivedAmount)) * r.baseRate, 0)
        .toFixed(2),
    }
    return {
      summary,
      items: onlyIssues ? issues : rows,
      total: (onlyIssues ? issues : rows).length,
    }
  }

  /** 发票状态流转：仅已开具的发票可作废 / 红冲（终态不可恢复，避免累计开票超额） */
  async updateInvoiceStatus(
    me: AuthUser,
    id: string,
    status: 'VOID' | 'REVERSED' | 'ISSUED',
    remark?: string,
  ) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId: me.tenantId } })
    if (!inv) throw new BizException(ErrorCodes.NOT_FOUND, 'invoice not found')
    if (status !== 'VOID' && status !== 'REVERSED') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'status must be VOID or REVERSED')
    }
    const done = await this.prisma.invoice.updateMany({
      where: { id, status: 'ISSUED' },
      data: {
        status,
        remark: remark ? [inv.remark, remark].filter(Boolean).join(' | ') : undefined,
        updatedById: me.id,
        updatedByName: me.name ?? me.email,
      },
    })
    if (!done.count) throw new BizException(ErrorCodes.CONFLICT, `cannot change from ${inv.status}`)
    return toInvoice(await this.prisma.invoice.findUniqueOrThrow({ where: { id } }))
  }

  async createInvoice(
    me: AuthUser,
    body: {
      contractId: string
      invoiceNo: string
      amount: string
      type?: string
      remark?: string
    },
  ) {
    await this.detail(me, body.contractId)
    const invAmount = Number(body.amount)
    if (!isFinite(invAmount) || invAmount <= 0) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('发票金额必须大于 0', 'Invoice amount must be greater than 0'))
    }
    if (!body.invoiceNo?.trim()) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('发票号必填', 'Invoice number is required'))
    }
    // 锁合同后核对已开票累计，并发开票不会超额
    const row = await this.prisma.$transaction(async (tx) => {
      const c = await this.lockContract(tx, me, body.contractId)
      const total = Number(c.total)
      if (invAmount > total + 0.001) {
        throw new BizException(ErrorCodes.UNPROCESSABLE, tr('发票金额不能超过合同总额', 'Invoice amount cannot exceed the contract total'))
      }
      const agg = await tx.invoice.aggregate({
        where: { tenantId: me.tenantId, contractId: body.contractId, status: 'ISSUED' },
        _sum: { amount: true },
      })
      const issued = Number(agg._sum.amount ?? 0)
      if (issued + invAmount > total + 0.001) {
        throw new BizException(
          ErrorCodes.UNPROCESSABLE,
          tr(
            `累计开票将超合同总额（已开 ${issued.toFixed(2)} + 本次 ${invAmount.toFixed(2)} > ${total.toFixed(2)}）`,
            `Total invoiced would exceed the contract total (issued ${issued.toFixed(2)} + this ${invAmount.toFixed(2)} > ${total.toFixed(2)})`,
          ),
        )
      }
      return tx.invoice.create({
        data: {
          tenantId: me.tenantId,
          contractId: body.contractId,
          contractNo: c.contractNo,
          invoiceNo: body.invoiceNo.trim(),
          amount: invAmount.toFixed(2),
          type: body.type ?? 'VAT_SPECIAL',
          remark: body.remark ?? '',
          createdById: me.id,
          createdByName: me.name ?? me.email,
        },
      })
    })
    return toInvoice(row)
  }

  /** 合同变更单 */
  async listChangeOrders(me: AuthUser, contractId?: string) {
    const rows = await this.prisma.contractChangeOrder.findMany({
      where: { tenantId: me.tenantId, ...(contractId ? { contractId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    return { items: rows.map(toChangeOrder), total: rows.length }
  }

  async createChangeOrder(
    me: AuthUser,
    body: { contractId: string; title: string; reason: string; amountDelta?: string },
  ) {
    const c = await this.detail(me, body.contractId)
    const delta = Number(body.amountDelta ?? 0)
    if (!isFinite(delta)) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('金额变化必须是数字', 'Amount change must be a number'))
    }
    if (Number(c.total) + delta < 0) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('变更后合同总额不能为负', 'Contract total cannot be negative after the change'))
    }
    const row = await this.prisma.contractChangeOrder.create({
      data: {
        tenantId: me.tenantId,
        contractId: body.contractId,
        contractNo: c.contractNo,
        title: body.title,
        reason: body.reason ?? '',
        amountDelta: delta.toFixed(2),
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toChangeOrder(row)
  }

  /** 变更单决策：仅待审批可决策；通过时与合同总额调整在同一事务内完成 */
  async approveChangeOrder(me: AuthUser, id: string, action: 'APPROVE' | 'REJECT') {
    if (action !== 'APPROVE' && action !== 'REJECT') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'action invalid')
    }
    const co = await this.prisma.contractChangeOrder.findFirst({ where: { id, tenantId: me.tenantId } })
    if (!co) throw new BizException(ErrorCodes.NOT_FOUND, 'change order not found')
    const row = await this.prisma.$transaction(async (tx) => {
      const done = await tx.contractChangeOrder.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decidedById: me.id,
          decidedByName: me.name ?? me.email,
          decidedAt: new Date(),
        },
      })
      if (!done.count) throw new BizException(ErrorCodes.CONFLICT, `cannot decide from ${co.status}`)
      const delta = Number(co.amountDelta)
      if (action === 'APPROVE' && delta !== 0) {
        const c = await this.lockContract(tx, me, co.contractId)
        const newTotal = Number(c.total) + delta
        if (newTotal < 0) {
          throw new BizException(ErrorCodes.UNPROCESSABLE, tr('变更后合同总额不能为负', 'Contract total cannot be negative after the change'))
        }
        const current = await tx.contract.findUniqueOrThrow({ where: { id: c.id }, select: { remark: true } })
        await tx.contract.update({
          where: { id: c.id },
          data: {
            total: newTotal.toFixed(2),
            remark: [current.remark, `${tr('变更单', 'Change order')} ${co.title} ${delta > 0 ? '+' : ''}${delta}`]
              .filter(Boolean)
              .join(' | '),
            updatedById: me.id,
          },
        })
      }
      return tx.contractChangeOrder.findUniqueOrThrow({ where: { id } })
    })
    return toChangeOrder(row)
  }

  /**
   * 生效。合同额 ≥ contract_approval_amount（默认 10 万；设为 0 关闭）且审批流 CONTRACT_AMOUNT 启用时，
   * 先进入审批（状态 APPROVING），全部审批通过后由审批服务置为生效；否则直接生效。
   */
  async effective(me: AuthUser, id: string) {
    const c = await this.detail(me, id)
    if (c.status === 'APPROVING') {
      throw new BizException(ErrorCodes.CONFLICT, 'contract is waiting approval')
    }
    // 被驳回的合同修改后可重新提交（金额达标时会再次进入审批）
    if (c.status !== 'DRAFT' && c.status !== 'REJECTED') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot effective from ${c.status}`)
    }
    const raw = settingText(await tenantSetting(this.prisma, me.tenantId, 'contract_approval_amount'))
    const threshold = raw === '' || Number.isNaN(Number(raw)) ? 100000 : Number(raw)
    if (threshold > 0 && Number(c.total) >= threshold) {
      const started = await this.startAmountApproval(me, c, threshold)
      if (started) return started
    }
    return this.prisma.contract.update({
      where: { id },
      data: {
        status: 'EFFECTIVE',
        signDate: c.signDate ?? new Date(),
        effectiveDate: c.effectiveDate ?? new Date(),
        updatedById: me.id,
      },
    })
  }

  /** 发起合同金额审批；审批流被停用时返回 null（直接生效） */
  private async startAmountApproval(
    me: AuthUser,
    c: { id: string; contractNo: string; total: unknown; title?: string | null },
    threshold: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const steps: ApprovalStepRule[] = [
        { type: 'MANAGER', levels: 1 },
        { type: 'MANAGER', levels: 2 },
      ]
      const def =
        (await tx.approvalDefinition.findFirst({ where: { tenantId: me.tenantId, code: 'CONTRACT_AMOUNT' } })) ??
        (await tx.approvalDefinition.create({
          data: {
            tenantId: me.tenantId,
            code: 'CONTRACT_AMOUNT',
            name: tr('合同金额审批', 'Contract amount approval'),
            entityType: 'CONTRACT',
            rules: { when: { all: [{ op: '>=', field: 'total', value: threshold }] }, steps } as never,
            isActive: true,
          },
        }))
      if (!def.isActive) return null
      const rules = ((def.rules as { steps?: ApprovalStepRule[] } | null)?.steps ?? steps) as ApprovalStepRule[]
      const approvers = await resolveApproverChain(prismaApproverLookup(tx, me.tenantId), me.id, rules)
      if (!approvers.length) {
        throw new BizException(
          ErrorCodes.UNPROCESSABLE,
          tr(
            '找不到可用的审批人：请为申请人设置上级，或再添加一位超级管理员（申请人不能审批自己提交的合同）',
            'No approver available: set a manager for the applicant or add another super admin (applicants cannot approve their own contracts)',
          ),
        )
      }
      const total = Number(c.total)
      await tx.approvalInstance.create({
        data: {
          tenantId: me.tenantId,
          definitionId: def.id,
          entityType: 'CONTRACT',
          entityId: c.id,
          status: 'PENDING',
          currentStep: 0,
          applicantId: me.id,
          snapshot: { contractNo: c.contractNo, total, reason: tr(`合同额 ${total.toFixed(0)} ≥ ${threshold}`, `Contract amount ${total.toFixed(0)} ≥ ${threshold}`) } as never,
          steps: { create: approvers.map((aid, stepIndex) => ({ stepIndex, approverId: aid, action: null })) },
        },
      })
      await this.push.notify(
        me.tenantId,
        approvers[0],
        'APPROVAL_TODO',
        { zh: '您有新的审批待办', en: 'New approval waiting for you' },
        {
          zh: `合同 ${c.contractNo} 生效审批（合同额 ${total.toFixed(0)}）`,
          en: `Contract ${c.contractNo} activation approval (amount ${total.toFixed(0)})`,
        },
        'CONTRACT',
        c.id,
        tx,
      )
      return tx.contract.update({ where: { id: c.id }, data: { status: 'APPROVING', updatedById: me.id } })
    })
  }

  async terminate(me: AuthUser, id: string, reason?: string) {
    const c = await this.detail(me, id)
    if (c.status !== 'EFFECTIVE' && c.status !== 'FINISHED') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot terminate from ${c.status}`)
    }
    return this.prisma.contract.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        remark: reason ? [c.remark, reason].filter(Boolean).join(' | ') : c.remark,
        updatedById: me.id,
      },
    })
  }

  /** 发起电子签：标记待签署（占位流程，可对接 e签宝/法大大） */
  async requestSign(me: AuthUser, id: string) {
    const c = await this.detail(me, id)
    if (c.status === 'FINISHED' || c.status === 'TERMINATED') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot request sign from ${c.status}`)
    }
    const marker = `esign:PENDING@${new Date().toISOString()}`
    return this.prisma.contract.update({
      where: { id },
      data: {
        remark: [c.remark, marker].filter(Boolean).join(' | '),
        updatedById: me.id,
      },
    })
  }

  /** 确认电子签完成：写入签约日并生效 */
  async confirmSign(me: AuthUser, id: string) {
    const c = await this.detail(me, id)
    if (c.status !== 'DRAFT' && c.status !== 'APPROVING') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot confirm sign from ${c.status}`)
    }
    const marker = `esign:SIGNED@${new Date().toISOString()}`
    return this.prisma.contract.update({
      where: { id },
      data: {
        status: 'EFFECTIVE',
        signDate: new Date(),
        effectiveDate: c.effectiveDate ?? new Date(),
        remark: [c.remark, marker].filter(Boolean).join(' | '),
        updatedById: me.id,
      },
    })
  }

  /** 印章库 */
  async listSeals(me: AuthUser) {
    const rows = await this.prisma.eSignSeal.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { createdAt: 'asc' },
    })
    return { items: rows.map(toSeal), total: rows.length }
  }

  async createSeal(me: AuthUser, body: { name: string; type?: string; party?: string }) {
    if (!body.name?.trim()) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'name required')
    const row = await this.prisma.eSignSeal.create({
      data: {
        tenantId: me.tenantId,
        name: body.name.trim(),
        type: ['COMPANY', 'CONTRACT', 'FINANCE', 'PERSONAL'].includes(String(body.type))
          ? String(body.type)
          : 'COMPANY',
        party: body.party === 'A' ? 'A' : 'B',
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return toSeal(row)
  }

  /** 电子签：甲/乙方用印，双方完成后自动生效；已生效合同允许补盖章 */
  async eSign(me: AuthUser, id: string, body: { party: 'A' | 'B'; sealName?: string }) {
    const c = await this.detail(me, id)
    // 仅关闭态禁止用印；EFFECTIVE 允许补盖章
    if (c.status === 'FINISHED' || c.status === 'TERMINATED') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot esign from ${c.status}`)
    }
    const party = body.party === 'A' ? 'A' : 'B'
    const sealName = body.sealName ?? (party === 'A' ? tr('甲方合同章', 'Party A contract seal') : tr('乙方合同章', 'Party B contract seal'))
    const ts = new Date().toISOString()
    const marker = `esign:${party}:${sealName}@${ts}`

    // 解析既有用印记录
    const remarkParts = String(c.remark ?? '').split(' | ').filter(Boolean)
    const sealLogs = remarkParts.filter((x) => x.startsWith('esign:'))
    const doneParties = new Set(
      sealLogs.map((x) => x.split(':')[1]).filter((p) => p === 'A' || p === 'B'),
    )
    doneParties.add(party)
    const bothSigned = doneParties.has('A') && doneParties.has('B')

    return this.prisma.contract.update({
      where: { id },
      data: {
        remark: [...remarkParts.filter((x) => !x.startsWith(`esign:${party}:`)), marker].join(' | '),
        ...(bothSigned
          ? {
              status: 'EFFECTIVE',
              signDate: c.signDate ?? new Date(),
              effectiveDate: c.effectiveDate ?? new Date(),
            }
          : {}),
        updatedById: me.id,
      },
    })
  }

  /** 电子签服务商配置 */
  async getEsignProvider(me: AuthUser) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'esign.provider', scope: 'TENANT' },
    })
    const v = (row?.value ?? {}) as Record<string, unknown>
    return {
      provider: v.provider ?? 'BUILTIN',
      appId: v.appId ?? '',
      // 脱敏：不回传完整 secret
      appSecretSet: !!v.appSecret,
      orgId: v.orgId ?? '',
      callbackUrl: v.callbackUrl ?? '',
      enabled: v.enabled !== false,
      // 服务商能力说明
      capabilities:
        v.provider === 'EQB'
          ? [tr('实名认证', 'Identity verification'), tr('企业印章', 'Company seal'), tr('多方签署', 'Multi-party signing'), tr('存证出证', 'Evidence certificate')]
          : v.provider === 'FADADA'
            ? [tr('实名认证', 'Identity verification'), tr('电子签章', 'E-signature'), tr('合同存证', 'Contract evidence'), tr('司法鉴定', 'Judicial appraisal')]
            : [tr('本地用印', 'Local seal'), tr('双方签署', 'Two-party signing'), tr('状态跟踪', 'Status tracking')],
    }
  }

  async setEsignProvider(
    me: AuthUser,
    body: {
      provider: 'BUILTIN' | 'EQB' | 'FADADA'
      appId?: string
      appSecret?: string
      orgId?: string
      callbackUrl?: string
      enabled?: boolean
    },
  ) {
    const row = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'esign.provider', scope: 'TENANT' },
    })
    const prev = (row?.value ?? {}) as Record<string, unknown>
    const next = {
      provider: body.provider ?? 'BUILTIN',
      appId: body.appId ?? prev.appId ?? '',
      appSecret: body.appSecret ?? prev.appSecret ?? '',
      orgId: body.orgId ?? prev.orgId ?? '',
      callbackUrl: body.callbackUrl ?? prev.callbackUrl ?? '',
      enabled: body.enabled !== false,
      updatedAt: new Date().toISOString(),
      updatedBy: me.name ?? me.email,
    }
    if (row) {
      await this.prisma.setting.update({ where: { id: row.id }, data: { value: next as never } })
    } else {
      await this.prisma.setting.create({
        data: {
          tenantId: me.tenantId,
          key: 'esign.provider',
          scope: 'TENANT',
          value: next as never,
        },
      })
    }
    return this.getEsignProvider(me)
  }

  /** 电子签进度：甲/乙方是否已用印 */
  async eSignStatus(me: AuthUser, id: string) {
    const c = await this.detail(me, id)
    const sealLogs = String(c.remark ?? '')
      .split(' | ')
      .filter((x) => x.startsWith('esign:'))
    const parse = (party: 'A' | 'B') => {
      const hit = sealLogs.find((x) => x.startsWith(`esign:${party}:`))
      if (!hit) return { signed: false as const }
      const body = hit.slice('esign:'.length)
      const [p, rest] = body.split(/:(.*)/s)
      const [sealName, at] = (rest ?? '').split('@')
      return {
        signed: true as const,
        party: p,
        sealName: sealName || '',
        at: at || '',
      }
    }
    const a = parse('A')
    const b = parse('B')
    return {
      contractId: id,
      status: c.status,
      a,
      b,
      bothSigned: a.signed && b.signed,
      logs: sealLogs,
    }
  }

  async putLines(me: AuthUser, id: string, lines: Array<Record<string, unknown>>) {
    const c = await this.detail(me, id)
    if (c.status !== 'DRAFT' && c.status !== 'REJECTED') {
      throw new BizException(ErrorCodes.CONFLICT, 'only draft contract can edit lines')
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contractLine.deleteMany({ where: { contractId: id } })
      let total = '0.00'
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        const amount = parseMoney(String(l.amount ?? '0'))
        total = addMoney(total, amount)
        await tx.contractLine.create({
          data: {
            tenantId: me.tenantId,
            contractId: id,
            productId: l.productId as string,
            name: (l.name as string) ?? '',
            qty: (l.qty as string) ?? '1',
            unitPrice: parseMoney(String(l.unitPrice ?? '0')),
            discountRate: (l.discountRate as string) ?? '0',
            amount,
            sortOrder: i,
          },
        })
      }
      await tx.contract.update({
        where: { id },
        data: { total, updatedById: me.id },
      })
    })
    return this.detail(me, id)
  }

  /** 回款计划列表（可按合同/状态过滤） */
  async listPaymentPlans(
    me: AuthUser,
    opts: { contractId?: string; status?: string; overdue?: boolean } = {},
  ) {
    const now = new Date()
    const items = await this.prisma.paymentPlan.findMany({
      where: {
        tenantId: me.tenantId,
        ...(opts.contractId ? { contractId: opts.contractId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.overdue
          ? { dueDate: { lt: now }, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }
          : {}),
      },
      include: {
        contract: { select: { id: true, contractNo: true, title: true, accountId: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 200,
    })
    return {
      items: items.map((p) => ({
        id: p.id,
        seq: p.seq,
        dueDate: p.dueDate,
        amount: String(p.amount),
        receivedAmount: String(p.receivedAmount),
        status: p.status,
        remark: p.remark,
        contractId: p.contractId,
        contractNo: p.contract?.contractNo,
        contractTitle: p.contract?.title,
        isOverdue:
          p.dueDate < now && (p.status === 'PENDING' || p.status === 'PARTIAL' || p.status === 'OVERDUE'),
        dueDays: Math.floor((now.getTime() - p.dueDate.getTime()) / 86400000),
      })),
      total: items.length,
    }
  }

  /** 发起催收：标记备注并通知负责人 */
  async nudgePlan(me: AuthUser, id: string, note?: string) {
    const p = await this.prisma.paymentPlan.findFirst({
      where: { id, tenantId: me.tenantId },
      include: { contract: { select: { ownerId: true, contractNo: true, title: true } } },
    })
    if (!p) throw new BizException(ErrorCodes.NOT_FOUND, 'plan not found')
    await this.prisma.paymentPlan.update({
      where: { id },
      data: {
        remark: [p.remark, `${tr('催收', 'Collection reminder')} ${new Date().toISOString().slice(0, 10)} ${note ?? ''}`]
          .filter(Boolean)
          .join(' | '),
      },
    })
    if (p.contract?.ownerId) {
      await this.push.notify(
        me.tenantId,
        p.contract.ownerId,
        'PAYMENT_NUDGE',
        { zh: '回款催收提醒', en: 'Payment collection reminder' },
        {
          zh: `${p.contract.contractNo}「${p.contract.title}」分期 #${p.seq} 待收 ${p.amount}，请跟进`,
          en: `${p.contract.contractNo} "${p.contract.title}" installment #${p.seq}: ${p.amount} outstanding. Please follow up.`,
        },
        'CONTRACT',
        p.contractId,
      )
    }
    return { ok: true }
  }

  async putPlans(me: AuthUser, id: string, plans: Array<Record<string, unknown>>) {
    const c = await this.detail(me, id)
    if (c.status === 'FINISHED' || c.status === 'TERMINATED') {
      throw new BizException(ErrorCodes.CONFLICT, 'contract closed')
    }
    const sum = plans.reduce((s, p) => addMoney(s, parseMoney(String(p.amount))), '0.00')
    if (Number(sum) > Number(c.total) + 0.001) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'plans exceed contract total')
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.paymentPlan.deleteMany({ where: { contractId: id } })
      for (const p of plans) {
        await tx.paymentPlan.create({
          data: {
            tenantId: me.tenantId,
            contractId: id,
            seq: Number(p.seq),
            dueDate: new Date(p.dueDate as string),
            amount: parseMoney(String(p.amount)),
            receivedAmount: '0',
            status: 'PENDING',
          },
        })
      }
      return this.detail(me, id)
    })
  }

  async payments(me: AuthUser, page: number, pageSize: number, contractId?: string): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      ...(contractId ? { contractId } : {}),
    }
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { paidAt: 'desc' },
        include: {
          contract: { select: { id: true, contractNo: true, title: true } },
          paymentPlan: true,
        },
      }),
    ])
    return { items, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  async createPayment(me: AuthUser, data: Record<string, unknown>, idemKey?: string) {
    const replay = idempotentGuard(me.tenantId, idemKey, data)
    if ('replay' in replay && replay.replay !== undefined) {
      return replay.replay
    }
    const contract = await this.detail(me, data.contractId as string)
    if (contract.status === 'DRAFT') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'contract not effective')
    }
    const amount = parseMoney(String(data.amount))
    const nextReceived = addMoney(String(contract.receivedAmount), amount)
    if (Number(nextReceived) > Number(contract.total) + 0.001) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'payment exceeds contract total')
    }
    return this.prisma.$transaction(async (tx) => {
      const paymentNo = await nextDocNo(tx, me.tenantId, 'SK')
      return tx.payment.create({
        data: {
          tenantId: me.tenantId,
          paymentNo,
          contractId: data.contractId as string,
          paymentPlanId: (data.paymentPlanId as string) ?? null,
          amount,
          paidAt: new Date(data.paidAt as string),
          method: (data.method as string) ?? 'BANK',
          status: 'DRAFT',
          remark: (data.remark as string) ?? null,
          createdById: me.id,
          updatedById: me.id,
        },
      })
    }).then((row) => {
      idempotentStore(me.tenantId, idemKey, data, row)
      return row
    })
  }

  async confirm(me: AuthUser, id: string, version?: number) {
    const pay = await this.prisma.payment.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!pay) throw new BizException(ErrorCodes.NOT_FOUND, 'payment not found')
    if (pay.status !== 'DRAFT' && pay.status !== 'SUBMITTED') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot confirm from ${pay.status}`)
    }
    assertVersion(version, pay.version)
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedById: me.id,
          confirmedAt: new Date(),
          updatedById: me.id,
          version: { increment: 1 },
        },
      })
      await this.recalcContract(tx, pay.contractId)
      await writeAudit(tx, {
        tenantId: me.tenantId,
        userId: me.id,
        action: 'STATUS',
        entity: 'PAYMENT',
        entityId: id,
        before: { status: pay.status },
        after: { status: 'CONFIRMED' },
      })
      void this.webhooks
        .emit(me, 'payment.confirmed', {
          paymentId: id,
          amount: String(pay.amount),
          contractId: pay.contractId,
        })
        .catch(() => undefined)
      return updated
    })
  }

  async reconcile(me: AuthUser, id: string) {
    const pay = await this.prisma.payment.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!pay) throw new BizException(ErrorCodes.NOT_FOUND, 'payment not found')
    if (pay.status === 'RECONCILED') {
      throw new BizException(ErrorCodes.CONFLICT, 'already reconciled')
    }
    if (pay.status !== 'CONFIRMED') {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'confirm payment first')
    }
    if (!pay.paymentPlanId) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'paymentPlanId required for reconcile')
    }

    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.paymentPlan.findFirst({
        where: { id: pay.paymentPlanId!, tenantId: me.tenantId },
      })
      if (!plan) throw new BizException(ErrorCodes.NOT_FOUND, 'plan not found')
      const planReceived = addMoney(String(plan.receivedAmount), String(pay.amount))
      if (Number(planReceived) > Number(plan.amount) + 0.001) {
        throw new BizException(ErrorCodes.UNPROCESSABLE, 'exceeds plan amount')
      }
      const planStatus =
        Number(planReceived) + 0.001 >= Number(plan.amount) ? 'PAID' : 'PARTIAL'
      await tx.paymentPlan.update({
        where: { id: plan.id },
        data: { receivedAmount: planReceived, status: planStatus },
      })
      const updated = await tx.payment.update({
        where: { id },
        data: { status: 'RECONCILED', updatedById: me.id, version: { increment: 1 } },
      })
      await this.recalcContract(tx, pay.contractId)
      return updated
    })
  }

  private async recalcContract(
    tx: Prisma.TransactionClient,
    contractId: string,
  ) {
    const pays = await tx.payment.findMany({
      where: {
        contractId,
        deletedAt: null,
        status: { in: ['CONFIRMED', 'RECONCILED'] },
      },
    })
    const received = pays.reduce((s, p) => addMoney(s, String(p.amount)), '0.00')
    await tx.contract.update({
      where: { id: contractId },
      data: { receivedAmount: received },
    })
  }
}
