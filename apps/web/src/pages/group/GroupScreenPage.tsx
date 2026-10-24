import { useQuery } from '@tanstack/react-query'
import { Card, Col, Progress, Row, Statistic, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { BarChart, GaugeRing, RadarChart } from '../../components/SimpleCharts'
import { t } from '../../i18n'

/** 集团驾驶舱大屏（对标用友 NC / SAP Group Dashboard） */
export default function GroupScreenPage() {
  const cockpit = useQuery({
    queryKey: ['group-cockpit'],
    queryFn: () =>
      api<{
        month: string
        wonAmount: string
        contractAmount: string
        received: string
        profit: string
        margin: string
        topEntity: string
        totalExpense: string
        budgetRate: string
      }>('/group/cockpit'),
    retry: false,
  })
  const trend = useQuery({
    queryKey: ['group-trend'],
    queryFn: () =>
      api<{
        items: {
          month: string
          wonAmount: string
          contractAmount: string
          received: string
        }[]
      }>('/group/trend'),
    retry: false,
  })
  const cash = useQuery({
    queryKey: ['group-cash-pool-trend'],
    queryFn: () =>
      api<{
        items: { month: string; transferAmount: string; count: number }[]
      }>('/group/cash-pool-trend'),
    retry: false,
  })
  const rank = useQuery({
    queryKey: ['group-rank'],
    queryFn: () =>
      api<{
        items: {
          rank: number
          name: string
          contractAmount: string
          receiveRate: string
        }[]
      }>('/group/rank'),
    retry: false,
  })
  const compare = useQuery({
    queryKey: ['group-compare'],
    queryFn: () =>
      api<{
        items: {
          name: string
          revenueScore: number
          expenseScore: number
          profitScore: number
        }[]
      }>('/group/compare-metrics'),
    retry: false,
  })
  const finance = useQuery({
    queryKey: ['group-finance'],
    queryFn: () =>
      api<{
        contractTotal: string
        cashIn: string
        receivable: string
        overduePlanCount: number
        profit: string
        margin: string
      }>('/group/consolidated-finance'),
    retry: false,
  })

  const c = cockpit.data
  return (
    <div className="crm-group-screen">
      <div
        className="crm-screen-header"
        style={{
          background: 'linear-gradient(105deg, #0b1224 0%, #1e3a8a 55%, #2b5fd9 100%)',
          color: '#fff',
          borderRadius: 16,
          padding: '28px 32px',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.75, letterSpacing: 2 }}>
              GROUP BUSINESS COCKPIT
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{t('group.groupBusinessCockpit')}</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 8 }}>
              {dayjs().format(t('group.mmmmDYyyy'))}{' '}{t('group.periodTopEntity', { v: c?.month ?? '', v2: c?.topEntity ?? '-' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{t('group.wonThisMonth')}</div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{c?.wonAmount ?? '0'}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{t('group.profitThisYear')}</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#6ee7b7' }}>
                {c?.profit ?? '0'}
              </div>
            </div>
            <Link to="/group" style={{ color: '#fff', opacity: 0.85 }}>{t('group.backToGroupAdmin')}</Link>
          </div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={6}>
          <Card className="crm-panel-fixed crm-panel-sm" size="small">
            <Statistic title={t('group.newContracts')} value={c?.contractAmount ?? '0'} />
            <Statistic title={t('nav.payments')} value={c?.received ?? '0'} valueStyle={{ color: '#6ee7b7' }} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="crm-panel-fixed crm-panel-sm" size="small">
            <Statistic title={t('group.profitMargin')} value={`${c?.margin ?? 0}%`} />
            <GaugeRing
              value={Math.min(100, Number(c?.margin ?? 0))}
              label={t('group.margin2')}
              size={64}
              color="#2b5fd9"
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="crm-panel-fixed crm-panel-sm" size="small">
            <Statistic title={t('group.budgetExecution')} value={`${c?.budgetRate ?? 0}%`} />
            <Progress
              percent={Math.min(100, Number(c?.budgetRate ?? 0))}
              strokeColor={Number(c?.budgetRate ?? 0) > 90 ? '#e11d48' : '#0d9488'}
            />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card className="crm-panel-fixed crm-panel-sm" size="small">
            <Statistic title={t('group.totalExpenses')} value={c?.totalExpense ?? '0'} />
            <Statistic
              title={t('group.receivables2')}
              value={finance.data?.receivable ?? '0'}
              valueStyle={{ color: '#d97706' }}
            />
          </Card>
        </Col>

        <Col xs={24} md={8}>
          <Card className="crm-panel-fixed crm-block-lg" size="small" title={t('group.businessTrend6Months')}>
            <BarChart
              items={(trend.data?.items ?? []).map((t) => ({
                label: t.month.slice(5),
                value: Number(t.contractAmount),
              }))}
              color="#2b5fd9"
              height={120}
            />
            <Table
              style={{ marginTop: 12 }}
              rowKey="month"
              size="small"
              pagination={false}
              dataSource={trend.data?.items ?? []}
              columns={[
                { title: t('group.month'), dataIndex: 'month' },
                { title: t('enum.stage.WON'), dataIndex: 'wonAmount' },
                { title: t('nav.contracts'), dataIndex: 'contractAmount' },
                { title: t('nav.payments'), dataIndex: 'received' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="crm-panel-fixed crm-block-lg" size="small" title={t('group.fundPoolTrend')}>
            <BarChart
              items={(cash.data?.items ?? []).map((t) => ({
                label: t.month.slice(5),
                value: Number(t.transferAmount),
              }))}
              color="#0d9488"
              height={120}
            />
            <Table
              style={{ marginTop: 12 }}
              rowKey="month"
              size="small"
              pagination={false}
              dataSource={cash.data?.items ?? []}
              columns={[
                { title: t('group.month'), dataIndex: 'month' },
                { title: t('group.transferAmount'), dataIndex: 'transferAmount' },
                { title: t('common.count2'), dataIndex: 'count' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card className="crm-panel-fixed crm-block-lg" size="small" title={t('group.entityRankingCapability')}>
            <Table
              rowKey="rank"
              size="small"
              pagination={false}
              dataSource={rank.data?.items ?? []}
              columns={[
                {
                  title: '#',
                  dataIndex: 'rank',
                  width: 48,
                  render: (v: number) => (
                    <Tag color={v <= 3 ? 'gold' : 'default'}>{v}</Tag>
                  ),
                },
                { title: t('group.entity'), dataIndex: 'name' },
                { title: t('common.contractAmount'), dataIndex: 'contractAmount' },
                { title: t('common.collectionRate'), dataIndex: 'receiveRate' },
              ]}
            />
            <RadarChart
              size={180}
              axes={[t('group.revenue'), t('group.expenses'), t('group.profit2')]}
              items={(compare.data?.items ?? []).slice(0, 3).map((p, i) => ({
                name: p.name,
                scores: [p.revenueScore, p.expenseScore, p.profitScore],
                color: i === 0 ? '#2b5fd9' : i === 1 ? '#0d9488' : '#d97706',
              }))}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
