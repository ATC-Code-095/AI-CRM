import { Injectable } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import { BizException, ErrorCodes, PageResult, QuoteStatus, addMoney, mulMoney, parseMoney } from '@zhixiao-crm/shared'
import { AuthUser } from '../../common/decorators'
import { nextDocNo } from '../../common/doc-no'
import { assertVersion } from '../../common/optimistic'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { renderFileToHtml } from '../file/render-doc'
import { recordEmailSend } from '../enablement/success.mapper'
import { entityVisibleAccountIds, withEntityScope } from '../../common/entity-scope'
import { type ApprovalStepRule, prismaApproverLookup, resolveApproverChain } from '../workflow/approver-chain'
import { resolveCurrency } from '../../common/currency'
import { tr } from '../../common/locale'

type TemplateKind = 'contract' | 'quote'
const KIND: Record<TemplateKind, string> = { contract: 'CONTRACT', quote: 'QUOTE' }
const TEMPLATE_HISTORY_LIMIT = 10

/** 输出与原 settings JSON 一致的模板结构（列表不含正文与历史，按需走 /content） */
function toTemplate(
  t: Prisma.DocTemplateGetPayload<{ include: { logs: true } }>,
) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    terms: t.terms,
    defaultDuration: t.defaultDuration,
    defaultPayment: t.defaultPayment,
    ...(t.kind === 'QUOTE' ? { lines: t.lines } : {}),
    file: t.file ?? undefined,
    autoParsed: t.autoParsed,
    approveStatus: t.approveStatus ?? undefined,
    approveNote: t.approveNote,
    approveLog: t.logs.map((l) => ({
      action: l.action,
      status: l.status,
      note: l.note,
      by: l.byName,
      at: l.at.toISOString(),
    })),
    approvedBy: t.approvedByName ?? undefined,
    approvedAt: t.approvedAt?.toISOString(),
    published: t.published,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    publishedBy: t.publishedByName ?? undefined,
    createdBy: t.createdByName,
    createdAt: t.createdAt.toISOString(),
  }
}

