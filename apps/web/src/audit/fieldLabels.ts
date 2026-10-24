import { t } from '../i18n'
/** 审计字段中文词典（Diff 展示用） */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  name: t('audit.field.name'),
  stage: t('audit.field.stage'),
  level: t('audit.field.level'),
  status: t('audit.field.status'),
  amount: t('audit.field.amount'),
  winRate: t('audit.field.winRate'),
  contractNo: t('audit.field.contractNo'),
  title: t('audit.field.title'),
  owner: t('audit.field.ownerId'),
  ownerId: t('audit.ownerId'),
  stageId: t('audit.stageId'),
  total: t('audit.field.total'),
  receivedAmount: t('audit.receivedAmount'),
  closeReason: t('audit.field.closeReason'),
  note: t('enum.activity.type.NOTE'),
  remark: t('enum.activity.type.NOTE'),
}

export function auditFieldLabel(key: string): string {
  return AUDIT_FIELD_LABELS[key] ?? key
}
