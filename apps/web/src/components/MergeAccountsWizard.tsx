import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Card, Modal, Radio, Space, Tag, Typography } from 'antd'
import { AutoFitTable } from '../components/AutoFitTable'
import { useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

type Acc = {
  id: string
  name: string
  phone?: string | null
  industry?: string | null
  region?: string | null
  level?: string
  stage?: string
  website?: string | null
  address?: string | null
  ownerId?: string
  remark?: string | null
}

const FIELDS: { key: keyof Acc; label: string }[] = [
  { key: 'name', label: t('common.accountName') },
  { key: 'phone', label: t('enum.activity.type.CALL') },
  { key: 'industry', label: t('common.industry') },
  { key: 'region', label: t('common.region') },
  { key: 'level', label: t('common.level') },
  { key: 'stage', label: t('audit.field.stage') },
  { key: 'website', label: t('cmp.mergeAccountsWizard.website') },
  { key: 'address', label: t('common.address') },
  { key: 'remark', label: t('enum.activity.type.NOTE') },
]

/** 重复客户合并向导（对标 Salesforce Merge Accounts） */
export function MergeAccountsWizard({
  open,
  sourceId,
  targetId,
  onClose,
}: {
  open: boolean
  sourceId: string
  targetId: string
  onClose: () => void
}) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [keep, setKeep] = useState<Record<string, 'source' | 'target'>>({})

  const q = useQuery({
    queryKey: ['merge-acc', sourceId, targetId],
    enabled: open && !!sourceId && !!targetId,
    queryFn: async () => {
      const [s, tgt] = await Promise.all([
        api<Acc>(`/accounts/${sourceId}`),
        api<Acc>(`/accounts/${targetId}`),
      ])
      return { source: s, target: tgt }
    },
  })

  const mergeM = useMutation({
    mutationFn: () => {
      const s = q.data!.source
      const tgt = q.data!.target
      const fields: Record<string, unknown> = {}
      for (const f of FIELDS) {
        const pick = keep[f.key] ?? 'target'
        const val = pick === 'source' ? s[f.key] : tgt[f.key]
        fields[f.key] = val ?? null
      }
      return api('/pool/merge', {
        method: 'POST',
        body: JSON.stringify({ sourceId, targetId, fields }),
      })
    },
    onSuccess: () => {
      message.success(t('cmp.mergeAccountsWizard.mergeCompleteRelatedRecords'))
      void qc.invalidateQueries({ queryKey: ['pool-dup'] })
      void qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    },
    onError: (e: Error) => message.error(e.message),
  })

  const s = q.data?.source
  const tgt = q.data?.target

  return (
    <Modal
      title={t('cmp.mergeAccountsWizard.mergeDuplicateAccounts')}
      open={open}
      onCancel={onClose}
      width={720}
      okText={t('cmp.mergeAccountsWizard.confirmMerge')}
      okButtonProps={{ danger: true, loading: mergeM.isPending }}
      onOk={() => mergeM.mutate()}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>{t('cmp.mergeAccountsWizard.chooseWhichFieldValues')}</Typography.Paragraph>
      <Space style={{ marginBottom: 8 }} wrap>
        <Tag color="blue">{t('cmp.mergeAccountsWizard.kept', { v: tgt?.name ?? targetId })}</Tag>
        <Tag color="orange">{t('cmp.mergeAccountsWizard.merged', { v: s?.name ?? sourceId })}</Tag>
      </Space>
      <AutoFitTable
        rowKey="key"
        size="small"
        loading={q.isLoading}
        pagination={false}
        dataSource={FIELDS.map((f) => ({ key: f.key, label: f.label }))}
        columns={[
          { title: t('nav.fields'), dataIndex: 'label', width: 100 },
          {
            title: tgt?.name ?? t('cmp.mergeAccountsWizard.kept2'),
            width: 220,
            render: (_: unknown, row: { key: keyof Acc }) => (
              <Radio
                checked={(keep[row.key] ?? 'target') === 'target'}
                onChange={() => setKeep((p) => ({ ...p, [row.key]: 'target' }))}
              >
                <span style={{ fontSize: 12 }}>{String(tgt?.[row.key] ?? '—')}</span>
              </Radio>
            ),
          },
          {
            title: s?.name ?? t('cmp.mergeAccountsWizard.merged2'),
            width: 220,
            render: (_: unknown, row: { key: keyof Acc }) => (
              <Radio
                checked={keep[row.key] === 'source'}
                onChange={() => setKeep((p) => ({ ...p, [row.key]: 'source' }))}
              >
                <span style={{ fontSize: 12 }}>{String(s?.[row.key] ?? '—')}</span>
              </Radio>
            ),
          },
          {
            title: t('common.difference'),
            render: (_: unknown, row: { key: keyof Acc }) => {
              const a = s?.[row.key]
              const b = tgt?.[row.key]
              if ((a ?? '') === (b ?? '')) return <Tag>{t('cmp.mergeAccountsWizard.same')}</Tag>
              return <Tag color="orange">{t('cmp.mergeAccountsWizard.different')}</Tag>
            },
          },
        ]}
      />
      <Card size="small" style={{ marginTop: 12 }} title={t('cmp.mergeAccountsWizard.mergeNotes')}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#646A73' }}>
          <li>{t('cmp.mergeAccountsWizard.theRightHandKept')}</li>
          <li>{t('cmp.mergeAccountsWizard.relatedContactsDealsAnd')}</li>
          <li>{t('cmp.mergeAccountsWizard.theMergedRecordIs')}</li>
        </ul>
      </Card>
    </Modal>
  )
}
