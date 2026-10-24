import { useQuery } from '@tanstack/react-query'
import { Card, Col, Empty, Progress, Row, Statistic, Tag } from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { t } from '../i18n'

type Bucket = {
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
}

const COLORS: Record<string, string> = {
  COMMIT: '#0d9488',
  BEST: '#2b5fd9',
  PIPELINE: '#d97706',
}

/** 预测 Commit 看板（Salesforce Forecast Hierarchy） */
export function ForecastBoard() {
  const q = useQuery({
    queryKey: ['forecast-board'],
    queryFn: () =>
      api<{ buckets: Bucket[]; totalAmount: string }>('/reports/forecast-board'),
    retry: false,
  })

  const buckets = q.data?.buckets ?? []
  const total = Number(q.data?.totalAmount ?? 0)

  return (
    <Card
      size="small"
      title={t('cmp.forecastBoard.forecastCommitBoard')}
      style={{ marginBottom: 12 }}
      extra={<Tag color="blue">{t('cmp.forecastBoard.pipelineTotal', { v: q.data?.totalAmount ?? '0' })}</Tag>}
    >
      <Row gutter={[12, 12]}>
        {buckets.map((b) => {
          const amt = Number(b.amount)
          const pct = total > 0 ? Math.round((amt / total) * 100) : 0
          const color = COLORS[b.key] ?? '#64748b'
          return (
            <Col xs={24} md={8} key={b.key}>
              <div
                style={{
                  border: `1px solid ${color}33`,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: `${color}08`,
                  height: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <b style={{ color }}>{b.name}</b>
                  <Tag color={b.key === 'COMMIT' ? 'green' : b.key === 'BEST' ? 'blue' : 'orange'}>
                    {t('common.deals', { count: b.count })}</Tag>
                </div>
                <Statistic value={b.amount} valueStyle={{ fontSize: 20, color }} />
                <Progress percent={pct} size="small" strokeColor={color} showInfo />
                <div style={{ marginTop: 8 }}>
                  {(b.items ?? []).slice(0, 4).map((o) => (
                    <div
                      key={o.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        padding: '3px 0',
                        borderBottom: '1px dashed #e5e7eb',
                      }}
                    >
                      <Link to={`/opportunities/${o.id}`} style={{ maxWidth: 140 }}>
                        {o.name}
                      </Link>
                      <span style={{ color: '#646A73' }}>
                        {o.winRate}% · {o.amount}
                      </span>
                    </div>
                  ))}
                  {!(b.items ?? []).length && (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.none')} />
                  )}
                  {(b.items ?? []).length > 4 && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{t('cmp.forecastBoard.moreDeals', { v: b.items.length - 4 })}</div>
                  )}
                </div>
                {b.key === 'COMMIT' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#646A73' }}>{t('cmp.forecastBoard.expectedCloseDateReference', { v: dayjs().endOf('month').format('MM-DD') })}
                  </div>
                )}
              </div>
            </Col>
          )
        })}
      </Row>
    </Card>
  )
}
