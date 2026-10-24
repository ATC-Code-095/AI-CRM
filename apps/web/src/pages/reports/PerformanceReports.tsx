import { useQuery } from '@tanstack/react-query'
import { Card, Col, Row, Space, Tag, Typography } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ReportsFilterBar, type ReportDays } from '../../components/ReportsFilterBar'
import { WinLossBoard } from '../../components/WinLossBoard'
import { PartnerCommissionBoard } from '../../components/PartnerCommissionBoard'
import { TerritoryBoard } from '../../components/TerritoryBoard'
import { t } from '../../i18n'

export default function PerformanceReports() {
  const [days, setDays] = useState<ReportDays>(30)
  const perf = useQuery({
    queryKey: ['owner-performance'],
    queryFn: () =>
      api<
        {
          userId: string
          name: string
          newLeads: number
          oppCount: number
          wonAmount: string
          openAmount: string
          contractAmount: string
          receivedAmount: string
        }[]
      >('/reports/owner-performance'),
    retry: false,
  })
  const board = useQuery({
    queryKey: ['leaderboard', days],
    queryFn: () =>
      api<
        {
          userId: string
          name: string
          wonAmount: string
          receivedAmount: string
          newOpps: number
          winRate: string
          activities: number
          rank?: number
          trend?: string
          attainment?: string
        }[]
      >(`/reports/sales-leaderboard?days=${days}`),
    retry: false,
  })
  const goals = useQuery({
    queryKey: ['goal-attainment'],
    queryFn: () =>
      api<{ goalId: string; metric: string; targetAmount: string; actualAmount: string; rate: string }[]>(
        '/reports/goal-attainment',
      ),
    retry: false,
  })
  const forecastAcc = useQuery({
    queryKey: ['forecast-accuracy'],
    queryFn: () =>
      api<{ month: string; forecast: string; actual: string; accuracy: string; gap: string }[]>(
        '/reports/forecast-accuracy',
      ),
    retry: false,
  })
  const bias = useQuery({
    queryKey: ['forecast-bias'],
    queryFn: () =>
      api<{
        month: string
        summary: {
          totalCommit: string
          totalWon: string
          hitRate: string
          overCommit: number
          overDeliver: number
        }
        items: {
          userId: string
          name: string
          commitAmount: string
          wonAmount: string
          hitRate: string
          bias: string
        }[]
      }>('/reports/forecast-bias'),
    retry: false,
  })
  const commission = useQuery({
    queryKey: ['commission'],
    queryFn: () =>
      api<{
        rows: {
          userId: string
          name: string
          receivedAmount: string
          rate: string
          commission: string
        }[]
      }>('/reports/commission'),
    retry: false,
  })

  return (
    <div>
      <ReportsFilterBar
        days={days}
        onDaysChange={setDays}
        exportPath="/reports/owner-performance?export=csv"
        exportName="performance.csv"
      />
      <WinLossBoard />
      <PartnerCommissionBoard />
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card size="small" title={t('reports.salesRankingDays', { days })}>
            <AutoFitTable
              rowKey="userId"
              size="small"
              pagination={false}
              dataSource={board.data ?? []}
              columns={[
                {
                  title: t('leaderboard.rank'),
                  dataIndex: 'rank',
                  width: 56,
                  render: (v: number) => (
                    <Tag color={v === 1 ? 'gold' : v === 2 ? 'silver' : v === 3 ? 'orange' : 'default'}>
                      {v === 1 ? '🥇' : v === 2 ? '🥈' : v === 3 ? '🥉' : v}
                    </Tag>
                  ),
                },
                { title: t('common.sales'), dataIndex: 'name' },
                {
                  title: t('leaderboard.trend'),
                  dataIndex: 'trend',
                  width: 56,
                  render: (v: string) => (
                    <Tag color={v === 'UP' ? 'green' : v === 'DOWN' ? 'red' : 'default'}>
                      {v === 'UP' ? '↑' : v === 'DOWN' ? '↓' : '→'}
                    </Tag>
                  ),
                },
                { title: t('enum.stage.WON'), dataIndex: 'wonAmount' },
                { title: t('nav.payments'), dataIndex: 'receivedAmount' },
                {
                  title: t('reports.attainment'),
                  dataIndex: 'attainment',
                  render: (v: string) => (
                    <Tag color={Number(v) >= 100 ? 'green' : Number(v) >= 60 ? 'blue' : 'default'}>
                      {v}
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.productivityComparisonThisMonth')}>
            <AutoFitTable
              rowKey="userId"
              size="small"
              loading={perf.isLoading}
              dataSource={perf.data ?? []}
              pagination={false}
              columns={[
                { title: t('common.sales'), dataIndex: 'name' },
                { title: t('reports.newLeads'), dataIndex: 'newLeads' },
                { title: t('common.deals2'), dataIndex: 'oppCount' },
                { title: t('common.wonAmount'), dataIndex: 'wonAmount' },
                { title: t('common.collectedAmount'), dataIndex: 'receivedAmount' },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('reports.goalAttainmentThisMonth')}>
            <AutoFitTable
              rowKey="goalId"
              size="small"
              pagination={false}
              dataSource={goals.data ?? []}
              columns={[
                { title: t('common.metric'), dataIndex: 'metric' },
                { title: t('nav.goals'), dataIndex: 'targetAmount' },
                { title: t('common.actual'), dataIndex: 'actualAmount' },
                { title: t('reports.attainment'), dataIndex: 'rate', render: (v: string) => `${v}%` },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.commissionAccrualThisMonth')}
            extra={<Link to="/reports/commission">{t('reports.commissionCenter')}</Link>}
          >
            <AutoFitTable
              rowKey="userId"
              size="small"
              pagination={false}
              dataSource={commission.data?.rows ?? []}
              columns={[
                { title: t('common.sales'), dataIndex: 'name' },
                { title: t('nav.payments'), dataIndex: 'receivedAmount' },
                { title: t('reports.rate'), dataIndex: 'rate' },
                { title: t('reports.commission'), dataIndex: 'commission', render: (v: string) => <b>{v}</b> },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('reports.forecastAccuracyLast6')}>
            <AutoFitTable
              rowKey="month"
              size="small"
              pagination={false}
              dataSource={forecastAcc.data ?? []}
              columns={[
                { title: t('common.month'), dataIndex: 'month' },
                { title: t('common.weightedForecast'), dataIndex: 'forecast' },
                { title: t('reports.actualWon'), dataIndex: 'actual' },
                {
                  title: t('reports.accuracy'),
                  dataIndex: 'accuracy',
                  render: (v: string) => (
                    <Tag
                      color={
                        Number(v) >= 80 && Number(v) <= 120 ? 'green' : Number(v) === 0 ? 'default' : 'orange'
                      }
                    >
                      {v}
                    </Tag>
                  ),
                },
                { title: t('reports.variance'), dataIndex: 'gap' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.forecastVariance', { v: bias.data?.month ?? '' })}
            extra={
              <Space>
                <Tag color="blue">{t('reports.attainment2', { v: bias.data?.summary.hitRate ?? '-' })}</Tag>
                <Tag color="red">{t('reports.overCommitted', { v: bias.data?.summary.overCommit ?? 0 })}</Tag>
              </Space>
            }
          >
            <AutoFitTable
              rowKey="userId"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={bias.data?.items ?? []}
              columns={[
                { title: t('common.sales'), dataIndex: 'name' },
                { title: 'Commit', dataIndex: 'commitAmount' },
                { title: t('enum.stage.WON'), dataIndex: 'wonAmount' },
                { title: t('reports.attainment'), dataIndex: 'hitRate' },
                {
                  title: t('reports.tendency'),
                  dataIndex: 'bias',
                  render: (v: string) => (
                    <Tag
                      color={
                        v === 'OVER_COMMIT' ? 'red' : v === 'OVER_DELIVER' ? 'green' : 'blue'
                      }
                    >
                      {v === 'OVER_COMMIT' ? t('reports.overCommitted2') : v === 'OVER_DELIVER' ? t('reports.overDelivered') : t('reports.onTarget')}
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <TerritoryBoard />
        </Col>
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>{t('reports.goalsAndMonthlyBreakdowns')}</Typography.Paragraph>
    </div>
  )
}
