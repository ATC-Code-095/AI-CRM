import { useQuery } from '@tanstack/react-query'
import { Card, Col, Empty, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { BarChart } from '../../components/SimpleCharts'
import { t } from '../../i18n'

const BUCKET: Record<string, { name: string; color: string }> = {
  COMMIT: { name: t('reports.bucket.commit'), color: '#0d9488' },
  BEST: { name: t('reports.bucket.best'), color: '#2b5fd9' },
  PIPELINE: { name: t('reports.bucket.pipeline'), color: '#d97706' },
}

/** 销售预测工作台：Commit/Best/Pipeline + 目标进度 + 预测准确性 */
export default function ForecastWorkbenchPage() {
  const board = useQuery({
    queryKey: ['forecast-board'],
    queryFn: () =>
      api<{
        buckets: {
          key: string
          name: string
          count: number
          amount: number | string
          items: {
            id: string
            name: string
            amount: string
            winRate: number
            stage: string
            account: string
            expectedCloseDate?: string
          }[]
        }[]
        totalAmount: string
      }>('/reports/forecast-board'),
    retry: false,
  })

  const goal = useQuery({
    queryKey: ['goal-attainment'],
    queryFn: () =>
      api<{
        items?: {
          metric: string
          target: string
          actual: string
          rate: string
          userName?: string
        }[]
        total?: { target: string; actual: string; rate: string }
      }>('/reports/goal-attainment'),
    retry: false,
  })

  const accuracy = useQuery({
    queryKey: ['forecast-accuracy'],
    queryFn: () =>
      api<{ month: string; forecast: string; actual: string; accuracy: string; gap: string }[]>(
        '/reports/forecast-accuracy',
      ),
    retry: false,
  })

  const board2 = useQuery({
    queryKey: ['sales-leaderboard'],
    queryFn: () =>
      api<{ items: { name: string; amount: string; count: number; winRate: string }[] }>(
        '/reports/sales-leaderboard',
      ),
    retry: false,
  })

  const buckets = board.data?.buckets ?? []
  const total = Number(board.data?.totalAmount ?? 0)
  const gItems = goal.data?.items ?? []
  const gTotal = goal.data?.total

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('common.forecastWorkbench')}</Typography.Title>
        <Space>
          <Link to="/opportunities">
            <Tag color="blue">{t('reports.dealBoard')}</Tag>
          </Link>
          <Link to="/reports">
            <Tag>{t('reports.allReports')}</Tag>
          </Link>
          <Tag>{dayjs().format('YYYY-MM-DD')}</Tag>
        </Space>
      </div>

      {/* 顶部 KPI */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={t('reports.pipelineTotal')}
              value={total}
              precision={0}
              suffix={t('reports.currencyYuan')}
              valueStyle={{ color: '#2b5fd9' }}
            />
          </Card>
        </Col>
        {buckets.map((b) => {
          const meta = BUCKET[b.key] ?? { name: b.name, color: '#64748b' }
          return (
            <Col span={6} key={b.key}>
              <Card size="small" style={{ borderTop: `3px solid ${meta.color}` }}>
                <Statistic
                  title={meta.name}
                  value={Number(b.amount)}
                  precision={0}
                  suffix={t('reports.deals', { count: b.count })}
                  valueStyle={{ color: meta.color }}
                />
              </Card>
            </Col>
          )
        })}
      </Row>

      {/* Commit / Best / Pipeline 三列 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {buckets.map((b) => {
          const meta = BUCKET[b.key] ?? { name: b.name, color: '#64748b' }
          return (
            <Col span={8} key={b.key}>
              <Card
                size="small"
                title={
                  <Space>
                    <span style={{ color: meta.color }}>●</span>
                    {meta.name}
                    <Tag>{t('common.deals', { count: b.count })}</Tag>
                  </Space>
                }
                extra={<b>{Number(b.amount).toLocaleString()}</b>}
                style={{ minHeight: 260 }}
              >
                {(b.items ?? []).slice(0, 6).map((it) => (
                  <div
                    key={it.id}
                    style={{
                      padding: '6px 0',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: 12,
                    }}
                  >
                    <Link to={`/opportunities/${it.id}`}>{it.name}</Link>
                    <div style={{ color: '#64748b', marginTop: 2 }}>
                      {t('reports.winRate', { account: it.account, stage: it.stage, winRate: it.winRate })}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span>{Number(it.amount).toLocaleString()}</span>
                      <span style={{ color: '#94a3b8' }}>
                        {it.expectedCloseDate ? it.expectedCloseDate.slice(0, 10) : ''}
                      </span>
                    </div>
                  </div>
                ))}
                {(b.items ?? []).length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
              </Card>
            </Col>
          )
        })}
      </Row>

      <Row gutter={12}>
        <Col span={12}>
          <Card size="small" title={t('reports.goalAttainmentProgress')}>
            {gTotal ? (
              <div style={{ marginBottom: 12 }}>
                <Progress
                  percent={Math.min(100, Number(gTotal.rate) || 0)}
                  status={Number(gTotal.rate) >= 100 ? 'success' : 'active'}
                  format={(p) => `${p}%`}
                />
                <Typography.Text type="secondary">{t('reports.goalActual', { target: gTotal.target, actual: gTotal.actual })}
                </Typography.Text>
              </div>
            ) : null}
            <Table
              rowKey={(_r, i) => String(i)}
              size="small"
              pagination={false}
              dataSource={gItems.slice(0, 8)}
              columns={[
                { title: t('reports.memberMetric'), dataIndex: 'userName', render: (v, r) => v || (r as { metric?: string }).metric },
                { title: t('nav.goals'), dataIndex: 'target' },
                { title: t('common.actual'), dataIndex: 'actual' },
                {
                  title: t('common.attained'),
                  dataIndex: 'rate',
                  render: (v: string) => (
                    <Tag color={Number(v) >= 100 ? 'green' : Number(v) >= 70 ? 'orange' : 'red'}>
                      {v}%
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title={t('reports.forecastAccuracyRecentMonths')}>
            {accuracy.data?.length ? (
              <>
                <BarChart
                  items={accuracy.data.map((r) => ({
                    label: r.month,
                    value: Number(r.accuracy),
                  }))}
                  color="#0d9488"
                  height={120}
                />
                <Table
                  rowKey="month"
                  size="small"
                  pagination={false}
                  style={{ marginTop: 12 }}
                  dataSource={accuracy.data}
                  columns={[
                    { title: t('common.month'), dataIndex: 'month' },
                    { title: t('reports.forecast'), dataIndex: 'forecast' },
                    { title: t('common.actual'), dataIndex: 'actual' },
                    {
                      title: t('reports.accuracy2'),
                      dataIndex: 'accuracy',
                      render: (v: string) => <Tag>{v}%</Tag>,
                    },
                    { title: t('reports.variance'), dataIndex: 'gap' },
                  ]}
                />
              </>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.noForecastData')} />
            )}
          </Card>
        </Col>
      </Row>

      <Card size="small" title={t('common.salesRanking30Days')} style={{ marginTop: 16 }}>
        <Table
          rowKey={(_r, i) => String(i)}
          size="small"
          pagination={{ pageSize: 8 }}
          dataSource={board2.data?.items ?? []}
          columns={[
            { title: t('reports.member'), dataIndex: 'name' },
            {
              title: t('reports.closedAmount'),
              dataIndex: 'amount',
              render: (v: string) => Number(v).toLocaleString(),
            },
            { title: t('reports.deals2'), dataIndex: 'count' },
            {
              title: t('audit.field.winRate'),
              dataIndex: 'winRate',
              render: (v: string) => (
                <Tag color={Number(v) >= 50 ? 'green' : Number(v) >= 30 ? 'orange' : 'default'}>
                  {v}%
                </Tag>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
