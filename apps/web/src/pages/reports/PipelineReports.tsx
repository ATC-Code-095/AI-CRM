import { useQuery } from '@tanstack/react-query'
import { Card, Col, Row, Space, Tag } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useState } from 'react'
import { api } from '../../api/client'
import { BarChart, ChartFrame, GaugeRing, Sparkline } from '../../components/SimpleCharts'
import { ReportsFilterBar, type ReportDays } from '../../components/ReportsFilterBar'
import { FunnelPlaybook } from '../../components/FunnelPlaybook'
import { t } from '../../i18n'

export default function PipelineReports() {
  const [days, setDays] = useState<ReportDays>(90)
  const funnel = useQuery({
    queryKey: ['sales-funnel'],
    queryFn: () =>
      api<{ name: string; count: number; amount: string; weightedAmount: string }[]>(
        '/reports/sales-funnel',
      ),
    retry: false,
  })
  const cash = useQuery({
    queryKey: ['cash-funnel'],
    queryFn: () =>
      api<{ key: string; name: string; count: number; rateFromPrev: string; rateFromTop: string }[]>(
        '/reports/cash-funnel',
      ),
    retry: false,
  })
  const velocity = useQuery({
    queryKey: ['stage-velocity'],
    queryFn: () =>
      api<{ name: string; samples: number; avgDays: string; maxDays: string }[]>(
        '/reports/stage-velocity',
      ),
    retry: false,
  })
  const gantt = useQuery({
    queryKey: ['deal-gantt'],
    queryFn: () =>
      api<{
        maxDays: number
        items: {
          id: string
          name: string
          amount: string
          owner: string
          currentStage: string
          totalDays: string
          segments: { stage: string; days: number; start: number }[]
        }[]
      }>('/reports/deal-gantt?limit=8'),
    retry: false,
  })
  const cycle = useQuery({
    queryKey: ['sales-cycle', days],
    queryFn: () =>
      api<{ avgDays: number; sample: number; buckets: { label: string; count: number }[] }>(
        `/reports/sales-cycle?days=${days}`,
      ),
    retry: false,
  })
  const conv = useQuery({
    queryKey: ['stage-conversion', days],
    queryFn: () =>
      api<{
        days: number
        conversions: {
          from: string
          to: string
          fromCount: number
          toCount: number
          rate: string
          fromAmount: string
          toAmount: string
        }[]
        stageMoves: { stage: string; moves: number }[]
      }>(`/reports/stage-conversion?days=${days}`),
    retry: false,
  })
  const scoreBoard = useQuery({
    queryKey: ['score-board'],
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          amount: string
          winRate: number
          stage: string
          account: string
          score: number
          grade: string
          acts: number
        }[]
        total: number
      }>('/reports/score-board?limit=12'),
    retry: false,
  })
  const health = useQuery({
    queryKey: ['funnel-health'],
    queryFn: () =>
      api<{
        score: number
        level: string
        balance: string
        alertScore: string
        alertCount: number
        highAlerts: number
        stages: { name: string; count: number; share: string }[]
      }>('/reports/funnel-health'),
    retry: false,
  })
  const healthTrend = useQuery({
    queryKey: ['funnel-health-trend'],
    queryFn: () =>
      api<{
        current: { score: number; level: string }
        points: { date: string; score: number }[]
      }>('/reports/funnel-health-trend'),
    retry: false,
  })

  return (
    <div>
      <ReportsFilterBar
        days={days}
        onDaysChange={setDays}
        exportPath="/reports/sales-funnel?export=csv"
        exportName="pipeline-funnel.csv"
      />
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card
            size="small"
            className="crm-panel-fixed crm-panel-sm"
            title={t('reports.funnelHealth')}
            extra={
              <Tag
                color={
                  health.data?.level === 'HEALTHY'
                    ? 'green'
                    : health.data?.level === 'AT_RISK'
                      ? 'orange'
                      : 'red'
                }
              >
                {health.data?.level ?? '-'}
              </Tag>
            }
          >
            <Space size="large" wrap>
              <GaugeRing
                value={health.data?.score ?? 0}
                label={t('common.healthScore')}
                size={72}
                color={
                  (health.data?.score ?? 0) >= 80
                    ? '#0d9488'
                    : (health.data?.score ?? 0) >= 50
                      ? '#d97706'
                      : '#e11d48'
                }
              />
              <div style={{ fontSize: 12, color: '#646A73' }}>
                <div>{t('reports.distributionBalance', { v: health.data?.balance ?? 0 })}</div>
                <div>{t('reports.alertDeductions', { v: health.data?.alertScore ?? 0 })}</div>
                <div>{t('reports.alertsHighPriority', { v: health.data?.alertCount ?? 0, v2: health.data?.highAlerts ?? 0 })}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {(health.data?.stages ?? []).map((s) => (
                  <Tag key={s.name} color={Number(s.share) >= 30 ? 'blue' : 'default'}>
                    {s.name} {s.share}%
                  </Tag>
                ))}
              </div>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{t('reports.healthTrend')}</div>
                <Sparkline
                  points={(healthTrend.data?.points ?? []).map((p) => ({
                    date: p.date,
                    avg: p.score,
                  }))}
                  labelKey="avg"
                  height={48}
                  color="#2b5fd9"
                />
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('common.salesFunnel')}>
            <AutoFitTable
              rowKey="name"
              size="small"
              pagination={false}
              loading={funnel.isLoading}
              dataSource={funnel.data ?? []}
              columns={[
                { title: t('audit.field.stage'), dataIndex: 'name' },
                { title: t('common.qty'), dataIndex: 'count' },
                { title: t('audit.field.amount'), dataIndex: 'amount' },
                { title: t('reports.weighted'), dataIndex: 'weightedAmount' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.leadCashConversion')}>
            <AutoFitTable
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={cash.data ?? []}
              columns={[
                { title: t('audit.field.stage'), dataIndex: 'name' },
                { title: t('common.qty'), dataIndex: 'count' },
                {
                  title: t('reports.stepConversion'),
                  dataIndex: 'rateFromPrev',
                  render: (v: string) => (
                    <Tag color={Number(v) >= 50 ? 'green' : Number(v) >= 20 ? 'blue' : 'orange'}>
                      {v}
                    </Tag>
                  ),
                },
                { title: t('reports.relativeToLeads'), dataIndex: 'rateFromTop' },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('reports.stageConversionLastDays', { days })}>
            <AutoFitTable<{
              from: string
              to: string
              fromCount: number
              toCount: number
              rate: string
              fromAmount: string
              toAmount: string
            }>
              rowKey={(r) => `${r.from}-${r.to}`}
              size="small"
              pagination={false}
              loading={conv.isLoading}
              dataSource={conv.data?.conversions ?? []}
              columns={[
                {
                  title: t('common.convert'),
                  render: (_: unknown, r) => (
                    <span>
                      {r.from} <span style={{ color: '#94a3b8' }}>→</span> {r.to}
                    </span>
                  ),
                },
                {
                  title: t('reports.countRatio'),
                  render: (_: unknown, r) => `${r.fromCount} → ${r.toCount}`,
                },
                {
                  title: t('reports.conversion2'),
                  dataIndex: 'rate',
                  render: (v: string) => (
                    <Tag color={Number(v) >= 50 ? 'green' : Number(v) >= 20 ? 'blue' : 'orange'}>{v}</Tag>
                  ),
                },
                {
                  title: t('reports.amountRatio'),
                  render: (_: unknown, r) => (
                    <span style={{ fontSize: 12 }}>
                      {r.fromAmount} → {r.toAmount}
                    </span>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.stageAdvancesConversionMomentum')}>
            <ChartFrame filename="stage-moves-chart">
              <BarChart
                items={(conv.data?.stageMoves ?? []).map((m) => ({ label: m.stage, value: m.moves }))}
                color="#7c3aed"
              />
            </ChartFrame>
            <div style={{ marginTop: 8, fontSize: 12, color: '#646A73' }}>{t('reports.stageChangesInThe', { days })}</div>
          </Card>
        </Col>
      </Row>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('reports.stageDurationDays')}>
            <AutoFitTable
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={velocity.data ?? []}
              columns={[
                { title: t('audit.field.stage'), dataIndex: 'name' },
                { title: t('reports.samples'), dataIndex: 'samples' },
                { title: t('reports.average'), dataIndex: 'avgDays' },
                { title: t('reports.longest'), dataIndex: 'maxDays' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.salesCycleDistribution')}>
            <ChartFrame filename="sales-cycle-chart">
              <div style={{ marginBottom: 8, fontSize: 12, color: '#646A73' }}>{t('reports.average')}{' '}<b>{cycle.data?.avgDays ?? 0}</b>{' '}{t('reports.daysSamples', { v: cycle.data?.sample ?? 0 })}
              </div>
              <BarChart
                items={(cycle.data?.buckets ?? []).map((b) => ({ label: b.label, value: b.count }))}
                color="#2563eb"
              />
            </ChartFrame>
          </Card>
        </Col>
      </Row>
      <FunnelPlaybook />
      <Card
        size="small"
        title={t('reports.winProbabilityBoardOpen')}
        style={{ marginTop: 12 }}
        extra={<Tag color="blue">{t('reports.total', { v: scoreBoard.data?.total ?? 0 })}</Tag>}
      >
        <AutoFitTable
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8 }}
          loading={scoreBoard.isLoading}
          dataSource={scoreBoard.data?.items ?? []}
          columns={[
            {
              title: t('common.score'),
              dataIndex: 'score',
              width: 80,
              render: (v: number, r: { grade: string }) => (
                <Tag color={r.grade === 'A' ? 'green' : r.grade === 'B' ? 'blue' : r.grade === 'C' ? 'orange' : 'red'}>
                  {v} · {r.grade}
                </Tag>
              ),
            },
            { title: t('nav.opportunities'), dataIndex: 'name' },
            { title: t('nav.accounts'), dataIndex: 'account' },
            { title: t('audit.field.stage'), dataIndex: 'stage' },
            { title: t('audit.field.amount'), dataIndex: 'amount' },
            {
              title: t('common.winRate2'),
              dataIndex: 'winRate',
              width: 80,
              render: (v: number) => `${v}%`,
            },
            {
              title: t('reports.followUps30Days'),
              dataIndex: 'acts',
              width: 90,
              render: (v: number) => (
                <Tag color={v >= 3 ? 'green' : v >= 1 ? 'blue' : 'red'}>{v}</Tag>
              ),
            },
          ]}
        />
      </Card>
      <Card
        size="small"
        title={t('reports.warRoomStageDuration')}
        style={{ marginTop: 12 }}
        extra={<Tag color="blue">Top {gantt.data?.items?.length ?? 0}</Tag>}
      >
        {(gantt.data?.items ?? []).map((d) => {
          const max = Math.max(gantt.data?.maxDays ?? 1, 1)
          return (
            <div key={d.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>
                  <b>{d.name}</b>
                  <span style={{ color: '#8b919a' }}> · {d.owner} · {d.currentStage}</span>
                </span>
                <span>
                  {t('reports.days', { totalDays: d.totalDays, amount: d.amount })}
                </span>
              </div>
              <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', background: '#f1f5f9' }}>
                {(d.segments ?? []).map((seg, i) => {
                  const colors = ['#2563eb', '#0d9488', '#7c3aed', '#ea580c', '#ca8a04', '#dc2626']
                  return (
                    <div
                      key={i}
                      title={t('reports.days2', { days: seg.days })}
                      style={{
                        width: `${Math.max((seg.days / max) * 100, 2)}%`,
                        background: colors[i % colors.length],
                        opacity: 0.85,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        {!gantt.data?.items?.length && (
          <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('reports.noDealsInProgress')}</div>
        )}
      </Card>
    </div>
  )
}
