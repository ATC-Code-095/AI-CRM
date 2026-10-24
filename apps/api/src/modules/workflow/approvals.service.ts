import { Injectable } from '@nestjs/common'
import { BizException, ErrorCodes, PageResult, QuoteStatus } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async todo(me: AuthUser, page: number, pageSize: number): Promise<PageResult<unknown>> {
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const where = {
      tenantId: me.tenantId,
      status: 'PENDING',
      steps: { some: { approverId: me.id, action: null } },
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.approvalInstance.count({ where }),
      this.prisma.approvalInstance.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { startedAt: 'desc' },
        include: {
          definition: true,
          steps: { orderBy: { stepIndex: 'asc' } },
        },
      }),
    ])
    return { items: await this.attachEntity(items), page: p, pageSize: size, total, hasMore: p * size < total }
  }

  async mine(me: AuthUser, page: number, pageSize: number): Promise<PageResult<unknown>> {
    const p = Math.max(page, 1)
    const size = Math.min(Math.max(pageSize, 1), 100)
    const where = {
      tenantId: me.tenantId,
      applicantId: me.id,
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.approvalInstance.count({ where }),
      this.prisma.approvalInstance.findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { startedAt: 'desc' },
        include: { definition: true, steps: { orderBy: { stepIndex: 'asc' } } },
      }),
    ])
    return { items: await this.attachEntity(items), page: p, pageSize: size, total, hasMore: p * size < total }
  }

  async detail(me: AuthUser, id: string) {
    const inst = await this.prisma.approvalInstance.findFirst({
      where: { id, tenantId: me.tenantId },
      include: {
        definition: true,
        steps: { orderBy: { stepIndex: 'asc' } },
      },
    })
    if (!inst) throw new BizException(ErrorCodes.NOT_FOUND, 'approval not found')
    const [entity] = await this.attachEntity([inst])
    return entity as typeof inst & { entity: unknown }
  }

  private async attachEntity(items: Array<Record<string, unknown> & { entityType: string; entityId: string }>) {
    return Promise.all(
      items.map(async (it) => {
        let entity: unknown = null
        if (it.entityType === 'QUOTE') {
          entity = await this.prisma.quote.findUnique({
            where: { id: it.entityId },
            select: { id: true, quoteNo: true, subject: true, status: true, total: true },
          })
        } else if (it.entityType === 'CONTRACT') {
          entity = await this.prisma.contract.findUnique({
            where: { id: it.entityId },
            select: { id: true, contractNo: true, title: true, status: true, total: true },
          })
        }
        return { ...it, entity }
      }),
    )
  }

  async approve(me: AuthUser, id: string, comment?: string) {
    return this.act(me, id, 'APPROVE', comment)
  }

  async reject(me: AuthUser, id: string, comment?: string) {
    if (!comment) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'comment required')
    return this.act(me, id, 'REJECT', comment)
  }

  async cancel(me: AuthUser, id: string) {
    const inst = await this.detail(me, id)
    if (inst.applicantId !== me.id) {
      throw new BizException(ErrorCodes.FORBIDDEN, 'only applicant can cancel')
    }
    if (inst.status !== 'PENDING') {
      throw new BizException(ErrorCodes.CONFLICT, `cannot cancel from ${inst.status}`)
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.approvalInstance.update({
        where: { id },
        data: { status: 'CANCELED', finishedAt: new Date() },
      })
      if (inst.entityType === 'QUOTE') {
        await tx.quote.update({
          where: { id: inst.entityId },
          data: { status: QuoteStatus.DRAFT },
        })
      }
      return updated
    })
  }

  private async act(me: AuthUser, id: string, action: 'APPROVE' | 'REJECT', comment?: string) {
    const inst = await this.detail(me, id)
    if (inst.status !== 'PENDING') {
      throw new BizException(ErrorCodes.CONFLICT, `approval is ${inst.status}`)
    }
    const steps = inst.steps as Array<{ id: string; stepIndex: number; approverId: string; action: string | null }>
    const current = steps.find((s) => s.stepIndex === inst.currentStep)
    if (!current || current.approverId !== me.id) {
      throw new BizException(ErrorCodes.FORBIDDEN, 'not current approver')
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.update({
        where: { id: current.id },
        data: { action, comment: comment ?? null, actedAt: new Date() },
      })

      if (action === 'REJECT') {
        const updated = await tx.approvalInstance.update({
          where: { id },
          data: { status: 'REJECTED', finishedAt: new Date() },
        })
        if (inst.entityType === 'QUOTE') {
          await tx.quote.update({
            where: { id: inst.entityId },
            data: { status: QuoteStatus.REJECTED },
          })
        } else if (inst.entityType === 'CONTRACT') {
          await tx.contract.update({
            where: { id: inst.entityId },
            data: { status: 'REJECTED' },
          })
        }
        await this.push.notify(
          me.tenantId,
          inst.applicantId,
          'APPROVAL_DONE',
          { zh: '审批已驳回', en: 'Approval rejected' },
          comment ?? undefined,
          inst.entityType,
          inst.entityId,
          tx,
        )
        return updated
      }

      const next = steps.find((s) => s.stepIndex === inst.currentStep + 1)
      if (next) {
        const mid = await tx.approvalInstance.update({
          where: { id },
          data: { currentStep: next.stepIndex },
          include: { steps: { orderBy: { stepIndex: 'asc' } } },
        })
        await this.push.notify(
          me.tenantId,
          next.approverId,
          'APPROVAL_TODO',
          { zh: '您有新的审批待办', en: 'New approval waiting for you' },
          { zh: `步骤 ${next.stepIndex + 1}`, en: `Step ${next.stepIndex + 1}` },
          inst.entityType,
          inst.entityId,
          tx,
        )
        return mid
      }

      const updated = await tx.approvalInstance.update({
        where: { id },
        data: { status: 'APPROVED', finishedAt: new Date() },
      })
      if (inst.entityType === 'QUOTE') {
        await tx.quote.update({
          where: { id: inst.entityId },
          data: { status: QuoteStatus.APPROVED, approvedAt: new Date() },
        })
      } else if (inst.entityType === 'CONTRACT') {
        // 合同金额审批全部通过即生效（原先置回草稿，需再次点生效而再次触发审批）
        const c = await tx.contract.findUnique({
          where: { id: inst.entityId },
          select: { signDate: true, effectiveDate: true },
        })
        await tx.contract.update({
          where: { id: inst.entityId },
          data: {
            status: 'EFFECTIVE',
            signDate: c?.signDate ?? new Date(),
            effectiveDate: c?.effectiveDate ?? new Date(),
          },
        })
      }
      await this.push.notify(
        me.tenantId,
        inst.applicantId,
        'APPROVAL_DONE',
        { zh: '审批已通过', en: 'Approval granted' },
        undefined,
        inst.entityType,
        inst.entityId,
        tx,
      )
      return updated
    })
  }

  /** 审批流配置列表 */
  async listDefinitions(me: AuthUser) {
    const defs = await this.prisma.approvalDefinition.findMany({
      where: { tenantId: me.tenantId },
      orderBy: { code: 'asc' },
    })
    const threshold = await this.prisma.setting.findFirst({
      where: { tenantId: me.tenantId, key: 'discount_approval_threshold' },
    })
    return {
      threshold: String(threshold?.value ?? 0.2),
      items: defs.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        entityType: d.entityType,
        isActive: d.isActive,
        rules: d.rules,
      })),
    }
  }

  async updateDefinition(
    me: AuthUser,
    id: string,
    body: { isActive?: boolean; rules?: unknown; threshold?: string },
  ) {
    const def = await this.prisma.approvalDefinition.findFirst({
      where: { id, tenantId: me.tenantId },
    })
    if (!def) throw new BizException(ErrorCodes.NOT_FOUND, 'definition not found')
    const updated = await this.prisma.approvalDefinition.update({
      where: { id: def.id },
      data: {
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
        ...(body.rules !== undefined ? { rules: body.rules as never } : {}),
      },
    })
    if (body.threshold !== undefined) {
      const row = await this.prisma.setting.findFirst({
        where: { tenantId: me.tenantId, key: 'discount_approval_threshold' },
      })
      if (row) {
        await this.prisma.setting.update({
          where: { id: row.id },
          data: { value: body.threshold as never },
        })
      } else {
        await this.prisma.setting.create({
          data: {
            tenantId: me.tenantId,
            key: 'discount_approval_threshold',
            value: body.threshold as never,
          },
        })
      }
    }
    return updated
  }
}
