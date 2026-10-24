import { useQuery } from '@tanstack/react-query'
import { Button, Card, Col, Row, Space, Statistic, Tag } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { t } from '../../i18n'

type Item = {
  id: string
  contractNo: string
  title: string
  status: string
  total: string
  account?: { id: string; name: string }
  signedA: boolean
  signedB: boolean
  bothSigned: boolean
  logs: string[]
}

/** 电子签进度看板 */
export default function ESignBoardPage() {
  const nav = useNavigate()
  const [bucket, setBucket] = useState<'ALL' | 'pending' | 'partial' | 'done'>('ALL')

  const { data, isLoading } = useQuery({
    queryKey: ['esign-board'],
    queryFn: () =>
      api<{
        buckets: { pending: number; partial: number; done: number }
        items: Item[]
      }>('/esign/board'),
    retry: false,
    refetchInterval: 60_000,
  })

  const all = data?.items ?? []
  const rows =
    bucket === 'ALL'
      ? all
      : bucket === 'pending'
        ? all.filter((x) => !x.signedA && !x.signedB)
        : bucket === 'partial'
          ? all.filter((x) => (x.signedA || x.signedB) && !x.bothSigned)
          : all.filter((x) => x.bothSigned)

  return (
    <ErpListShell
      program="mtsgn0001"
      title={t('contracts.eSignProgressBoard')}
      subtitle={t('contracts.fulfilmentSealingSigning')}
      density="small"
      onRefresh={() => window.location.reload()}
      extraActions={
        <Space>
          {(
            [
              ['ALL', t('common.all'), all.length],
              ['pending', t('contracts.pendingSeal'), data?.buckets.pending ?? 0],
              ['partial', t('contracts.signedByOneParty'), data?.buckets.partial ?? 0],
              ['done', t('contracts.signedByBoth'), data?.buckets.done ?? 0],
            ] as const
          ).map(([k, label, n]) => (
            <Tag.CheckableTag key={k} checked={bucket === k} onChange={(c) => setBucket(c ? k : 'ALL')}>
              <Tag
                color={
                  k === 'pending' ? 'orange' : k === 'partial' ? 'blue' : k === 'done' ? 'green' : 'default'
                }
                style={{ marginInlineEnd: 0 }}
              >
                {label} {n}
              </Tag>
            </Tag.CheckableTag>
          ))}
        </Space>
      }
    >
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={t('contracts.pendingSeal')}
              value={data?.buckets.pending ?? 0}
              valueStyle={{ color: '#d97706' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={t('contracts.signedByOneParty')}
              value={data?.buckets.partial ?? 0}
              valueStyle={{ color: '#2b5fd9' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={t('contracts.signedByBoth')}
              value={data?.buckets.done ?? 0}
              valueStyle={{ color: '#16a34a' }}
            />
          </Card>
        </Col>
      </Row>

      <ErpTable
        rowKey="id"
        storageKey="esign-board"
        loading={isLoading}
        dataSource={rows as unknown as Record<string, unknown>[]}
        pageSize={15}
        onRowClick={(row) => nav(`/contracts/${String((row as unknown as Item).id)}/sign`)}
        columns={[
          {
            title: t('audit.field.contractNo'),
            dataIndex: 'contractNo',
            width: 140,
            filterType: 'text',
            sorter: true,
            render: (v: unknown) => <span>{String(v)}</span>,
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
            title: t('audit.field.amount'),
            dataIndex: 'total',
            width: 100,
            filterType: 'number',
            sorter: true,
          },
          {
            title: t('contracts.partyASeal2'),
            dataIndex: 'signedA',
            width: 95,
            filterType: 'select',
            filterOptions: [
              { value: 'true', label: t('contracts.sealed') },
              { value: 'false', label: t('contracts.pendingSeal') },
            ],
            render: (v: unknown) =>
              v ? <Tag color="green">{t('contracts.sealed')}</Tag> : <Tag color="default">{t('contracts.pendingSeal')}</Tag>,
          },
          {
            title: t('contracts.partyBSeal2'),
            dataIndex: 'signedB',
            width: 95,
            render: (v: unknown) =>
              v ? <Tag color="green">{t('contracts.sealed')}</Tag> : <Tag color="default">{t('contracts.pendingSeal')}</Tag>,
          },
          {
            title: t('audit.field.status'),
            dataIndex: 'bothSigned',
            width: 100,
            render: (v: unknown, r: Record<string, unknown>) =>
              v ? (
                <Tag color="green">{t('contracts.signedByBoth')}</Tag>
              ) : r.signedA || r.signedB ? (
                <Tag color="blue">{t('contracts.signing')}</Tag>
              ) : (
                <Tag color="orange">{t('contracts.pendingSeal')}</Tag>
              ),
          },
          {
            title: t('common.actions'),
            dataIndex: '__op',
            width: 110,
            render: (_: unknown, r: Record<string, unknown>) => (
              <Button
                size="small"
                type="primary"
                onClick={(e) => {
                  e.stopPropagation()
                  nav(`/contracts/${String(r.id)}/sign`)
                }}
              >{t('contracts.goSeal')}</Button>
            ),
          },
        ]}
      />
    </ErpListShell>
  )
}
