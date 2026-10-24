import type {
  ChannelPartner,
  CustomerSegment,
  EmailSend,
  Meeting,
  MeetingAction,
  NpsScore,
  Prisma,
  SuccessPlan,
} from '@prisma/client'
import type { AuthUser } from '../../common/decorators'
import type { DbClient } from '../../common/doc-no'

/** 输出与原 settings JSON 一致的字段结构，前端无需改动 */

export function toEmailSend(e: EmailSend) {
  return {
    id: e.id,
    to: e.to,
    toName: e.toName,
    subject: e.subject,
    body: e.body,
    html: e.html,
    templateId: e.templateId,
    entityType: e.entityType,
    entityId: e.entityId,
    sentBy: e.sentByName,
    sentAt: e.sentAt.toISOString(),
    openedAt: e.openedAt?.toISOString() ?? null,
    openCount: e.openCount,
    clickedAt: e.clickedAt?.toISOString() ?? null,
    clickCount: e.clickCount,
    lastClickUrl: e.lastClickUrl ?? undefined,
    status: e.status,
  }
}

/** 记录一条邮件发送日志（供邮件中心、报价邮件、集团简报共用） */
export function recordEmailSend(
  db: DbClient,
  me: AuthUser,
  data: Omit<Prisma.EmailSendUncheckedCreateInput, 'tenantId' | 'sentById' | 'sentByName'>,
) {
  return db.emailSend.create({
    data: { ...data, tenantId: me.tenantId, sentById: me.id, sentByName: me.name ?? me.email },
  })
}

export function toMeeting(m: Meeting & { actionItems: MeetingAction[] }) {
  return {
    id: m.id,
    title: m.title,
    entityType: m.entityType,
    entityId: m.entityId,
    heldAt: m.heldAt.toISOString(),
    attendees: m.attendees,
    agenda: m.agenda,
    decisions: m.decisions,
    actions: m.actions,
    actionList: [...m.actionItems]
      .sort((a, b) => a.sort - b.sort)
      .map((a) => ({ text: a.text, owner: a.owner, due: a.due, done: a.done })),
    createdBy: m.createdByName,
    createdAt: m.createdAt.toISOString(),
  }
}

export function toNps(n: NpsScore) {
  return {
    id: n.id,
    accountId: n.accountId,
    accountName: n.accountName,
    contactName: n.contactName,
    score: n.score,
    comment: n.comment,
    createdBy: n.createdByName,
    createdAt: n.createdAt.toISOString(),
  }
}

export function toPartner(p: ChannelPartner) {
  return {
    id: p.id,
    name: p.name,
    contactName: p.contactName,
    phone: p.phone,
    region: p.region,
    remark: p.remark,
    createdAt: p.createdAt.toISOString(),
  }
}

export function toSuccessPlan(s: SuccessPlan) {
  return {
    goals: s.goals,
    milestones: Array.isArray(s.milestones) ? s.milestones : [],
    adoption: s.adoption,
    champion: s.champion,
    risks: s.risks,
    nextReview: s.nextReview,
    updatedAt: s.updatedAt.toISOString(),
    updatedBy: s.updatedByName,
  }
}

export function toSegment(s: CustomerSegment) {
  return {
    id: s.id,
    name: s.name,
    stage: s.stage,
    industry: s.industry,
    level: s.level,
    tag: s.tag,
    minAmount: s.minAmount,
    note: s.note,
    autoOutreach: s.autoOutreach,
    createdBy: s.createdByName,
    createdAt: s.createdAt.toISOString(),
  }
}
