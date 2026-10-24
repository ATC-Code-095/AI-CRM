import { useQuery } from '@tanstack/react-query'
import { Button, Input, Modal, Select, Space, Tag } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import dayjs from 'dayjs'
import { useState } from 'react'
import { api, apiUrl } from '../../api/client'
import { useAuditFieldLabel } from '../../audit/useAuditFieldLabel'
import { t } from '../../i18n'

interface AuditRow {
  id: string
  action: string
  entity: string
  entityId: string
  userId: string
  at: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

function DiffView({ row }: { row: AuditRow }) {
  const fieldLabel = useAuditFieldLabel()
  const before = row.before ?? {}
  const after = row.after ?? {}
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()
  return (
    <AutoFitTable
      rowKey="k"
      size="small"
      pagination={false}
      dataSource={keys.map((k) => ({ k, b: before[k], a: after[k] }))}
      columns={[
        {
          title: t('nav.fields'),
          dataIndex: 'k',
          width: 140,
          render: (k: string) => fieldLabel(k),
        },
        {
          title: t('audit.before'),
          dataIndex: 'b',
          render: (v: unknown) => (v == null ? '-' : String(v)),
        },
        {
          title: t('audit.after'),
          dataIndex: 'a',
          render: (v: unknown) => (v == null ? '-' : String(v)),
        },
      ]}
    />
  )
}

export default function AuditPage() {
  const [row, setRow] = useState<AuditRow | null>(null)
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [entity, setEntity] = useState<string>('')
  const [q, setQ] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', entity, q],
    queryFn: () =>
      api<{ items: AuditRow[]; total: number }>(
        `/audit-logs?pageSize=50${entity ? `&entity=${entity}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
    retry: false,
  })

  return (
    <div>
      <ErpListShell
        program="mtaud0001"
        title={t('common.auditLog')}
        subtitle={t('audit.adminAuditTrail')}
        density={density}
        onDensityChange={setDensity}
        extraActions={
          <Space wrap>
            <Select
              size="small"
              allowClear
              placeholder={t('audit.objectType')}
              style={{ width: 130 }}
              value={entity || undefined}
              onChange={(v: string) => setEntity(v || '')}
              options={['ACCOUNT', 'LEAD', 'OPPORTUNITY', 'QUOTE', 'CONTRACT', 'PAYMENT', 'USER'].map(
                (x) => ({ value: x, label: x }),
              )}
            />
            <Input.Search
              size="small"
              allowClear
              placeholder={t('audit.searchIdAction')}
              style={{ width: 180 }}
              onSearch={setQ}
            />
          </Space>
        }
        onExport={() => {
          void fetch(
            apiUrl(`/api/v1/audit-logs?export=csv${entity ? `&entity=${entity}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
            {
            headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
          })
            .then((r) => r.blob())
            .then((blob) => {
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `audit-logs-${Date.now()}.csv`
              a.click()
              URL.revokeObjectURL(url)
            })
        }}
      >
        <ErpTable
          rowKey="id"
          storageKey="audit"
          loading={isLoading}
          dataSource={(data?.items ?? []) as unknown as Record<string, unknown>[]}
          pageSize={15}
          columns={[
          {
            title: t('common.time'),
            dataIndex: 'at',
            render: (v: unknown) => dayjs(String(v)).format('MM-DD HH:mm:ss'),
          },
          {
            title: t('common.action'),
            dataIndex: 'action',
            render: (v: unknown) => <Tag>{String(v)}</Tag>,
          },
          { title: t('common.object'), dataIndex: 'entity' },
          {
            title: 'ID',
            dataIndex: 'entityId',
            render: (v: unknown) => String(v ?? '').slice(0, 12),
          },
          {
            title: t('audit.operator'),
            dataIndex: 'userId',
            render: (v: unknown) => String(v ?? '').slice(0, 10),
          },
          {
            title: t('common.details'),
            dataIndex: '__diff',
            render: (_: unknown, r: Record<string, unknown>) => (
              <Button size="small" onClick={() => setRow(r as unknown as AuditRow)}>
                Diff
              </Button>
            ),
          },
          ]}
        />
      </ErpListShell>
      <Modal title={t('audit.changeDetails')} open={!!row} footer={null} onCancel={() => setRow(null)} width={560}>
        {row && <DiffView row={row} />}
      </Modal>
    </div>
  )
}
