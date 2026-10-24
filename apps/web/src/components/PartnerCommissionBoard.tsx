import { useQuery } from '@tanstack/react-query'
import { Card, Empty, Progress, Space, Statistic, Table, Tag } from 'antd'
import { api } from '../api/client'
import { t } from '../i18n'

type PartnerRow = {
  id: string
  name: string
  level?: string
  contact?: string
  phone?: string
  status?: string
}

/** 伙伴/渠道业绩与预估佣金（对标 Salesforce Partner / 渠道门户） */
export function PartnerCommissionBoard() {
  const list = useQuery({
    queryKey: ['partners-board'],
    queryFn: () => api<PartnerRow[] | { items: PartnerRow[] }>('/partners'),
    retry: false,
  })
  const partners = Array.isArray(list.data) ? list.data : (list.data?.items ?? [])

  const portals = useQuery({
    queryKey: ['partner-portals', partners.map((p) => p.id).join(',')],
    enabled: partners.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(
        partners.slice(0, 8).map((p) =>
          api<{
            partner: { id: string; name: string }
            summary: {
              leadCount: number
              oppCount: number
              wonAmount: string
              openAmount: string
              estimatedCommission: string
              commissionRate: string
            }
          }>(`/partners/${p.id}/portal`).catch(() => null),
        ),
      )
      return rows.filter(Boolean) as {
        partner: { id: string; name: string }
        summary: {
          leadCount: number
          oppCount: number
          wonAmount: string
          openAmount: string
          estimatedCommission: string
          commissionRate: string
        }
      }[]
    },
    retry: false,
  })

  const rows = portals.data ?? []
  const totalWon = rows.reduce((a, r) => a + Number(r.summary.wonAmount), 0)
  const totalCommission = rows.reduce((a, r) => a + Number(r.summary.estimatedCommission), 0)

  return (
    <Card
      size="small"
      className="crm-panel-fixed"
      title={t('cmp.partnerCommissionBoard.partnerCommissionBoard')}
      extra={<Tag color="blue">{t('cmp.partnerCommissionBoard.estimatedCommission', { v: totalCommission.toFixed(2) })}</Tag>}
    >
      <Space size="large" wrap style={{ marginBottom: 12 }}>
        <Statistic title={t('cmp.partnerCommissionBoard.partners')} value={partners.length} />
        <Statistic title={t('common.totalWon')} value={totalWon.toFixed(0)} valueStyle={{ color: '#0d9488' }} />
        <Statistic
          title={t('cmp.partnerCommissionBoard.estimatedCommission2')}
          value={totalCommission.toFixed(2)}
          valueStyle={{ color: '#2b5fd9' }}
        />
      </Space>
      {!rows.length && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cmp.partnerCommissionBoard.noPartnerDataMaintain')} />
      )}
      <Table
        rowKey={(r) => r.partner.id}
        size="small"
        pagination={{ pageSize: 5 }}
        dataSource={rows}
        columns={[
          { title: t('common.partner'), dataIndex: ['partner', 'name'] },
          { title: t('nav.leads'), render: (_: unknown, r: (typeof rows)[0]) => r.summary.leadCount },
          { title: t('nav.opportunities'), render: (_: unknown, r: (typeof rows)[0]) => r.summary.oppCount },
          { title: t('common.wonAmount'), render: (_: unknown, r: (typeof rows)[0]) => r.summary.wonAmount },
          {
            title: t('cmp.partnerCommissionBoard.estimatedCommission2'),
            render: (_: unknown, r: (typeof rows)[0]) => (
              <b style={{ color: '#2b5fd9' }}>{r.summary.estimatedCommission}</b>
            ),
          },
          {
            title: t('cmp.partnerCommissionBoard.share'),
            render: (_: unknown, r: (typeof rows)[0]) => {
              const pct = totalWon > 0 ? (Number(r.summary.wonAmount) / totalWon) * 100 : 0
              return <Progress percent={Math.round(pct)} size="small" strokeColor="#0d9488" />
            },
          },
        ]}
      />
    </Card>
  )
}
