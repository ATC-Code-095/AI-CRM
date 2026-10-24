import { useTranslation } from 'react-i18next'

/** 审计字段展示名：优先 i18n，回退原始 key */
export function useAuditFieldLabel() {
  const { t } = useTranslation()
  return (key: string) => {
    const label = t(`audit.field.${key}`)
    return label === `audit.field.${key}` ? key : label
  }
}
