import { useQuery } from '@tanstack/react-query'
import { Card, Col, Progress, Row, Table, Tag } from 'antd'
import { api } from '../api/client'
import { BarChart } from './SimpleCharts'
import { t } from '../i18n'

type RegionRow = {
  region: string
  accounts: number
  contractAmount: string
  received: string
  openOppAmount: string
}

/** 领地/区域业绩看板（对标 Salesforce Territory Management） */
export function TerritoryBoard() {
  const q = useQuery({
    queryKey: ['region-performance'],
    queryFn: () => api<RegionRow[]>('/reports/region-performance'),
    retry: false,
  })
  const rows = q.data ?? []
  const maxContract = Math.max(...rows.map((r) => Number(r.contractAmount)), 1)

  return (
    <Card
      size="small"
      className="crm-panel-fixed crm-block-lg"
      title={t('cmp.territoryBoard.territoryRegionalPerformance')}
      extra={<Tag color="blue">{t('cmp.territoryBoard.regions', { length: rows.length })}</Tag>}
    >
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <div style={{ fontSize: 12, color: '#646A73', marginBottom: 6 }}>{t('cmp.territoryBoard.contractAmountComparison')}</div>
          <BarChart
            items={rows.slice(0, 6).map((r) => ({
              label: r.region,
              value: Number(r.contractAmount),
            }))}
            color="#2b5fd9"
            height={120}
          />
        </Col>
        <Col xs={24} md={8}>
          <div style={{ fontSize: 12, color: '#646A73', marginBottom: 6 }}>{t('cmp.territoryBoard.collectionCompletion')}</div>
          {rows.slice(0, 5).map((r) => {
            const c = Number(r.contractAmount)
            const pct = c > 0 ? Math.round((Number(r.received) / c) * 100) : 0
            return (
              <div key={r.region} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{r.region}</span>
                  <span>{pct}%</span>
                </div>
                <Progress
                  percent={pct}
                  size="small"
                  strokeColor={pct >= 80 ? '#0d9488' : pct >= 50 ? '#2b5fd9' : '#d97706'}
                />
              </div>
            )
          })}
          {!rows.length && <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('cmp.territoryBoard.noRegionalData')}</div>}
        </Col>
        <Col xs={24} md={8}>
          <div style={{ fontSize: 12, color: '#646A73', marginBottom: 6 }}>{t('cmp.territoryBoard.details')}</div>
          <Table<RegionRow>
            rowKey="region"
            size="small"
            pagination={false}
            loading={q.isLoading}
            dataSource={rows}
            columns={[
              { title: t('common.region'), dataIndex: 'region' },
              { title: t('nav.accounts'), dataIndex: 'accounts', width: 56 },
              {
                title: t('nav.contracts'),
                dataIndex: 'contractAmount',
                render: (v: string) => (
                  <span>
                    {v}
                    <div
                      style={{
                        height: 3,
                        width: `${(Number(v) / maxContract) * 100}%`,
                        background: '#2b5fd9',
                        borderRadius: 2,
                        marginTop: 2,
                      }}
                    />
                  </span>
                ),
              },
              { title: t('common.openDeals'), dataIndex: 'openOppAmount' },
            ]}
          />
        </Col>
      </Row>
    </Card>
  )
}