export interface LineInput {
  productId: string
  name?: string
  qty: string
  unitPrice?: string
  discountRate?: string
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async products(me: AuthUser, page: number, pageSize: number, q?: string): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { code: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { code: 'asc' },
      }),
    ])
    return { items, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  async createProduct(me: AuthUser, data: Record<string, unknown>) {
    return this.prisma.product.create({
      data: {
        tenantId: me.tenantId,
        code: data.code as string,
        name: data.name as string,
        category: (data.category as string) ?? null,
        unit: (data.unit as string) ?? tr('个', 'pcs'),
        standardPrice: parseMoney(String(data.standardPrice ?? '0')),
        cost: data.cost !== undefined && data.cost !== null ? parseMoney(String(data.cost)) : null,
        taxRate: parseMoney(String(data.taxRate ?? '0')),
        isActive: data.isActive !== false,
        description: (data.description as string) ?? null,
        createdById: me.id,
        updatedById: me.id,
      },
    })
  }

  async updateProduct(me: AuthUser, id: string, data: Record<string, unknown>) {
    const p = await this.prisma.product.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!p) throw new BizException(ErrorCodes.NOT_FOUND, 'product not found')
    return this.prisma.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.standardPrice !== undefined
          ? { standardPrice: parseMoney(String(data.standardPrice)) }
          : {}),
        ...(data.cost !== undefined
          ? { cost: data.cost === null || data.cost === '' ? null : parseMoney(String(data.cost)) }
          : {}),
        ...(data.taxRate !== undefined ? { taxRate: parseMoney(String(data.taxRate)) } : {}),
        ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        updatedById: me.id,
      } as never,
    })
  }

  /** 价格手册：产品多价目表价格 */
  async priceBooks(me: AuthUser) {
    const [products, prices] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId: me.tenantId, deletedAt: null },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          category: true,
          unit: true,
          standardPrice: true,
          cost: true,
          taxRate: true,
          isActive: true,
          description: true,
        },
      }),
      this.prisma.productPrice.findMany({
        where: { tenantId: me.tenantId },
        orderBy: { priceBookName: 'asc' },
      }),
    ])
    const bookNames = [...new Set(prices.map((p) => p.priceBookName))]
    return {
      books: bookNames.length ? bookNames : ['standard'],
      products: products.map((p) => {
        const rows = prices.filter((x) => x.productId === p.id)
        return {
          ...p,
          standardPrice: String(p.standardPrice),
          cost: p.cost != null ? String(p.cost) : null,
          taxRate: String(p.taxRate),
          prices: rows.map((r) => ({
            id: r.id,
            priceBookName: r.priceBookName,
            unitPrice: String(r.unitPrice),
            currency: r.currency,
          })),
        }
      }),
    }
  }

  async upsertPrice(
    me: AuthUser,
    productId: string,
    body: { priceBookName: string; unitPrice: string; currency?: string },
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: me.tenantId, deletedAt: null },
    })
    if (!product) throw new BizException(ErrorCodes.NOT_FOUND, 'product not found')
    const priceBookName = body.priceBookName || 'standard'
    const currency = body.currency || 'CNY'
    return this.prisma.productPrice.upsert({
      where: {
        tenantId_productId_priceBookName_currency: {
          tenantId: me.tenantId,
          productId,
          priceBookName,
          currency,
        },
      },
      create: {
        tenantId: me.tenantId,
        productId,
        priceBookName,
        unitPrice: parseMoney(String(body.unitPrice ?? '0')),
        currency,
      },
      update: {
        unitPrice: parseMoney(String(body.unitPrice ?? '0')),
      },
    })
  }

  async removePrice(me: AuthUser, id: string) {
    await this.prisma.productPrice.deleteMany({ where: { id, tenantId: me.tenantId } })
    return { ok: true }
  }

  async quotes(me: AuthUser, page: number, pageSize: number, accountId?: string): Promise<PageResult<unknown>> {
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
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { createdAt: 'desc' },
        include: { lines: true },
      }),
    ])
    const itemsWithAccount = await Promise.all(
      (items as Array<{ accountId: string }>).map(async (it) => {
        const account = await this.prisma.account.findFirst({
          where: { id: it.accountId },
          select: { id: true, name: true },
        })
        return { ...it, account }
      }),
    )
    return { items: itemsWithAccount, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  /** 批量删除草稿报价 */
  async batchDeleteQuotes(me: AuthUser, ids: string[]) {
    const res = await this.prisma.quote.updateMany({
      where: {
        id: { in: ids },
        tenantId: me.tenantId,
        deletedAt: null,
        status: 'DRAFT',
      },
      data: { deletedAt: new Date(), deletedById: me.id },
    })
    return { ok: res.count, failed: ids.length - res.count }
  }

  async quoteDetail(me: AuthUser, id: string) {
    const q = await this.prisma.quote.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      include: {
        opportunity: { select: { id: true, name: true } },
        lines: {
          include: { product: { select: { id: true, code: true } } },
          orderBy: { sortOrder: 'asc' },
        },
        contracts: { select: { id: true, contractNo: true, status: true } },
      },
    })
    if (!q) throw new BizException(ErrorCodes.NOT_FOUND, 'quote not found')
    const account = await this.prisma.account.findFirst({
      where: { id: q.accountId },
      select: {
        id: true,
        name: true,
        shortName: true,
        phone: true,
        address: true,
        website: true,
        accountNo: true,
      },
    })
    const owner = await this.prisma.user.findFirst({
      where: { id: q.ownerId },
      select: { id: true, name: true, phone: true, email: true, title: true },
    })
    return { ...q, account, owner }
  }

  async createQuote(me: AuthUser, data: Record<string, unknown>) {
    const quoteId = await this.prisma.$transaction(async (tx) => {
      let projectId: string | null = null
      if (data.projectId) {
        const project = await tx.project.findFirst({
          where: { id: String(data.projectId), tenantId: me.tenantId, deletedAt: null },
          select: { id: true },
        })
        if (!project) throw new BizException(ErrorCodes.NOT_FOUND, 'project not found')
        projectId = project.id
      }
      const quoteNo = await nextDocNo(tx, me.tenantId, 'QT')
      const oppCurrency = data.opportunityId
        ? (await tx.opportunity.findFirst({ where: { id: String(data.opportunityId), tenantId: me.tenantId }, select: { currency: true } }))?.currency
        : undefined
      const currency = await resolveCurrency(tx, me.tenantId, data.currency || oppCurrency)
      const quote = await tx.quote.create({
        data: {
          tenantId: me.tenantId,
          quoteNo,
          accountId: data.accountId as string,
          opportunityId: (data.opportunityId as string) ?? null,
          subject: data.subject as string,
          status: QuoteStatus.DRAFT,
          currency,
          subtotal: '0',
          discountAmount: '0',
          taxAmount: '0',
          total: '0',
          terms: (data.terms as string) ?? null,
          remark: (data.remark as string) ?? (data.projectName ? `${tr('项目', 'Project')}:${data.projectName}` : null),
          ownerId: me.id,
          projectId,
          createdById: me.id,
          updatedById: me.id,
        },
      })
      const lines = (data.lines as LineInput[]) ?? []
      if (lines.length) {
        await this.replaceLinesTx(tx, me, quote.id, lines)
      }
      return quote.id
    })
    return this.quoteDetail(me, quoteId)
  }

  async replaceLines(me: AuthUser, id: string, lines: LineInput[], version?: number) {
    const quote = await this.quoteDetail(me, id)
    if (quote.status !== QuoteStatus.DRAFT && quote.status !== QuoteStatus.REJECTED) {
      throw new BizException(ErrorCodes.CONFLICT, 'only draft/rejected quote can edit lines')
    }
    assertVersion(version, quote.version)
    const beforeLines = (quote.lines as Array<Record<string, unknown>>).map((l) => ({
      productId: l.productId,
      name: l.name,
      qty: String(l.qty),
      unitPrice: String(l.unitPrice),
      discountRate: String(l.discountRate),
      amount: String(l.amount),
    }))
    await this.prisma.$transaction(async (tx) => {
      await this.replaceLinesTx(tx, me, id, lines)
      // 版本号条件更新防并发覆盖；同事务写入修改前的版本快照
      const bumped = await tx.quote.updateMany({
        where: { id, version: quote.version },
        data: { version: { increment: 1 } },
      })
      if (!bumped.count) throw new BizException(ErrorCodes.CONFLICT, 'quote modified concurrently')
      await tx.quoteSnapshot.create({
        data: {
          tenantId: me.tenantId,
          quoteId: id,
          version: quote.version,
          total: String(quote.total),
          lines: beforeLines as Prisma.InputJsonValue,
          changedById: me.id,
          changedByName: me.name ?? me.email,
        },
      })
    })
    return this.quoteDetail(me, id)
  }

  /** 报价版本历史（最近 20 个，新的在前） */
  async quoteHistory(me: AuthUser, id: string) {
    await this.quoteDetail(me, id)
    const [rows, total] = await Promise.all([
      this.prisma.quoteSnapshot.findMany({
        where: { tenantId: me.tenantId, quoteId: id },
        orderBy: { version: 'desc' },
        take: 20,
      }),
      this.prisma.quoteSnapshot.count({ where: { tenantId: me.tenantId, quoteId: id } }),
    ])
    return {
      items: rows.map((r) => ({
        version: r.version,
        total: Number(r.total).toFixed(2),
        lines: r.lines,
        changedAt: r.changedAt.toISOString(),
        changedBy: r.changedByName,
      })),
      total,
    }
  }

  private async replaceLinesTx(
    tx: Prisma.TransactionClient,
    me: AuthUser,
    quoteId: string,
    lines: LineInput[],
  ) {
    await tx.quoteLine.deleteMany({ where: { quoteId } })
    let subtotal = '0.00'
    let discountSum = '0.00'
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const product = await tx.product.findFirst({
        where: { id: l.productId, tenantId: me.tenantId, deletedAt: null },
      })
      if (!product) throw new BizException(ErrorCodes.UNPROCESSABLE, `product ${l.productId} not found`)
      const unitPrice = parseMoney(l.unitPrice ?? String(product.standardPrice))
      const discountRate = l.discountRate ?? '0'
      // 底价管控：折后单价不得低于成本价（cost）
      if (product.cost != null) {
        const floor = Number(product.cost)
        const net = Number(unitPrice) * (1 - Number(discountRate))
        if (floor > 0 && net + 0.001 < floor) {
          throw new BizException(
            ErrorCodes.UNPROCESSABLE,
            tr(
              `产品「${product.name}」折后单价 ${net.toFixed(2)} 低于底价 ${floor.toFixed(2)}`,
              `Net unit price of "${product.name}" (${net.toFixed(2)}) is below the floor price ${floor.toFixed(2)}`,
            ),
          )
        }
      }
      const amount = mulMoney(unitPrice, l.qty, discountRate)
      const noDiscount = mulMoney(unitPrice, l.qty, '0')
      subtotal = addMoney(subtotal, noDiscount)
      const discDelta = parseMoney(
        (Number(noDiscount) - Number(amount)).toFixed(2),
      )
      discountSum = addMoney(discountSum, discDelta)
      await tx.quoteLine.create({
        data: {
          tenantId: me.tenantId,
          quoteId,
          productId: l.productId,
          name: l.name ?? product.name,
          qty: l.qty,
          unitPrice,
          discountRate,
          amount,
          sortOrder: i,
        },
      })
    }
    const total = parseMoney((Number(subtotal) - Number(discountSum)).toFixed(2))
    await tx.quote.update({
      where: { id: quoteId },
      data: {
        subtotal,
        discountAmount: discountSum,
        taxAmount: '0.00',
        total,
        updatedById: me.id,
      },
    })
  }

  private async maxDiscount(quoteId: string): Promise<number> {
    const lines = await this.prisma.quoteLine.findMany({ where: { quoteId } })
    return lines.reduce((m, l) => Math.max(m, Number(l.discountRate)), 0)
  }

  async submit(me: AuthUser, id: string) {
    const quote = await this.quoteDetail(me, id)
    if (quote.status !== QuoteStatus.DRAFT && quote.status !== QuoteStatus.REJECTED) {
      throw new BizException(ErrorCodes.CONFLICT, `cannot submit from ${quote.status}`)
    }
    if (!quote.lines.length) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'quote has no lines')
    }
    const maxDisc = await this.maxDiscount(id)
    const threshold = Number(
      (
        await this.prisma.setting.findFirst({
          where: { tenantId: me.tenantId, key: 'discount_approval_threshold' },
        })
      )?.value ?? 0.2,
    )
    const amountThreshold = Number(
      (
        await this.prisma.setting.findFirst({
          where: { tenantId: me.tenantId, key: 'amount_approval_threshold' },
        })
      )?.value ?? 200000,
    )
    const total = Number(quote.total)
    const needDiscountApproval = maxDisc > threshold
    const needAmountApproval = total >= amountThreshold
    const needApproval = needDiscountApproval || needAmountApproval

    if (needApproval) {
      // 需要审批：进入 SUBMITTED，并创建审批实例
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.quote.update({
          where: { id },
          data: { status: QuoteStatus.SUBMITTED, updatedById: me.id },
        })
        const def = await tx.approvalDefinition.findFirst({
          where: { tenantId: me.tenantId, code: 'QUOTE_DISCOUNT', isActive: true },
        })
        if (def) {
          // 按审批定义逐级找上级；找不到时交给其他超级管理员；申请人不审自己的单、同一人不重复审
          const rules = ((def.rules as { steps?: ApprovalStepRule[] } | null)?.steps ?? []) as ApprovalStepRule[]
          const approvers = await resolveApproverChain(
            prismaApproverLookup(tx, me.tenantId),
            me.id,
            rules,
          )
          if (!approvers.length) {
            throw new BizException(
              ErrorCodes.UNPROCESSABLE,
              tr(
                '找不到可用的审批人：请为申请人设置上级，或再添加一位超级管理员（申请人不能审批自己的报价）',
                'No approver available: set a manager for the applicant or add another super admin (applicants cannot approve their own quotes)',
              ),
            )
          }
          const approverId = approvers[0]
          const reason = [
            needDiscountApproval ? tr(`折扣 ${maxDisc.toFixed(2)} 超阈`, `discount ${maxDisc.toFixed(2)} over threshold`) : '',
            needAmountApproval ? tr(`金额 ${total.toFixed(0)} 超阈`, `amount ${total.toFixed(0)} over threshold`) : '',
          ]
            .filter(Boolean)
            .join(tr('，', ', '))
          await tx.approvalInstance.create({
            data: {
              tenantId: me.tenantId,
              definitionId: def.id,
              entityType: 'QUOTE',
              entityId: id,
              status: 'PENDING',
              currentStep: 0,
              applicantId: me.id,
              snapshot: {
                quoteNo: quote.quoteNo,
                total: quote.total,
                discountRateMax: maxDisc,
                reason,
                payload: {
                  discountRateMax: maxDisc,
                  total: Number(quote.total),
                  needDiscountApproval,
                  needAmountApproval,
                },
              },
              steps: {
                create: approvers.map((aid, stepIndex) => ({ stepIndex, approverId: aid, action: null })),
              },
            },
          })
          await this.push.notify(
            me.tenantId,
            approverId,
            'APPROVAL_TODO',
            { zh: '您有新的审批待办', en: 'New approval waiting for you' },
            { zh: `报价 ${quote.quoteNo} 审批（${reason}）`, en: `Quote ${quote.quoteNo} approval (${reason})` },
            'QUOTE',
            id,
            tx,
          )
        }
        return {
          ...updated,
          needApproval: true,
          maxDiscountRate: maxDisc,
          needDiscountApproval,
          needAmountApproval,
          approvalReason:
            [
              needDiscountApproval ? tr('折扣超阈', 'Discount over threshold') : '',
              needAmountApproval ? tr('金额超阈', 'Amount over threshold') : '',
            ]
              .filter(Boolean)
              .join(tr('，', ', ')) || undefined,
        }
      })
    }

    // 无超阈折扣：直接 APPROVED
    return this.prisma.quote.update({
      where: { id },
      data: {
        status: QuoteStatus.APPROVED,
        approvedAt: new Date(),
        updatedById: me.id,
      },
    })
  }

  /** 生成报价分享链接（客户免登录查看/确认） */
  async createShareLink(me: AuthUser, id: string) {
    const q = await this.quoteDetail(me, id)
    // 只有审批通过（或已发送）的报价才能发给客户确认，防止绕过折扣审批
    if (q.status !== QuoteStatus.APPROVED && q.status !== QuoteStatus.SENT) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, `cannot share quote in ${q.status}`)
    }
    const row = await this.prisma.quoteShareToken.create({
      data: {
        tenantId: me.tenantId,
        token: `qs-${randomBytes(18).toString('base64url')}`,
        quoteId: q.id,
        createdById: me.id,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    })
    return {
      token: row.token,
      url: `/share/quote/${row.token}`,
      expiresAt: row.expiresAt.toISOString(),
    }
  }

  /** 公开端点无登录态：按 token 唯一索引反查租户与报价 */
  private async findShareToken(token: string) {
    const row = await this.prisma.quoteShareToken.findUnique({ where: { token } })
    if (!row) return null
    return { tenantId: row.tenantId, meta: { quoteId: row.quoteId, expiresAt: row.expiresAt } }
  }

  /** 客户通过分享链接查看报价 */
  async publicQuote(token: string) {
    const hit = await this.findShareToken(token)
    if (!hit) throw new BizException(ErrorCodes.NOT_FOUND, tr('分享链接无效', 'Invalid share link'))
    if (hit.meta.expiresAt < new Date()) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('分享链接已过期', 'Share link has expired'))
    }
    const q = await this.prisma.quote.findFirst({
      where: { id: hit.meta.quoteId, tenantId: hit.tenantId, deletedAt: null },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!q) throw new BizException(ErrorCodes.NOT_FOUND, 'quote not found')
    const account = await this.prisma.account.findFirst({
      where: { id: q.accountId },
      select: { id: true, name: true, shortName: true, phone: true, address: true },
    })
    // 只暴露必要字段
    return {
      quoteNo: q.quoteNo,
      subject: q.subject,
      status: q.status,
      total: String(q.total),
      subtotal: String(q.subtotal),
      discountAmount: String(q.discountAmount),
      taxAmount: String(q.taxAmount),
      currency: q.currency,
      validUntil: q.validUntil,
      terms: q.terms,
      version: q.version,
      account: account ? { name: account.name, shortName: account.shortName } : null,
      lines: q.lines.map((l) => ({
        name: l.name,
        qty: String(l.qty),
        unitPrice: String(l.unitPrice),
        discountRate: String(l.discountRate),
        amount: String(l.amount),
      })),
    }
  }

  /** 客户确认报价 */
  async publicAccept(token: string, body: { name?: string; note?: string }) {
    const hit = await this.findShareToken(token)
    if (!hit) throw new BizException(ErrorCodes.NOT_FOUND, tr('分享链接无效', 'Invalid share link'))
    if (hit.meta.expiresAt < new Date()) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('分享链接已过期', 'Share link has expired'))
    }
    const q = await this.prisma.quote.findFirst({
      where: { id: hit.meta.quoteId, tenantId: hit.tenantId, deletedAt: null },
    })
    if (!q) throw new BizException(ErrorCodes.NOT_FOUND, 'quote not found')
    if (q.status === 'ACCEPTED') return { ok: true, status: 'ACCEPTED', message: tr('已确认过', 'Already confirmed') }
    // 与内部 accept 相同的状态约束：未审批 / 被驳回的报价不能由客户确认
    if (q.status !== QuoteStatus.APPROVED && q.status !== QuoteStatus.SENT) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, tr('报价尚未审批通过，暂不能确认', 'This quote has not been approved yet and cannot be confirmed'))
    }
    const accepted = await this.prisma.quote.updateMany({
      where: { id: q.id, status: { in: [QuoteStatus.APPROVED, QuoteStatus.SENT] } },
      data: {
        status: 'ACCEPTED',
        approvedAt: new Date(),
        remark: [q.remark, `${tr('客户在线确认', 'Confirmed online by customer')} ${body.name ?? ''} ${body.note ?? ''} @${new Date().toISOString()}`]
          .filter(Boolean)
          .join(' | '),
      },
    })
    if (!accepted.count) return { ok: true, status: 'ACCEPTED', message: tr('已确认过', 'Already confirmed') }
    // 通知负责人
    await this.push.notify(
      hit.tenantId,
      q.ownerId,
      'QUOTE_ACCEPTED',
      { zh: '报价已被客户确认', en: 'Quote confirmed by customer' },
      {
        zh: `${q.quoteNo}「${q.subject}」客户 ${body.name ?? '（未署名）'} 已在线确认`,
        en: `${q.quoteNo} "${q.subject}" was confirmed online by ${body.name ?? '(unsigned)'}`,
      },
      'QUOTE',
      q.id,
    )
    return { ok: true, status: 'ACCEPTED' }
  }

  /** 报价邮件发送（记录发送日志 + 返回 mailto） */
  async sendQuoteEmail(me: AuthUser, id: string, body: { to?: string; note?: string }) {
    const q = await this.quoteDetail(me, id)
    const share = await this.createShareLink(me, id)
    const to = body?.to || ''
    const subject = tr(`报价单 ${q.quoteNo}｜${q.subject}`, `Quote ${q.quoteNo} | ${q.subject}`)
    const text = [
      tr(
        `您好，附上报价单 ${q.quoteNo}（${q.subject}），合计 ${q.total} ${q.currency}。`,
        `Hello, please find quote ${q.quoteNo} (${q.subject}) attached, total ${q.total} ${q.currency}.`,
      ),
      body?.note ? `${tr('备注：', 'Note: ')}${body.note}` : '',
      `${tr('在线查看与确认：', 'View and confirm online: ')}${share.url}`,
      tr('—— 智销 CRM', '— ZhiXiao CRM'),
    ]
      .filter(Boolean)
      .join('\n')
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    // 写入发送日志
    await recordEmailSend(this.prisma, me, {
      to,
      toName: q.account?.name ?? '',
      subject,
      body: text,
      entityType: 'QUOTE',
      entityId: q.id,
    })
    return { to, subject, text, mailto, shareUrl: share.url }
  }

  async send(me: AuthUser, id: string) {
    const quote = await this.quoteDetail(me, id)
    if (quote.status !== QuoteStatus.APPROVED) {
      throw new BizException(ErrorCodes.CONFLICT, `cannot send from ${quote.status}`)
    }
    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.SENT, updatedById: me.id },
    })
  }

  async accept(me: AuthUser, id: string) {
    const quote = await this.quoteDetail(me, id)
    if (quote.status === QuoteStatus.SUBMITTED) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'quote is waiting approval')
    }
    if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.APPROVED) {
      throw new BizException(ErrorCodes.CONFLICT, `cannot accept from ${quote.status}`)
    }
    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.ACCEPTED, updatedById: me.id },
    })
  }

  async toContract(me: AuthUser, id: string) {
    const quote = await this.quoteDetail(me, id)
    if (quote.status !== QuoteStatus.ACCEPTED) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'only accepted quote can convert to contract')
    }
    return this.prisma.$transaction(async (tx) => {
      const contractNo = await nextDocNo(tx, me.tenantId, 'HT')
      const contract = await tx.contract.create({
        data: {
          tenantId: me.tenantId,
          contractNo,
          title: quote.subject,
          accountId: quote.accountId,
          opportunityId: quote.opportunityId,
          quoteId: quote.id,
          status: 'DRAFT',
          total: quote.total,
          receivedAmount: '0',
          currency: quote.currency,
          ownerId: me.id,
          terms: quote.terms,
          createdById: me.id,
          updatedById: me.id,
          lines: {
            create: quote.lines.map((l, i) => ({
              tenantId: me.tenantId,
              productId: l.productId,
              name: l.name,
              qty: l.qty,
              unitPrice: l.unitPrice,
              discountRate: l.discountRate,
              amount: l.amount,
              sortOrder: i,
            })),
          },
        },
      })
      return contract
    })
  }

  /** 套餐定义（MVP 固定组合，可扩展 settings） */
  async bundles(me: AuthUser) {
    const products = await this.prisma.product.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true, standardPrice: true },
      take: 5,
    })
    return [
      {
        id: 'bundle-starter',
        name: tr('启航套餐', 'Starter bundle'),
        description: tr('标准版+实施，适合首次上系统', 'Standard edition + implementation, for first-time rollouts'),
        productIds: products.slice(0, 2).map((p) => p.id),
        discountRate: '0.1',
      },
      {
        id: 'bundle-pro',
        name: tr('增长套餐', 'Growth bundle'),
        description: tr('专业版+实施+培训', 'Professional edition + implementation + training'),
        productIds: products.slice(0, 3).map((p) => p.id),
        discountRate: '0.15',
      },
    ]
  }

  private async findTemplate(me: AuthUser, kind: TemplateKind, id: string) {
    const tpl = await this.prisma.docTemplate.findFirst({
      where: { id, tenantId: me.tenantId, kind: KIND[kind], deletedAt: null },
    })
    if (!tpl) throw new BizException(ErrorCodes.NOT_FOUND, 'template not found')
    return tpl
  }

  private async templateOut(id: string) {
    const tpl = await this.prisma.docTemplate.findUniqueOrThrow({
      where: { id },
      include: { logs: { orderBy: { at: 'desc' }, take: 20 } },
    })
    return toTemplate(tpl)
  }

  /** 读取模板可编辑正文（仅返回用户保存的正文；description/terms 只作说明） */
  async templateContent(me: AuthUser, kind: TemplateKind, id: string) {
    const tpl = await this.findTemplate(me, kind, id)
    const versions = await this.prisma.docTemplateVersion.findMany({
      where: { templateId: id },
      orderBy: { createdAt: 'desc' },
      take: TEMPLATE_HISTORY_LIMIT,
    })
    const file = tpl.file as { fileUrl?: string; fileName?: string } | null
    return {
      content: tpl.content,
      description: tpl.description,
      terms: tpl.terms || tpl.description,
      fileUrl: file?.fileUrl ?? '',
      fileName: file?.fileName ?? '',
      hasFile: !!file?.fileUrl,
      history: versions.map((v) => ({ content: v.content, at: v.createdAt.toISOString() })),
      name: tpl.name,
    }
  }

  /** 正文变更：旧正文写入历史版本，只保留最近 10 个 */
  private async replaceTemplateContent(
    tx: Prisma.TransactionClient,
    id: string,
    prevContent: string,
    content: string,
    extra: Prisma.DocTemplateUpdateInput = {},
  ) {
    if (prevContent) {
      await tx.docTemplateVersion.create({ data: { templateId: id, content: prevContent } })
      const stale = await tx.docTemplateVersion.findMany({
        where: { templateId: id },
        orderBy: { createdAt: 'desc' },
        skip: TEMPLATE_HISTORY_LIMIT,
        select: { id: true },
      })
      if (stale.length) {
        await tx.docTemplateVersion.deleteMany({ where: { id: { in: stale.map((x) => x.id) } } })
      }
    }
    await tx.docTemplate.update({ where: { id }, data: { ...extra, content } })
  }

  /** 保存模板可编辑正文 */
  async saveTemplateContent(me: AuthUser, kind: TemplateKind, id: string, content: string) {
    const tpl = await this.findTemplate(me, kind, id)
    await this.prisma.$transaction((tx) => this.replaceTemplateContent(tx, id, tpl.content, content))
    return this.templateOut(id)
  }

  /** 模板审批：提交审核 / 通过 / 驳回 */
  async approveTemplate(
    me: AuthUser,
    kind: TemplateKind,
    id: string,
    action: 'SUBMIT' | 'APPROVE' | 'REJECT',
    note?: string,
  ) {
    await this.findTemplate(me, kind, id)
    if (!['SUBMIT', 'APPROVE', 'REJECT'].includes(action)) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'action invalid')
    }
    const status = action === 'SUBMIT' ? 'PENDING' : action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    const by = me.name ?? me.email
    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.docTemplateApprovalLog.create({
        data: { templateId: id, action, status, note: note ?? '', byId: me.id, byName: by },
      }),
      this.prisma.docTemplate.update({
        where: { id },
        data: {
          approveStatus: status,
          approveNote: note ?? '',
          ...(action === 'APPROVE'
            ? { approvedByName: by, approvedAt: now, published: true, publishedAt: now, publishedByName: by }
            : {}),
        },
      }),
    ])
    return this.templateOut(id)
  }

  /** 发布/取消发布模板 */
  async publishTemplate(me: AuthUser, kind: TemplateKind, id: string, published: boolean) {
    await this.findTemplate(me, kind, id)
    await this.prisma.docTemplate.update({
      where: { id },
      data: {
        published,
        publishedAt: published ? new Date() : null,
        ...(published ? { publishedByName: me.name ?? me.email } : {}),
      },
    })
    return this.templateOut(id)
  }

  /** 模板上传 Word/Excel：绑定文件到模板，并自动解析为正文 */
  async attachTemplateFile(
    me: AuthUser,
    kind: TemplateKind,
    id: string,
    file: { fileName: string; fileUrl: string; fileType: string },
  ) {
    const tpl = await this.findTemplate(me, kind, id)
    // 上传后自动解析 Word/Excel → 写入模板正文（与原文档排版一致）
    let parsed = ''
    try {
      const attId = String(file.fileUrl || '').split('/').pop() || ''
      const att = await this.prisma.attachment.findFirst({
        where: { id: attId, tenantId: me.tenantId, deletedAt: null },
      })
      if (att) {
        const { join } = await import('path')
        const { existsSync } = await import('fs')
        const root = process.env.FILE_STORAGE_DIR ?? './storage'
        const abs = join(root, att.storageKey)
        if (existsSync(abs)) {
          parsed = await renderFileToHtml(abs, att.fileName, att.mimeType)
          // 解析失败提示不当作正文
          if (/tpl-parse-fail|无法解析|解析失败/.test(parsed) && parsed.length < 400) {
            parsed = ''
          }
        }
      }
    } catch {
      parsed = ''
    }
    const fileData = {
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      fileType: file.fileType,
      uploadedAt: new Date().toISOString(),
    }
    await this.prisma.$transaction(async (tx) => {
      if (parsed) {
        await this.replaceTemplateContent(tx, id, tpl.content, parsed, { file: fileData, autoParsed: true })
      } else {
        await tx.docTemplate.update({ where: { id }, data: { file: fileData, autoParsed: false } })
      }
    })
    return this.templateOut(id)
  }

  private async listTemplates(me: AuthUser, kind: TemplateKind) {
    const rows = await this.prisma.docTemplate.findMany({
      where: { tenantId: me.tenantId, kind: KIND[kind], deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { logs: { orderBy: { at: 'desc' }, take: 20 } },
    })
    return { items: rows.map(toTemplate), total: rows.length }
  }

  private async deleteTemplate(me: AuthUser, kind: TemplateKind, id: string) {
    await this.prisma.docTemplate.updateMany({
      where: { id, tenantId: me.tenantId, kind: KIND[kind], deletedAt: null },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  /** 合同模板：条款正文 + 默认字段 */
  async contractTemplates(me: AuthUser) {
    return this.listTemplates(me, 'contract')
  }

  async saveContractTemplate(
    me: AuthUser,
    body: {
      name: string
      category?: string
      terms?: string
      defaultDuration?: string
      defaultPayment?: string
    },
  ) {
    if (!body.name?.trim()) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'name required')
    const row = await this.prisma.docTemplate.create({
      data: {
        tenantId: me.tenantId,
        kind: KIND.contract,
        name: body.name.trim(),
        category: body.category ?? tr('标准', 'Standard'),
        terms: body.terms ?? '',
        defaultDuration: body.defaultDuration ?? '12',
        defaultPayment: body.defaultPayment ?? tr('年付', 'Annual'),
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return this.templateOut(row.id)
  }

  async deleteContractTemplate(me: AuthUser, id: string) {
    return this.deleteTemplate(me, 'contract', id)
  }

  /** 报价模板：保存行项目，可一键套用 */
  async quoteTemplates(me: AuthUser) {
    return this.listTemplates(me, 'quote')
  }

  async saveQuoteTemplate(
    me: AuthUser,
    body: { name: string; description?: string; lines: LineInput[] },
  ) {
    if (!body.name?.trim()) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'name required')
    const row = await this.prisma.docTemplate.create({
      data: {
        tenantId: me.tenantId,
        kind: KIND.quote,
        name: body.name.trim(),
        description: body.description ?? '',
        lines: (body.lines ?? []) as unknown as Prisma.InputJsonValue,
        createdById: me.id,
        createdByName: me.name ?? me.email,
      },
    })
    return this.templateOut(row.id)
  }

  async deleteQuoteTemplate(me: AuthUser, id: string) {
    return this.deleteTemplate(me, 'quote', id)
  }
}
