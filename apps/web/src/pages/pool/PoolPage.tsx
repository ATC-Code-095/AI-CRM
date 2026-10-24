import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Space, Tabs, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { MergeAccountsWizard } from '../../components/MergeAccountsWizard'

interface PoolLead {
  id: string
  name: string
  phone: string | null
  status: string
  ownerId: string
  nextFollowAt: string | null
  createdAt: string
}

interface DupGroup {
  name?: string
  phone?: string
  ids: string[]
}

export default function PoolPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [merge, setMerge] = useState<{ sourceId: string; targetId: string } | null>(null)

  const leadsQ = useQuery({
    queryKey: ['pool-leads'],
    queryFn: () => api<{ items: PoolLead[]; total: number }>('/pool/leads'),
    retry: false,
  })
  const dupQ = useQuery({
    queryKey: ['pool-dup'],
    queryFn: () => api<{ byName: DupGroup[]; byPhone: DupGroup[] }>('/pool/duplicates'),
    retry: false,
  })

  const claim = useMutation({
    mutationFn: (p: { entityType: string; entityId: string }) =>
      api('/pool/claim', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => {
      message.success(t('pool.claimed'))
      void qc.invalidateQueries({ queryKey: ['pool-leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtpol0001"
        title={t('nav.pool')}
        subtitle={t('pool.acquisitionPoolDedupe')}
        onRefresh={() => window.location.reload()}
      >
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('pool.poolDedupe')}</Typography.Title>
      <Tabs
        items={[
          {
            key: 'leads',
            label: t('pool.overdueLeads', { v: leadsQ.data?.total ?? 0 }),
            children: (
              <ErpTable
                rowKey="id"
                storageKey="pool-leads"
                loading={leadsQ.isLoading}
                onRowClick={(row) => {
                  const r = row as unknown as { id: string }
                  claim.mutate({ entityType: 'LEAD', entityId: r.id })
                }}
                dataSource={(leadsQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
                pageSize={15}
                columns={[
                  { title: t('audit.field.name'), dataIndex: 'name', width: 160, filterType: 'text', sorter: true },
                  { title: t('enum.activity.type.CALL'), dataIndex: 'phone', width: 130, filterType: 'text' },
                  {
                    title: t('audit.field.status'),
                    dataIndex: 'status',
                    width: 90,
                    filterType: 'select',
                    filterOptions: [
                      { value: 'NEW', label: 'NEW' },
                      { value: 'ACCEPTED', label: 'ACCEPTED' },
                      { value: 'CULTIVATING', label: 'CULTIVATING' },
                    ],
                    render: (s) => <Tag>{String(s)}</Tag>,
                  },
                  {
                    title: t('common.nextFollowUp'),
                    dataIndex: 'nextFollowAt',
                    width: 110,
                    render: (v: unknown) =>
                      v ? String(v).slice(0, 10) : <Tag color="orange">{t('pool.noPlan')}</Tag>,
                  },
                  {
                    title: t('common.actions'),
                    dataIndex: '__op',
                    width: 80,
                    render: (_v, row) => {
                      const r = row as unknown as PoolLead
                      return (
                        <Button
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation()
                            claim.mutate({ entityType: 'LEAD', entityId: r.id })
                          }}
                        >{t('pool.claim')}</Button>
                      )
                    },
                  },
                ]}
              />
            ),
          },
          {
            key: 'dup',
            label: t('pool.duplicateAccounts'),
            children: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text type="secondary">{t('pool.duplicateAccountsDetectedBy')}</Typography.Text>
                <ErpTable
                  rowKey="name"
                  storageKey="pool-dup-name"
                  dataSource={(dupQ.data?.byName ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={10}
                  columns={[
                    { title: t('pool.duplicateNames'), dataIndex: 'name', width: 180, filterType: 'text' },
                    {
                      title: t('common.accountId'),
                      dataIndex: 'ids',
                      width: 280,
                      render: (ids: unknown) => ((ids as string[]) ?? []).join(', '),
                    },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      width: 100,
                      render: (_v, row) => {
                        const r = row as unknown as DupGroup
                        return r.ids.length >= 2 ? (
                          <Button
                            size="small"
                            type="primary"
                            onClick={() => {
                              setMerge({ sourceId: r.ids[1], targetId: r.ids[0] })
                            }}
                          >{t('pool.mergeWizard')}</Button>
                        ) : null
                      },
                    },
                  ]}
                />
                <ErpTable
                  rowKey="phone"
                  storageKey="pool-dup-phone"
                  dataSource={(dupQ.data?.byPhone ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={10}
                  columns={[
                    { title: t('pool.duplicatePhones'), dataIndex: 'phone', width: 160, filterType: 'text' },
                    {
                      title: t('common.accountId'),
                      dataIndex: 'ids',
                      width: 280,
                      render: (ids: unknown) => ((ids as string[]) ?? []).join(', '),
                    },
                  ]}
                />
              </Space>
            ),
          },
        ]}
      />
      <div style={{ marginTop: 8, color: '#646A73', fontSize: 12 }}>
        {t('pool.ruleLeadsWithoutFollow', { v: t('nav.home') })}</div>
      </ErpListShell>
      {merge && (
        <MergeAccountsWizard
          open={!!merge}
          sourceId={merge.sourceId}
          targetId={merge.targetId}
          onClose={() => setMerge(null)}
        />
      )}
    </div>
  )
}
