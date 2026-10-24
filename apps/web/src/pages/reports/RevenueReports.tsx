import { useQuery } from '@tanstack/react-query'
import { Card, Col, Row, Space, Tag } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { api } from '../../api/client'
import { RenewalPlaybook } from '../../components/RenewalPlaybook'
import { t } from '../../i18n'

export default function RevenueReports() {
  const forecast = useQuery({
    queryKey: ['payment-forecast'],
    queryFn: () =>
      api<{ planCount: number; forecastAmount: string }>('/reports/payment-forecast?days=90'),
    retry: false,
  })
  const renewal = useQuery({
    queryKey: ['renewal-board'],
    queryFn: () =>
      api<{
        total: number
        notStarted: number
        inProgress: number
        renewed: number
        items: {
          contractId: string
          contractNo: string
          accountName: string
          total: string
          expireDate: string
          daysLeft: number
          owner: string
          status: string
          renewalOpp: { name: string; amount: string; stage: string } | null
        }[]
      }>('/reports/renewal-board?days=90'),
    retry: false,
  })
  const renewalF = useQuery({
    queryKey: ['renewal-forecast'],
    queryFn: () =>
      api<{
        totalEstimated: string
        high: number
        medium: number
        low: number
        items: {
          contractId: string
          accountName: string
          total: string
          probability: number
          estimated: string
        }[]
      }>('/reports/renewal-forecast?days=90'),
    retry: false,
  })
  const expiring = useQuery({
    queryKey: ['contract-expiring'],
    queryFn: () =>
      api<{ id: string; contractNo: string; title: string; expireDate: string | null; total: string }[]>(
        '/reports/contract-expiring?days=30',
      ),
    retry: false,
  })
  const aging = useQuery({
    queryKey: ['payment-aging'],
    queryFn: () =>
      api<{ totalDue: string; buckets: { label: string; count: number; amount: string }[] }>(
        '/reports/payment-aging',
      ),
    retry: false,
  })

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card size="small" title={t('reports.paymentForecast90Days')}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>
              {forecast.data?.forecastAmount ?? '0'}
            </div>
            <div style={{ color: '#646A73', fontSize: 12 }}>{t('reports.plannedCount', { v: forecast.data?.planCount ?? 0 })}
            </div>
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.receivablesAging')}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{aging.data?.totalDue ?? '0'}</div>
            <Space wrap size={4} style={{ marginTop: 8 }}>
              {(aging.data?.buckets ?? []).map((b) => (
                <Tag key={b.label} color={b.count > 0 ? 'orange' : 'default'}>
                  {b.label} {b.count}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.renewalEstimate90Days')}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>
              {renewalF.data?.totalEstimated ?? '0'}
            </div>
            <Space size={4} style={{ marginTop: 8 }}>
              <Tag color="green">{t('reports.high', { v: renewalF.data?.high ?? 0 })}</Tag>
              <Tag color="orange">{t('common.medium', { v: renewalF.data?.medium ?? 0 })}</Tag>
              <Tag color="red">{t('reports.low', { v: renewalF.data?.low ?? 0 })}</Tag>
            </Space>
          </Card>
        </Col>
      </Row>
      <RenewalPlaybook />
      <Card
        size="small"
        title={t('reports.contractRenewalsBoard90')}
        style={{ marginTop: 12 }}
        extra={
          <Space>
            <Tag>{t('reports.total2', { v: renewal.data?.total ?? 0 })}</Tag>
            <Tag color="red">{t('reports.notStarted', { v: renewal.data?.notStarted ?? 0 })}</Tag>
            <Tag color="orange">{t('reports.inProgress', { v: renewal.data?.inProgress ?? 0 })}</Tag>
            <Tag color="green">{t('reports.renewed', { v: renewal.data?.renewed ?? 0 })}</Tag>
          </Space>
        }
      >
        <AutoFitTable
          rowKey="contractId"
          size="small"
          pagination={{ pageSize: 8 }}
          dataSource={renewal.data?.items ?? []}
          columns={[
            { title: t('audit.field.contractNo'), dataIndex: 'contractNo' },
            { title: t('nav.accounts'), dataIndex: 'accountName' },
            { title: t('audit.field.amount'), dataIndex: 'total' },
            {
              title: t('reports.expiry'),
              dataIndex: 'expireDate',
              render: (v: string, r: Record<string, unknown>) => (
                <Space>
                  {v}
                  <Tag
                    color={
                      Number(r.daysLeft) <= 15 ? 'red' : Number(r.daysLeft) <= 30 ? 'orange' : 'default'
                    }
                  >
                    {t('reports.days3', { daysLeft: String(r.daysLeft) })}</Tag>
                </Space>
              ),
            },
            {
              title: t('common.renewalDeal'),
              render: (_: unknown, r: Record<string, unknown>) => {
                const opp = r.renewalOpp as { name: string; stage: string } | null
                return opp ? (
                  <Space>
                    {opp.name}
                    <Tag>{opp.stage}</Tag>
                  </Space>
                ) : (
                  <Tag color="red">{t('reports.notCreated')}</Tag>
                )
              },
            },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              render: (v: string) => (
                <Tag
                  color={
                    v === 'RENEWED' ? 'green' : v === 'IN_PROGRESS' ? 'blue' : v === 'CHURN_RISK' ? 'red' : 'orange'
                  }
                >
                  {v === 'RENEWED'
                    ? t('reports.renewed2')
                    : v === 'IN_PROGRESS'
                      ? t('common.inProgress')
                      : v === 'CHURN_RISK'
                        ? t('reports.churnRisk')
                        : t('reports.notStarted2')}
                </Tag>
              ),
            },
          ]}
        />
      </Card>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('reports.topRenewalProbability')}>
            <AutoFitTable
              rowKey="contractId"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={(renewalF.data?.items ?? []).slice(0, 8)}
              columns={[
                { title: t('nav.accounts'), dataIndex: 'accountName' },
                { title: t('audit.field.amount'), dataIndex: 'total' },
                {
                  title: t('reports.probability'),
                  dataIndex: 'probability',
                  render: (v: number) => (
                    <Tag color={v >= 70 ? 'green' : v >= 40 ? 'orange' : 'red'}>{v}%</Tag>
                  ),
                },
                { title: t('reports.estimate'), dataIndex: 'estimated' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.contractsExpiring30Days')}>
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={expiring.data ?? []}
              columns={[
                { title: t('audit.field.contractNo'), dataIndex: 'contractNo' },
                { title: t('audit.field.title'), dataIndex: 'title' },
                {
                  title: t('reports.expiry'),
                  dataIndex: 'expireDate',
                  render: (v: string | null) => (v ? v.slice(0, 10) : '-'),
                },
                { title: t('audit.field.amount'), dataIndex: 'total' },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
