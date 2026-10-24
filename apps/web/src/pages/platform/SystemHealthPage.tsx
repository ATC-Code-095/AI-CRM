import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Progress, Row, Space, Statistic, Table, Tag, Typography } from 'antd'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { t, tLabel } from '../../i18n'

type Health = { status: string; db: string; redis: string }
type Perf = {
  windowMinutes: number
  total: number
  errorCount: number
  errorRate: string
  p50: number
  p95: number
  byPath: { path: string; count: number; avgMs: number }[]
}
type ApiUsage = {
  total: number
  errorCount: number
  errorRate: string
  p50: number
  p95: number
  categories: { name: string; count: number }[]
}

/** 系统健康仪表盘 */
export default function SystemHealthPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()

  const health = useQuery({
    queryKey: ['sys-health'],
    queryFn: () => api<Health>('/health'),
    refetchInterval: 30_000,
  })
  const perf = useQuery({
    queryKey: ['sys-perf'],
    queryFn: () => api<Perf>('/health/perf'),
    refetchInterval: 30_000,
  })
  const usage = useQuery({
    queryKey: ['api-usage'],
    queryFn: () => api<ApiUsage>('/reports/api-usage'),
    refetchInterval: 60_000,
  })

  const runJobs = useMutation({
    mutationFn: () => api('/jobs/run-daily', { method: 'POST' }),
    onSuccess: () => {
      message.success(t('platform.dailyAutomationExecuted'))
      void qc.invalidateQueries({ queryKey: ['sys-perf'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const h = health.data
  const p = perf.data
  const u = usage.data
  const errRate = Number(u?.errorRate ?? p?.errorRate ?? 0)

  return (
    <ErpListShell
      program="mtsys0001"
      title={t('common.systemHealth')}
      subtitle={t('platform.platformMonitoringOps')}
      density="small"
      onRefresh={() => {
        void qc.invalidateQueries({ queryKey: ['sys-health'] })
        void qc.invalidateQueries({ queryKey: ['sys-perf'] })
        void qc.invalidateQueries({ queryKey: ['api-usage'] })
      }}
      extraActions={
        <Button size="small" type="primary" loading={runJobs.isPending} onClick={() => runJobs.mutate()}>{t('platform.runDailyAutomation')}</Button>
      }
    >
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title={t('platform.serviceStatus')}
              value={h?.status === 'ok' ? t('common.normal') : t('platform.degraded')}
              valueStyle={{ color: h?.status === 'ok' ? '#16a34a' : '#dc2626' }}
            />
            <Space style={{ marginTop: 6 }}>
              <Tag color={h?.db === 'up' ? 'green' : 'red'}>DB {h?.db ?? '…'}</Tag>
              <Tag color={h?.redis === 'up' ? 'green' : h?.redis === 'down' ? 'red' : 'default'}>
                Redis {h?.redis ?? '…'}
              </Tag>
            </Space>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title={t('platform.requests15Min')} value={u?.total ?? p?.total ?? 0} />
            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>{t('platform.errorsErrorRate', { v: u?.errorCount ?? p?.errorCount ?? 0, errRate })}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="P50" value={u?.p50 ?? p?.p50 ?? 0} suffix="ms" />
            <Progress
              percent={Math.min(100, ((u?.p50 ?? 0) / 500) * 100)}
              showInfo={false}
              strokeColor={(u?.p50 ?? 0) > 300 ? '#d97706' : '#16a34a'}
              size="small"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="P95"
              value={u?.p95 ?? p?.p95 ?? 0}
              suffix="ms"
              valueStyle={{ color: (u?.p95 ?? 0) > 1000 ? '#dc2626' : undefined }}
            />
            <Progress
              percent={Math.min(100, ((u?.p95 ?? 0) / 2000) * 100)}
              showInfo={false}
              strokeColor={(u?.p95 ?? 0) > 1000 ? '#dc2626' : '#2b5fd9'}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col span={14}>
          <Card size="small" title={t('platform.topSlowEndpointsLast')}>
            <Table
              rowKey="path"
              size="small"
              pagination={{ pageSize: 8 }}
              dataSource={p?.byPath ?? []}
              columns={[
                { title: t('common.endpoint'), dataIndex: 'path', ellipsis: true },
                { title: t('common.count'), dataIndex: 'count', width: 80 },
                {
                  title: t('platform.avgLatency'),
                  dataIndex: 'avgMs',
                  width: 100,
                  render: (v: number) => (
                    <Tag color={v > 500 ? 'red' : v > 200 ? 'orange' : 'green'}>{v}ms</Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" title={t('platform.endpointCategoryShare')}>
            {(u?.categories ?? []).map((c) => (
              <div key={c.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{tLabel(c.name)}</span>
                  <b>{c.count}</b>
                </div>
                <Progress
                  percent={
                    u?.total ? Math.round((c.count / Math.max(1, u.total)) * 100) : 0
                  }
                  size="small"
                />
              </div>
            ))}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('platform.windowMinAutoRefresh', { v: p?.windowMinutes ?? 15 })}</Typography.Text>
          </Card>
          <Card size="small" title={t('platform.alertThresholds')} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 2 }}>{t('platform.errorRate5Triggers')}<br />{t('platform.p952000msTriggersA')}<br />{t('platform.windowRequests5000Triggers')}<br />{t('platform.runsDailyAt08')}</div>
          </Card>
        </Col>
      </Row>
    </ErpListShell>
  )
}
