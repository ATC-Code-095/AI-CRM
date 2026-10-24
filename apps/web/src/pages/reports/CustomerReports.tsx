import { useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Row, Space, Tag } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { BarChart, GaugeRing, Sparkline } from '../../components/SimpleCharts'
import { t } from '../../i18n'

/** 接口返回的 RFM 分层是中文值，展示时按词典翻译 */
const RFM_TIER_KEY: Record<string, string> = {
  高价值: 'reports.rfm.highValue',
  潜力: 'reports.rfm.potential',
  待激活: 'reports.rfm.dormant',
  低价值: 'reports.rfm.lowValue',
}

export default function CustomerReports() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const auto = useQuery({
    queryKey: ['success-automation'],
    queryFn: () =>
      api<{
        last7d: { journeyTasks: number; outreachTasks: number; careTasks: number; total: number }
        segments: { total: number; auto: number; autoNames: string[] }
        trend: { date: string; count: number }[]
      }>('/reports/success-automation'),
    retry: false,
  })
  const sub = useQuery({
    queryKey: ['brief-subscribe'],
    queryFn: () =>
      api<{ enabled: boolean; frequency: string; channels: string[] }>(
        '/reports/brief-subscribe',
      ),
    retry: false,
  })
  const rfm = useQuery({
    queryKey: ['customer-rfm'],
    queryFn: () =>
      api<{ id: string; name: string; recency: number; frequency: number; monetary: string; tag: string; tagKey?: string }[]>(
        '/reports/customer-rfm',
      ),
    retry: false,
  })
  const lifecycle = useQuery({
    queryKey: ['lifecycle-distribution'],
    queryFn: () => api<{ stage: string; name: string; count: number }[]>('/reports/lifecycle-distribution'),
    retry: false,
  })
  const tagCloud = useQuery({
    queryKey: ['tag-cloud'],
    queryFn: () => api<{ tag: string; count: number; amount: string }[]>('/reports/tag-cloud'),
    retry: false,
  })
  const sources = useQuery({
    queryKey: ['source-analysis'],
    queryFn: () =>
      api<{ source: string; leads: number; converted: number; convertRate: string; oppAmount: string }[]>(
        '/reports/source-analysis',
      ),
    retry: false,
  })
  const teamHealth = useQuery({
    queryKey: ['team-health-trend'],
    queryFn: () =>
      api<{
        points: { date: string; avg: number }[]
        distribution: { healthy: number; atRisk: number; risk: number; total: number }
        avg: number
      }>('/reports/team-health-trend'),
    retry: false,
  })
  const successHealth = useQuery({
    queryKey: ['success-health'],
    queryFn: () =>
      api<{
        total: number
        atRisk: number
        items: {
          accountId: string
          accountName: string
          adoption: number
          status: string
          reviewDue: boolean
        }[]
      }>('/success-health'),
    retry: false,
  })

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card size="small" title={t('reports.customerValueTiersRfm')}>
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={{ pageSize: 8 }}
              dataSource={rfm.data ?? []}
              columns={[
                { title: t('nav.accounts'), dataIndex: 'name' },
                {
                  title: t('reports.tier'),
                  dataIndex: 'tag',
                  render: (v: string, r: { tagKey?: string }) => (
                    <Tag
                      color={
                        r.tagKey === 'HIGH' || v === '高价值'
                          ? 'green'
                          : r.tagKey === 'POTENTIAL' || v === '潜力'
                            ? 'blue'
                            : r.tagKey === 'DORMANT' || v === '待激活'
                              ? 'orange'
                              : 'default'
                      }
                    >
                      {RFM_TIER_KEY[v] ? t(RFM_TIER_KEY[v]) : v}
                    </Tag>
                  ),
                },
                { title: t('audit.field.amount'), dataIndex: 'monetary' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('home.lifecycle')}>
            <Space wrap style={{ marginBottom: 8 }}>
              {(lifecycle.data ?? []).map((l) => (
                <Tag
                  key={l.stage}
                  color={
                    l.stage === 'ACTIVE' ? 'green' : l.stage === 'AT_RISK' ? 'orange' : l.stage === 'CHURNED' ? 'red' : 'blue'
                  }
                >
                  {l.name} {l.count}
                </Tag>
              ))}
            </Space>
            <BarChart
              items={(lifecycle.data ?? []).map((l) => ({ label: l.name, value: l.count }))}
              color="#2563eb"
            />
          </Card>
        </Col>
      </Row>
      <Card size="small" title={t('reports.customerProfileTagCloud')} style={{ marginTop: 12 }}>
        <Space wrap>
          {(tagCloud.data ?? []).map((t) => (
            <Tag
              key={t.tag}
              color={t.count >= 10 ? 'geekblue' : t.count >= 5 ? 'blue' : t.count >= 3 ? 'cyan' : 'default'}
              style={{ fontSize: t.count >= 10 ? 16 : t.count >= 5 ? 14 : 12 }}
            >
              {t.tag} · {t.count}
            </Tag>
          ))}
          {!tagCloud.data?.length && (
            <span style={{ color: '#646A73' }}>{t('reports.noTagsYetTag')}</span>
          )}
        </Space>
      </Card>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card size="small" title={t('reports.leadSourceConversion')}>
            <AutoFitTable
              rowKey="source"
              size="small"
              pagination={false}
              dataSource={sources.data ?? []}
              columns={[
                { title: t('common.source'), dataIndex: 'source' },
                { title: t('nav.leads'), dataIndex: 'leads' },
                { title: t('common.convert'), dataIndex: 'converted' },
                { title: t('reports.conversion2'), dataIndex: 'convertRate' },
                { title: t('common.dealAmount'), dataIndex: 'oppAmount' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.customerHealthTrend')}
            extra={
              <Space>
                <Tag color="blue">{t('common.average', { v: teamHealth.data?.avg ?? 0 })}</Tag>
                <Tag color="green">{t('common.healthy', { v: teamHealth.data?.distribution.healthy ?? 0 })}</Tag>
                <Tag color="orange">{t('common.atRisk', { v: teamHealth.data?.distribution.atRisk ?? 0 })}</Tag>
                <Tag color="red">{t('common.critical', { v: teamHealth.data?.distribution.risk ?? 0 })}</Tag>
              </Space>
            }
          >
            <Sparkline points={teamHealth.data?.points ?? []} labelKey="avg" height={88} />
            <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
              <GaugeRing
                value={
                  teamHealth.data?.distribution.total
                    ? (teamHealth.data.distribution.healthy / teamHealth.data.distribution.total) * 100
                    : 0
                }
                label={t('reports.healthyShare')}
                color="#16a34a"
              />
              <div style={{ fontSize: 12, color: '#646A73' }}>{t('reports.coversAccounts', { v: teamHealth.data?.distribution.total ?? 0 })}</div>
            </div>
          </Card>
        </Col>
      </Row>
      <Card
        size="small"
        title={t('reports.customerSuccessHealth')}
        style={{ marginTop: 12 }}
        extra={<Tag color={successHealth.data?.atRisk ? 'red' : 'green'}>{t('common.atRisk', { v: successHealth.data?.atRisk ?? 0 })}</Tag>}
      >
        <AutoFitTable
          rowKey="accountId"
          size="small"
          pagination={{ pageSize: 8 }}
          dataSource={successHealth.data?.items ?? []}
          columns={[
            {
              title: t('nav.accounts'),
              dataIndex: 'accountName',
              render: (v: string, r: { accountId: string }) => <Link to={`/accounts/${r.accountId}`}>{v}</Link>,
            },
            {
              title: t('reports.adoption'),
              dataIndex: 'adoption',
              render: (v: number) => (
                <Tag color={v >= 70 ? 'green' : v >= 40 ? 'blue' : 'red'}>{v}%</Tag>
              ),
            },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              render: (v: string) => (
                <Tag color={v === 'HEALTHY' ? 'green' : v === 'AT_RISK' ? 'orange' : 'red'}>{v}</Tag>
              ),
            },
            {
              title: t('reports.review'),
              dataIndex: 'reviewDue',
              render: (v: boolean) => (v ? <Tag color="red">{t('reports.overdue')}</Tag> : t('common.normal')),
            },
          ]}
        />
      </Card>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.customerSuccessAutomationBoard')}
            extra={<Tag color="blue">{t('reports.timesInLast7', { v: auto.data?.last7d?.total ?? 0 })}</Tag>}
          >
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color="green">{t('reports.journeyTasks', { v: auto.data?.last7d?.journeyTasks ?? 0 })}</Tag>
              <Tag color="blue">{t('reports.segmentOutreach', { v: auto.data?.last7d?.outreachTasks ?? 0 })}</Tag>
              <Tag color="orange">{t('reports.careTasks', { v: auto.data?.last7d?.careTasks ?? 0 })}</Tag>
              <Tag>{t('reports.autoSegments', { v: auto.data?.segments?.auto ?? 0, v2: auto.data?.segments?.total ?? 0 })}</Tag>
            </Space>
            <Sparkline points={auto.data?.trend ?? []} labelKey="count" color="#0d9488" height={72} />
            {(auto.data?.segments?.autoNames ?? []).length > 0 && (
              <div style={{ fontSize: 12, color: '#646A73', marginTop: 6 }}>{t('reports.autoOutreachSegments', { v: (auto.data?.segments?.autoNames ?? []).join('、') })}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.salesBriefSubscription')}>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color={sub.data?.enabled ? 'green' : 'default'}>
                {sub.data?.enabled ? t('common.enabled') : t('enum.lead.status.CLOSED_LOST')}
              </Tag>
              <Tag>{sub.data?.frequency === 'daily' ? t('reports.daily') : t('reports.weekly')}</Tag>
              <Tag color="blue">{t('reports.channel', { v: (sub.data?.channels ?? ['notify']).join('、') })}</Tag>
            </Space>
            <Space>
              <Button
                size="small"
                onClick={() => {
                  void api('/reports/brief-subscribe', {
                    method: 'POST',
                    body: JSON.stringify({
                      enabled: !sub.data?.enabled,
                      frequency: sub.data?.frequency ?? 'weekly',
                      channels: sub.data?.channels ?? ['notify'],
                    }),
                  }).then(() => {
                    message.success(t('common.subscriptionUpdated'))
                    void qc.invalidateQueries({ queryKey: ['brief-subscribe'] })
                    void qc.invalidateQueries({ queryKey: ['success-automation'] })
                  })
                }}
              >
                {sub.data?.enabled ? t('reports.pauseSubscription') : t('reports.enableSubscription')}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  void api('/reports/brief-subscribe', {
                    method: 'POST',
                    body: JSON.stringify({
                      enabled: true,
                      frequency: sub.data?.frequency === 'daily' ? 'weekly' : 'daily',
                      channels: ['notify'],
                    }),
                  }).then(() => {
                    message.success(t('reports.frequencySwitched'))
                    void qc.invalidateQueries({ queryKey: ['brief-subscribe'] })
                  })
                }}
              >{t('reports.toggleDailyWeekly')}</Button>
            </Space>
            <div style={{ fontSize: 12, color: '#646A73', marginTop: 8 }}>{t('reports.whenEnabledASales')}</div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
