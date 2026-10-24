import { useQuery } from '@tanstack/react-query'
import { Select } from 'antd'
import { useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

interface Hit {
  type: string
  id: string
  title: string
}

/** 活动挂接实体选择器（客户/线索/商机） */
export function EntityPicker({
  value,
  onChange,
}: {
  value?: { entityType: string; entityId: string } | null
  onChange?: (v: { entityType: string; entityId: string } | null) => void
}) {
  const [q, setQ] = useState('')
  const { data } = useQuery({
    queryKey: ['entity-picker', q],
    queryFn: () =>
      api<{ items: Hit[] }>(`/search?q=${encodeURIComponent(q)}&types=account,lead,opportunity`),
    enabled: q.trim().length >= 2,
    retry: false,
  })

  const options = (data?.items ?? []).map((h) => ({
    value: `${h.type}:${h.id}`,
    label: `${h.title}（${h.type}）`,
  }))

  return (
    <Select
      style={{ width: '100%' }}
      showSearch
      filterOption={false}
      onSearch={setQ}
      placeholder={t('cmp.entityPicker.searchAccountsLeadsDeals')}
      value={value ? `${value.entityType.toLowerCase()}:${value.entityId}` : undefined}
      options={options}
      onChange={(v) => {
        if (!v) {
          onChange?.(null)
          return
        }
        const [type, id] = String(v).split(':')
        onChange?.({
          entityType: type.toUpperCase(),
          entityId: id,
        })
      }}
      allowClear
    />
  )
}
