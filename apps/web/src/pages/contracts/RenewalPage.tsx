import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Space, Tag } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { useUrlState } from '../../hooks/useUrlState'
import { t } from '../../i18n'

type RenewItem = {
  id: string
  contractNo: string
  title: string
  expireDate: string | null
  total: string
  receivedAmount: string
  bucket: 'OVERDUE' | 'D30' | 'D60' | 'D90'
  account?: { id: string; name: string }
}

const BUCKET_COLOR: Record<string, string> = {
  OVERDUE: 'red',
  D30: 'orange',
  D60: 'gold',
  D90: 'blue',
}
const BUCKET_LABEL: Record<string, string> = {
  OVERDUE: t('contracts.expired'),
  D30: t('contracts.within30Days'),
  D60: t('contracts.within60Days'),
  D90: t('contracts.within90Days'),
}

/** 续签工作台：到期分桶 + 一键续签（列表风格与合同页一致） */
export default function RenewalPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [bucket, setBucket] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['renewal-pipeline'],
    queryFn: () =>
      api<{
        buckets: { overdue: number; d30: number; d60: number; d90: number }
        items: RenewItem[]
      }>('/contracts/renewal-pipeline'),
    retry: false,
    refetchInterval: 60_000,
  })

  const renewM = useMutation({
    mutationFn: (p: { id: string; withQuote?: boolean }) =>
      api<{ id: string; contractNo: string; quote?: { quoteNo: string } | null }>(
        `/contracts/${p.id}/renew`,
        { method: 'POST', body: JSON.stringify({ withQuote: p.withQuote }) },
      ),
    onSuccess: (r) => {
      message.success(
        t('contracts.renewalContractCreated', { contractNo: r.contractNo, v: r.quote ? t('contracts.andQuoteCreated', { quoteNo: r.quote.quoteNo }) : '' }),
      )
      void qc.invalidateQueries({ queryKey: ['renewal-pipeline'] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const b = data?.buckets
  const rows = (data?.items ?? []).filter((r) => {
    if (bucket && r.bucket !== bucket) return false
    if (
      q &&
      !r.contractNo.toLowerCase().includes(q.toLowerCase()) &&
      !r.title.toLowerCase().includes(q.toLowerCase()) &&
      !(r.account?.name ?? '').toLowerCase().includes(q.toLowerCase())
    )
      return false
    return true
  })

  return (
    <ErpListShell
      program="mtrnw0001"
      title={t('common.renewals')}
      subtitle={t('contracts.fulfilmentContractRenewals')}
      search={q}
      onSearch={setQ}
      density={density}
      onDensityChange={setDensity}
      onRefresh={() => void qc.invalidateQueries({ queryKey: ['renewal-pipeline'] })}
      onCreate={() => rows.slice(0, 10).forEach((r) => renewM.mutate({ id: r.id, withQuote: true }))}
      createLabel={t('contracts.batchRenewQuoteTop')}
      extraActions={
        <Space wrap>
          {(
            [
              ['OVERDUE', t('contracts.expired'), b?.overdue ?? 0],
              ['D30', t('contracts.within30Days'), b?.d30 ?? 0],
              ['D60', t('contracts.within60Days'), b?.d60 ?? 0],
              ['D90', t('contracts.within90Days'), b?.d90 ?? 0],
            ] as const
          ).map(([k, label, n]) => (
            <Tag.CheckableTag
              key={k}
              checked={bucket === k}
              onChange={(c) => setBucket(c ? k : null)}
            >
              <Tag color={BUCKET_COLOR[k]} style={{ marginRight: 0 }}>
                {label} {n}
              </Tag>
            </Tag.CheckableTag>
          ))}
        </Space>
      }
    >
      <ErpTable
        rowKey="id"
        storageKey="renewals"
        loading={isLoading}
        dataSource={rows as unknown as Record<string, unknown>[]}
        pageSize={15}
        onRowClick={(row) => {
          const r = row as unknown as RenewItem
          nav(`/contracts/${r.id}/sign`)
        }}
        batchBar={(ids, _rows, clear) => (
          <Space wrap size={8}>
            <span style={{ color: '#64748b' }}>{t('common.selected', { length: ids.length })}</span>
            <Button
              size="small"
              type="primary"
              loading={renewM.isPending}
              onClick={() => {
                ids.forEach((id) => renewM.mutate({ id: String(id), withQuote: true }))
                clear()
              }}
            >{t('contracts.batchRenewQuote')}</Button>
            <Button
              size="small"
              onClick={() => {
                ids.forEach((id) => renewM.mutate({ id: String(id) }))
                clear()
              }}
            >{t('contracts.contractOnly')}</Button>
            <Button size="small" type="text" onClick={clear}>{t('common.clearSelection')}</Button>
          </Space>
        )}
        columns={[
          {
            title: t('contracts.expiryBuckets'),
            dataIndex: 'bucket',
            width: 90,
            filterType: 'select',
            filterOptions: [
              { value: 'OVERDUE', label: t('contracts.expired') },
              { value: 'D30', label: t('contracts.within30Days') },
              { value: 'D60', label: t('contracts.within60Days') },
              { value: 'D90', label: t('contracts.within90Days') },
            ],
            render: (v: unknown) => (
              <Tag color={BUCKET_COLOR[String(v)]}>{BUCKET_LABEL[String(v)]}</Tag>
            ),
          },
          {
            title: t('audit.field.contractNo'),
            dataIndex: 'contractNo',
            width: 140,
            filterType: 'text',
            sorter: true,
          },
          {
            title: t('audit.field.title'),
            dataIndex: 'title',
            width: 180,
            filterType: 'text',
          },
          {
            title: t('nav.accounts'),
            dataIndex: 'account',
            width: 130,
            filterType: 'text',
            render: (v: unknown) => {
              const a = v as { name?: string } | undefined
              return a?.name ?? '-'
            },
          },
          {
            title: t('common.dueDate'),
            dataIndex: 'expireDate',
            width: 110,
            filterType: 'text',
            render: (v: unknown) => (v ? String(v).slice(0, 10) : '—'),
          },
          {
            title: t('common.contractAmount'),
            dataIndex: 'total',
            width: 100,
            filterType: 'number',
            sorter: true,
          },
          {
            title: t('audit.field.receivedAmount'),
            dataIndex: 'receivedAmount',
            width: 100,
            filterType: 'number',
          },
          {
            title: t('common.actions'),
            dataIndex: '__op',
            width: 220,
            render: (_: unknown, row: Record<string, unknown>) => {
              const r = row as unknown as RenewItem
              return (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    loading={renewM.isPending && renewM.variables?.id === r.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      renewM.mutate({ id: r.id })
                    }}
                  >{t('contracts.renew')}</Button>
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      renewM.mutate({ id: r.id, withQuote: true })
                    }}
                  >{t('contracts.quote')}</Button>
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.open(`/contracts/${r.id}/print`, '_blank')
                    }}
                  >{t('common.print')}</Button>
                </Space>
              )
            },
          },
        ]}
      />
    </ErpListShell>
  )
}
