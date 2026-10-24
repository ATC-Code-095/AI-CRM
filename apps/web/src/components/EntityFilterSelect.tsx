import { Select, Tag } from 'antd'
import { useEntityScope } from '../hooks/useEntityScope'
import { t } from '../i18n'

/** 法人主体过滤：列表按集团主体可见范围过滤 */
export function EntityFilterSelect({
  value,
  onChange,
}: {
  value?: string | null
  onChange?: (v: string | null) => void
}) {
  const { entities, allowedIds } = useEntityScope()
  const opts = entities
    .filter((e) => !allowedIds || allowedIds.includes(e.id))
    .map((e) => ({ value: e.id, label: e.name }))
  return (
    <span>
      <Select
        size="small"
        allowClear
        placeholder={t('common.legalEntity')}
        style={{ width: 140 }}
        value={value || undefined}
        options={opts}
        onChange={(v: string) => onChange?.(v || null)}
      />
      {allowedIds ? (
        <Tag color="purple" style={{ marginLeft: 6 }}>{t('cmp.entityFilterSelect.entityScope')}</Tag>
      ) : null}
    </span>
  )
}
