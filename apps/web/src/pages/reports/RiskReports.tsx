import { useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Row, Space, Tag } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { BarChart, GaugeRing } from '../../components/SimpleCharts'
import { ReportsFilterBar, type ReportDays } from '../../components/ReportsFilterBar'
import { t } from '../../i18n'

export default function RiskReports() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [days, setDays] = useState<ReportDays>(90)
  const alerts = useQuery({
    queryKey: ['funnel-alerts'],
    queryFn: () =>
      api<{
        total: number
        high: number
        items: { level: string; type: string; message: string }[]
      }>('/reports/funnel-alerts'),
    retry: false,
  })
  const loss = useQuery({
    queryKey: ['loss-analysis', days],
    queryFn: () =>
      api<{
        total: number
        totalAmount: string
        byReason: { reason: string; count: number; amount: string }[]
      }>(`/reports/loss-analysis?days=${days}`),
    retry: false,
  })
  const competitors = useQuery({
    queryKey: ['competitor-analysis'],
    queryFn: () =>
      api<{ competitor: string; count: number; amount: string; won: number; lost: number; winRate: string }[]>(
        '/reports/competitor-analysis',
      ),
    retry: false,
  })
  const winReview = useQuery({
    queryKey: ['win-review', days],
    queryFn: () =>
      api<{
        total: number
        totalAmount: string
        bySource: { source: string; count: number }[]
        deals: { id: string; name: string; amount: string; owner: string; competitor: string }[]
      }>(`/reports/win-review?days=${days}`),
    retry: false,
  })
  const battleBoard = useQuery({
    queryKey: ['battlecard-board'],
    queryFn: () =>
      api<{
        total: number
        withCard: number
        avgCompleteness: number
        items: {
          id: string
          name: string
          amount: string
          completeness: number
          actionsDone: number
          actionsTotal: number
        }[]
      }>('/reports/battlecard-board'),
    retry: false,
  })
  const healthQueue = useQuery({
    queryKey: ['health-intervention-queue'],
    queryFn: () =>
      api<{
        total: number
        intervened: number
        pending: number
        items: { id: string; name: string; score: number; owner: string; intervened: boolean }[]
      }>('/reports/health-intervention-queue?limit=10'),
    retry: false,
  })
  const dataQuality = useQuery({
    queryKey: ['data-quality'],
    queryFn: () =>
      api<{
        score: number
        total: number
        high: number
        medium: number
        low: number
        items: { level: string; name: string; message: string }[]
      }>('/reports/data-quality'),
    retry: false,
  })
  const apiUsage = useQuery({
    queryKey: ['api-usage'],
    queryFn: () =>
      api<{
        total: number
        errorRate: string
        p50: number
        p95: number
        byPath: { path: string; count: number; avgMs: number; maxMs: number }[]
      }>('/reports/api-usage'),
    retry: false,
    refetchInterval: 30000,
  })

  return (
    <div>
      <ReportsFilterBar days={days} onDaysChange={setDays} />
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card
            size="small"
            title={t('common.funnelAlerts')}
            extra={
              <Tag color={alerts.data?.high ? 'red' : 'green'}>{t('common.highPriorityTotal', { v: alerts.data?.high ?? 0, v2: alerts.data?.total ?? 0 })}
              </Tag>
            }
          >
            {(alerts.data?.items ?? []).slice(0, 6).map((al, i) => (
              <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                <Tag color={al.level === 'HIGH' ? 'red' : al.level === 'MEDIUM' ? 'orange' : 'default'}>
                  {al.level}
                </Tag>
                {al.message}
              </div>
            ))}
            {!alerts.data?.items?.length && (
              <span style={{ color: '#646A73' }}>{t('common.funnelPaceNormal')}</span>
            )}
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.lossAnalysis90Days')}>
            <div style={{ fontSize: 12, color: '#646A73', marginBottom: 8 }}>{t('reports.lostDealsAmount', { v: loss.data?.total ?? 0, v2: loss.data?.totalAmount ?? '0' })}
            </div>
            <AutoFitTable
              rowKey="reason"
              size="small"
              pagination={false}
              dataSource={loss.data?.byReason ?? []}
              columns={[
                { title: t('common.reason'), dataIndex: 'reason' },
                { title: t('common.count'), dataIndex: 'count' },
                { title: t('audit.field.amount'), dataIndex: 'amount' },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('common.competitiveMatchups')}>
            <AutoFitTable
              rowKey="competitor"
              size="small"
              pagination={false}
              dataSource={competitors.data ?? []}
              columns={[
                { title: t('common.competitor'), dataIndex: 'competitor' },
                { title: t('reports.matchups'), dataIndex: 'count' },
                { title: t('audit.field.amount'), dataIndex: 'amount' },
                { title: t('common.winRate2'), dataIndex: 'winRate' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.warRoomCompleteness')}
            extra={
              <Space>
                <Tag>
                  {battleBoard.data?.withCard ?? 0}/{battleBoard.data?.total ?? 0}
                </Tag>
                <Tag color="blue">{t('reports.avg', { v: battleBoard.data?.avgCompleteness ?? 0 })}</Tag>
              </Space>
            }
          >
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={battleBoard.data?.items ?? []}
              columns={[
                {
                  title: t('nav.opportunities'),
                  dataIndex: 'name',
                  render: (v: string, r: { id: string }) => (
                    <Link to={`/opportunities/${r.id}`}>{v}</Link>
                  ),
                },
                { title: t('audit.field.amount'), dataIndex: 'amount' },
                {
                  title: t('reports.completeness'),
                  dataIndex: 'completeness',
                  render: (v: number) => (
                    <Tag color={v >= 70 ? 'green' : v >= 40 ? 'orange' : 'red'}>{v}%</Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.healthInterventionQueue')}
            extra={
              <Space>
                <Tag color="orange">{t('reports.toIntervene', { v: healthQueue.data?.pending ?? 0 })}</Tag>
                <Tag color="green">{t('reports.intervened', { v: healthQueue.data?.intervened ?? 0 })}</Tag>
              </Space>
            }
          >
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={healthQueue.data?.items ?? []}
              columns={[
                { title: t('nav.accounts'), dataIndex: 'name' },
                {
                  title: t('common.healthScore'),
                  dataIndex: 'score',
                  render: (v: number) => <Tag color={v >= 70 ? 'orange' : 'red'}>{v}</Tag>,
                },
                { title: t('audit.field.ownerId'), dataIndex: 'owner' },
                {
                  title: t('common.actions'),
                  render: (_: unknown, r: { id: string; intervened: boolean }) =>
                    r.intervened ? (
                      <Tag color="green">{t('reports.intervened2')}</Tag>
                    ) : (
                      <Button
                        size="small"
                        onClick={() => {
                          void api(`/reports/account-health/${r.id}/intervene`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'care_task' }),
                          }).then(() => {
                            void qc.invalidateQueries({ queryKey: ['health-intervention-queue'] })
                            message.success(t('reports.careFollowUpCreated'))
                          })
                        }}
                      >{t('reports.intervene')}</Button>
                    ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={t('common.dataQuality')}
            extra={
              <Tag
                color={
                  (dataQuality.data?.score ?? 0) >= 90
                    ? 'green'
                    : (dataQuality.data?.score ?? 0) >= 70
                      ? 'orange'
                      : 'red'
                }
              >{t('reports.qualityScore', { v: dataQuality.data?.score ?? 0 })}
              </Tag>
            }
          >
            <Space style={{ marginBottom: 8 }} wrap>
              <Tag color="red">{t('reports.high', { v: dataQuality.data?.high ?? 0 })}</Tag>
              <Tag color="orange">{t('common.medium', { v: dataQuality.data?.medium ?? 0 })}</Tag>
              <Tag>{t('reports.low', { v: dataQuality.data?.low ?? 0 })}</Tag>
            </Space>
            <AutoFitTable
              rowKey="__key"
              size="small"
              pagination={{ pageSize: 5 }}
              dataSource={(dataQuality.data?.items ?? []).map(
                (it: { type?: string; name?: string; message?: string }, i: number) => ({
                  ...it,
                  __key: `${it.type ?? 'issue'}-${it.name ?? ''}-${i}`,
                }),
              )}
              columns={[
                {
                  title: t('common.level'),
                  dataIndex: 'level',
                  render: (v: string) => (
                    <Tag color={v === 'HIGH' ? 'red' : v === 'MEDIUM' ? 'orange' : 'default'}>{v}</Tag>
                  ),
                },
                { title: t('common.object'), dataIndex: 'name' },
                { title: t('reports.issue'), dataIndex: 'message' },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Card
        size="small"
        title={t('reports.apiUsage15Min')}
        style={{ marginTop: 12 }}
        extra={
          <Space>
            <Tag>{t('common.requests', { v: apiUsage.data?.total ?? 0 })}</Tag>
            <Tag color={Number(apiUsage.data?.errorRate) > 5 ? 'red' : 'green'}>{t('common.errorRate', { v: apiUsage.data?.errorRate ?? 0 })}</Tag>
            <Tag color="blue">p50 {apiUsage.data?.p50 ?? 0}ms</Tag>
            <Tag color="orange">p95 {apiUsage.data?.p95 ?? 0}ms</Tag>
          </Space>
        }
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <GaugeRing value={Math.min(100, (apiUsage.data?.p50 ?? 0) / 2)} label={`p50 ${apiUsage.data?.p50 ?? 0}`} size={72} />
          <GaugeRing
            value={Math.min(100, (apiUsage.data?.p95 ?? 0) / 5)}
            label={`p95 ${apiUsage.data?.p95 ?? 0}`}
            color="#ea580c"
            size={72}
          />
          <BarChart
            items={(apiUsage.data?.byPath ?? []).slice(0, 6).map((p) => ({
              label: p.path.split('/').slice(-2).join('/'),
              value: p.count,
            }))}
            color="#0d9488"
            height={80}
          />
        </div>
        <AutoFitTable
          rowKey="path"
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={apiUsage.data?.byPath ?? []}
          columns={[
            { title: t('common.endpoint'), dataIndex: 'path' },
            { title: t('common.count'), dataIndex: 'count' },
            { title: t('common.avgMs'), dataIndex: 'avgMs' },
          ]}
        />
      </Card>
      <Card size="small" title={t('reports.winReview90Days')} style={{ marginTop: 12 }}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Tag color="green">{t('reports.won', { v: winReview.data?.total ?? 0, v2: winReview.data?.totalAmount ?? 0 })}
          </Tag>
          {(winReview.data?.bySource ?? []).slice(0, 5).map((s) => (
            <Tag key={s.source}>{s.source} {s.count}</Tag>
          ))}
        </Space>
        <AutoFitTable
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={winReview.data?.deals ?? []}
          columns={[
            { title: t('nav.opportunities'), dataIndex: 'name' },
            { title: t('audit.field.amount'), dataIndex: 'amount' },
            { title: t('audit.field.ownerId'), dataIndex: 'owner' },
            { title: t('common.competitor'), dataIndex: 'competitor' },
          ]}
        />
      </Card>
    </div>
  )
}
