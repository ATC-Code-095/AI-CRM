import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

interface FieldDef {
  id: string
  entity: string
  apiName: string
  label: string
  dataType: string
  required: boolean
  isActive: boolean
}

/** 在实体详情上渲染自定义字段并保存到 customValues */
export function CustomFieldsBox({
  entityType,
  entityId,
  customValues,
}: {
  entityType: 'ACCOUNT' | 'LEAD'
  entityId: string
  customValues?: Record<string, unknown> | null
}) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Record<string, string>>({})

  const defsQ = useQuery({
    queryKey: ['field-defs', entityType],
    queryFn: () =>
      api<FieldDef[]>(`/field-definitions?entity=${entityType}`),
    retry: false,
  })

  useEffect(() => {
    const init: Record<string, string> = {}
    for (const d of defsQ.data ?? []) {
      init[d.apiName] = String((customValues ?? {})[d.apiName] ?? '')
    }
    setDraft(init)
  }, [defsQ.data, customValues])

  const saveM = useMutation({
    mutationFn: () =>
      api(
        entityType === 'ACCOUNT' ? `/accounts/${entityId}` : `/leads/${entityId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ customValues: draft }),
        },
      ),
    onSuccess: () => {
      message.success(t('cmp.customFieldsBox.customFieldsSaved'))
      void qc.invalidateQueries({ queryKey: ['account-overview', entityId] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const defs = (defsQ.data ?? []).filter((d) => d.isActive)
  if (!defs.length) return null

  return (
    <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
      <Typography.Text type="secondary">{t('common.customFields')}</Typography.Text>
      {defs.map((d) => (
        <Input
          key={d.id}
          placeholder={d.label}
          value={draft[d.apiName] ?? ''}
          onChange={(e) => setDraft((p) => ({ ...p, [d.apiName]: e.target.value }))}
        />
      ))}
      <Button size="small" type="primary" loading={saveM.isPending} onClick={() => saveM.mutate()}>{t('cmp.customFieldsBox.saveCustomFields')}</Button>
    </Space>
  )
}
