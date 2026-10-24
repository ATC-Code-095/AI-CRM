import { useQuery } from '@tanstack/react-query'
import { Card, Col, Progress, Row, Statistic, Table, Tag } from 'antd'
import { api } from '../api/client'
import { BarChart } from './SimpleCharts'
import { t } from '../i18n'

/** 赢单/输单对比看板（对标 Salesforce Win/Loss Analysis） */
export function WinLossBoard() {
  const win = useQuery({
    queryKey: ['win-review'],
    queryFn: () =>
      api<{
        total: number
        totalAmount: string
        bySource: { source: string; count: number; amount: number }[]
        byCompetitor: { competitor: string; count: number; amount: number }[]
      }>('/reports/win-review?days=90'),
    retry: false,
  })
  const loss = useQuery({
    queryKey: ['loss-analysis'],
    queryFn: () =>
      api<{
        total: number
        totalAmount: string
        byReason: { reason: string; count: number; amount: number }[]
      }>('/reports/loss-analysis?days=90'),
    retry: false,
  })

  const winN = win.data?.total ?? 0
  const lossN = loss.data?.total ?? 0
  const winRate = winN + lossN > 0 ? ((winN / (winN + lossN)) * 100).toFixed(1) : '0'

  return (
    <Card
      size="small"
      title={t('cmp.winLossBoard.wonVsLost90')}
      style={{ marginBottom: 12 }}
      extra={<Tag color={Number(winRate) >= 50 ? 'green' : 'blue'}>{t('common.winRate', { winRate })}</Tag>}
    >
      <Row gutter={[12, 12]}>
        <Col xs={24} md={8}>
          <Statistic title={t('enum.stage.WON')} value={winN} valueStyle={{ color: '#0d9488' }} />
          <div style={{ fontSize: 12, color: '#646A73', marginBottom: 8 }}>{t('cmp.winLossBoard.amount', { v: win.data?.totalAmount ?? '0' })}
          </div>
          <Progress
            percent={winN + lossN ? Math.round((winN / (winN + lossN)) * 100) : 0}
            strokeColor="#0d9488"
            size="small"
          />
          <div style={{ marginTop: 12, fontSize: 12, color: '#646A73' }}>{t('cmp.winLossBoard.winSources')}</div>
          <BarChart
            items={(win.data?.bySource ?? []).slice(0, 5).map((s) => ({
              label: s.source,
              value: s.count,
            }))}
            color="#0d9488"
            height={80}
          />
        </Col>
        <Col xs={24} md={8}>
          <Statistic title={t('enum.stage.LOST')} value={lossN} valueStyle={{ color: '#e11d48' }} />
          <div style={{ fontSize: 12, color: '#646A73', marginBottom: 8 }}>{t('cmp.winLossBoard.amount', { v: loss.data?.totalAmount ?? '0' })}
          </div>
          <Progress
            percent={winN + lossN ? Math.round((lossN / (winN + lossN)) * 100) : 0}
            strokeColor="#e11d48"
            size="small"
          />
          <div style={{ marginTop: 12, fontSize: 12, color: '#646A73' }}>{t('cmp.winLossBoard.topLossReasons')}</div>
          {(loss.data?.byReason ?? []).slice(0, 4).map((r) => (
            <div
              key={r.reason}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}
            >
              <span>{r.reason}</span>
              <Tag color="red">{r.count}</Tag>
            </div>
          ))}
        </Col>
        <Col xs={24} md={8}>
          <div style={{ fontSize: 12, color: '#646A73', marginBottom: 6 }}>{t('common.competitiveMatchups')}</div>
          <Table
            rowKey="competitor"
            size="small"
            pagination={false}
            dataSource={(win.data?.byCompetitor ?? []).slice(0, 6)}
            columns={[
              { title: t('common.competitor'), dataIndex: 'competitor' },
              { title: t('enum.stage.WON'), dataIndex: 'count', width: 60 },
            ]}
          />
        </Col>
      </Row>
    </Card>
  )
}
