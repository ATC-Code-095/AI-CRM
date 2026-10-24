import { Injectable } from '@nestjs/common'
import {
  BizException,
  ErrorCodes,
  LeadSource,
  LeadStatus,
} from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { createLeadAssigner } from '../lead/lead-assign'
import { tr } from '../../common/locale'

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async list(me: AuthUser) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { forms: { where: { deletedAt: null } } },
    })
    return Promise.all(
      campaigns.map(async (c) => {
        const leadCount = await this.prisma.lead.count({
          where: { tenantId: me.tenantId, campaignId: c.id, deletedAt: null },
        })
        return { ...c, leadCount }
      }),
    )
  }

  async create(me: AuthUser, data: Record<string, unknown>) {
    return this.prisma.campaign.create({
      data: {
        tenantId: me.tenantId,
        name: data.name as string,
        type: (data.type as string) ?? 'OTHER',
        status: 'ACTIVE',
        description: (data.description as string) ?? null,
        ownerId: me.id,
        createdById: me.id,
      },
    })
  }

  async update(
    me: AuthUser,
    id: string,
    data: { name?: string; type?: string; status?: string; description?: string },
  ) {
    const existing = await this.prisma.campaign.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!existing) throw new BizException(ErrorCodes.NOT_FOUND, 'campaign not found')
    return this.prisma.campaign.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        type: data.type ?? undefined,
        status: data.status ?? undefined,
        description: data.description ?? undefined,
      },
    })
  }

  async createForm(me: AuthUser, name: string, campaignId?: string) {
    return this.prisma.form.create({
      data: {
        tenantId: me.tenantId,
        campaignId: campaignId ?? null,
        name,
        fields: {
          name: true,
          company: true,
          contactName: true,
          phone: true,
          email: true,
          remark: true,
        },
        isActive: true,
      },
    })
  }

  async formDetail(me: AuthUser, id: string) {
    const form = await this.prisma.form.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!form) throw new BizException(ErrorCodes.NOT_FOUND, 'form not found')
    return form
  }

  /** 公开提交 → 建线索 */
  async submitForm(formId: string, data: Record<string, unknown>) {
    const form = await this.prisma.form.findFirst({
      where: { id: formId, deletedAt: null },
    })
    if (!form || !form.isActive) {
      throw new BizException(ErrorCodes.NOT_FOUND, 'form not found')
    }

    const name =
      (data.company as string) ||
      (data.name as string) ||
      (data.contactName as string) ||
      tr('网站访客', 'Website visitor')

    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.formSubmission.create({
        data: {
          tenantId: form.tenantId,
          formId,
          data: data as never,
        },
      })
      // 按分配规则交给销售；规则为 MANUAL、未开启创建即分配或没有销售时，退回租户最早的在职用户
      const assigner = await createLeadAssigner(tx, form.tenantId)
      const salesOwner = assigner.onCreate ? await assigner.next() : null
      await assigner.save()
      const owner = salesOwner
        ? { id: salesOwner }
        : await tx.user.findFirst({
            where: { tenantId: form.tenantId, deletedAt: null, status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' },
          })
      const lead = await tx.lead.create({
        data: {
          tenantId: form.tenantId,
          name,
          contactName: (data.contactName as string) ?? (data.name as string) ?? null,
          phone: (data.phone as string) ?? null,
          email: (data.email as string) ?? null,
          source: LeadSource.WEB_FORM,
          campaignId: form.campaignId,
          status: LeadStatus.NEW,
          score: 0,
          ownerId: owner?.id ?? 'system',
          remark: (data.remark as string) ?? null,
          createdById: owner?.id ?? 'system',
          updatedById: owner?.id ?? 'system',
        },
      })
      await tx.formSubmission.update({
        where: { id: submission.id },
        data: { leadId: lead.id },
      })
      if (salesOwner) {
        await this.push.notify(
          form.tenantId,
          salesOwner,
          'LEAD_ASSIGNED',
          { zh: '线索已分配给您', en: 'A lead has been assigned to you' },
          { zh: `官网表单线索「${name}」`, en: `Web form lead "${name}"` },
          'LEAD',
          lead.id,
          tx,
        )
      }
      // 不返回 leadId 给匿名用户
      return { ok: true }
    })
  }
}
