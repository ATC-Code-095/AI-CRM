import { useQuery } from '@tanstack/react-query'
import { Card, Col, Empty, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { BarChart } from '../../components/SimpleCharts'
import { t } from '../../i18n'

type Aging = {
  totalDue: string
  buckets: { label: string; count: number; amount: string }[]
}
type Forecast = {
  days: number
  planCount: number
  forecastAmount: string
  plans: {
    id: string
    dueDate: string
    amount: string
    received: string
    contractNo?: string
  }[]
}

const BUCKET_COLORS = ['#dc2626', '#ea580c', '#d97706', '#64748b']

/** 回款账龄与预测工作台 */
export default function PaymentWorkbenchPage() {
  const aging = useQuery({
    queryKey: ['payment-aging'],
    queryFn: () => api<Aging>('/reports/payment-aging'),
    retry: false,
  })
  const forecast = useQuery({
    queryKey: ['payment-forecast'],
    queryFn: () => api<Forecast>('/reports/payment-forecast?days=90'),
    retry: false,
  })

  const buckets = aging.data?.buckets ?? []
  const plans = forecast.data?.plans ?? []

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('reports.receivablesAgingForecast')}</Typography.Title>
        <Space>
          <Link to="/contracts">
            <Tag color="blue">{t('reports.contractPayments')}</Tag>
          </Link>
          <Tag>{dayjs().format('YYYY-MM-DD')}</Tag>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={t('reports.totalOverdueReceivables')}
              value={Number(aging.data?.totalDue ?? 0)}
              precision={2}
              valueStyle={{ color: '#dc2626' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title={t('reports.forecastCollectionsNextDays', { v: forecast.data?.days ?? 90 })}
              value={Number(forecast.data?.forecastAmount ?? 0)}
              precision={2}
              valueStyle={{ color: '#0d9488' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title={t('reports.pendingPaymentPlans')} value={forecast.data?.planCount ?? 0} suffix={t('reports.text')} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={t('reports.overdueAgingDistribution')} style={{ marginBottom: 16 }}>
        {buckets.length ? (
          <>
            <BarChart
              items={buckets.map((b) => ({ label: b.label, value: Number(b.amount) }))}
              color="#dc2626"
              height={140}
            />
            <Table
              rowKey="label"
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              dataSource={buckets}
              columns={[
                {
                  title: t('reports.aging'),
                  dataIndex: 'label',
                  render: (v: string, _r: unknown, i: number) => (
                    <Tag color={BUCKET_COLORS[i] ?? 'default'}>{v}</Tag>
                  ),
                },
                { title: t('common.count2'), dataIndex: 'count', width: 90 },
                {
                  title: t('reports.overdueAmount'),
                  dataIndex: 'amount',
                  render: (v: string) => Number(v).toLocaleString(),
                },
                {
                  title: t('common.share'),
                  render: (_: unknown, r: { amount: string }) => {
                    const total = Number(aging.data?.totalDue ?? 0)
                    const pct = total > 0 ? Math.round((Number(r.amount) / total) * 100) : 0
                    return <Progress percent={pct} size="small" status="exception" />
                  },
                },
              ]}
            />
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.noOverduePlans')} />
        )}
      </Card>

      <Card size="small" title={t('reports.upcomingPaymentPlansBy')}>
        {plans.length ? (
          <Table
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={plans}
            columns={[
              {
                title: t('common.dueDate'),
                dataIndex: 'dueDate',
                width: 110,
                render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
              },
              {
                title: t('nav.contracts'),
                dataIndex: 'contractNo',
                render: (v: string) => v || '-',
              },
              {
                title: t('common.plannedAmount'),
                dataIndex: 'amount',
                width: 110,
                render: (v: string) => Number(v).toLocaleString(),
              },
              {
                title: t('audit.field.receivedAmount'),
                dataIndex: 'received',
                width: 100,
                render: (v: string) => Number(v).toLocaleString(),
              },
              {
                title: t('reports.toCollect'),
                width: 110,
                render: (_: unknown, r: { amount: string; received: string }) => (
                  <b style={{ color: '#dc2626' }}>
                    {(Number(r.amount) - Number(r.received)).toLocaleString()}
                  </b>
                ),
              },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('reports.noPendingPaymentPlans')} />
        )}
      </Card>
    </div>
  )
}
