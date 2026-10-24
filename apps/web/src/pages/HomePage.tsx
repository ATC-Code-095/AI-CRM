import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Checkbox, List, Modal, Progress, Skeleton, Space, Statistic, Tag } from 'antd'
import { AutoFitTable } from '../components/AutoFitTable'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, isLoggedIn } from '../api/client'
import { GaugeRing } from '../components/SimpleCharts'
import { StarFilled, CloseOutlined } from '@ant-design/icons'
import { useStars } from '../hooks/useUserPref'
import { t } from '../i18n'

interface FunnelRow {
  name: string
  count: number
  amount: string
  weightedAmount: string
}

interface Dash {
  dueToday: { id: string; subject: string; type: string; dueAt: string | null; status: string }[]
  openLeads: number
  openOppCount: number
  openAmount: string
  weightedAmount: string
  funnel: FunnelRow[]
  revenueTrend: { month: string; confirmedAmount: string; reconciledAmount: string }[]
}

function ExpiryLayers() {
  const { data } = useQuery({
    queryKey: ['contract-expiry-layers'],
    queryFn: () =>
      api<{
        counts: { urgent: number; warn: number; watch: number; overdue: number }
        urgent: { id: string; contractNo: string; title: string; expireDate: string; total: string; account?: { name: string } }[]
      }>('/reports/contract-expiry-layers'),
    retry: false,
    refetchInterval: 120_000,
  })
  const c = data?.counts
  return (
    <div>
      <Space wrap>
        <Tag color="red">{t('home.within7Days', { v: c?.urgent ?? 0 })}</Tag>
        <Tag color="orange">{t('home.within30Days', { v: c?.warn ?? 0 })}</Tag>
        <Tag color="gold">{t('home.within90Days', { v: c?.watch ?? 0 })}</Tag>
        <Tag color="default">{t('home.expired', { v: c?.overdue ?? 0 })}</Tag>
      </Space>
      {(data?.urgent ?? []).length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
          {(data?.urgent ?? []).slice(0, 3).map((x) => (
            <div key={x.id}>
              {t('home.expires', { contractNo: x.contractNo, v: x.account?.name ?? '-', v2: ' ', v3: x.expireDate ? x.expireDate.slice(0, 10) : '-' })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const me = JSON.parse(localStorage.getItem('me_cache') || '{}') as { name?: string }
  const [dashOpen, setDashOpen] = useState(false)
  const { stars, remove: unstar } = useStars()
  const [hiddenDraft, setHiddenDraft] = useState<string[]>([])
  const [favDraft, setFavDraft] = useState<string[]>([])

  const layoutQ = useQuery({
    queryKey: ['dashboard-layout'],
    queryFn: () => api<{ hidden: string[]; favorites?: string[] }>('/dashboard/layout'),
    enabled: isLoggedIn(),
    retry: false,
  })
  const hiddenSet = useMemo(() => new Set(layoutQ.data?.hidden ?? []), [layoutQ.data])
  const favSet = useMemo(() => new Set(layoutQ.data?.favorites ?? []), [layoutQ.data])
  const show = (k: string) => !hiddenSet.has(k)

  const WIDGETS = [
    { key: 'brief', label: t('home.weeklySalesBrief') },
    { key: 'stars', label: t('home.myFavorites') },
    { key: 'todo', label: t('common.todoCenter') },
    { key: 'daily', label: t('home.dailyReport') },
    { key: 'remind', label: t('common.smartAlerts') },
    { key: 'healthBoard', label: t('home.customerHealth') },
    { key: 'dataQuality', label: t('common.dataQuality') },
    { key: 'leaderboard', label: t('home.leaderboard') },
    { key: 'goals', label: t('home.goalProgress') },
    { key: 'nps', label: t('home.nps') },
    { key: 'lifecycle', label: t('home.lifecycle') },
    { key: 'sources', label: t('home.sourceConversion') },
    { key: 'atrisk', label: t('home.atRisk') },
    { key: 'funnelAlerts', label: t('common.funnelAlerts') },
    { key: 'stageConv', label: t('home.stageConversion') },
    { key: 'stats', label: t('home.keyMetrics') },
    { key: 'activities', label: t('home.todaySFollowUps') },
    { key: 'funnel', label: t('common.salesFunnel') },
    { key: 'revenue', label: t('home.paymentTrend') },
  ]

  const saveLayoutM = useMutation({
    mutationFn: (p: { hidden: string[]; favorites: string[] }) =>
      api('/dashboard/layout', { method: 'PUT', body: JSON.stringify(p) }),
    onSuccess: () => {
      message.success(t('home.homeLayoutSaved'))
      setDashOpen(false)
      void qc.invalidateQueries({ queryKey: ['dashboard-layout'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dash>('/reports/dashboard'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const remind = useQuery({
    queryKey: ['smart-reminders'],
    queryFn: () =>
      api<{ total: number; overdueLeads: unknown[]; expiringContracts: unknown[]; slaTickets: unknown[] }>(
        '/reports/smart-reminders',
      ),
    enabled: isLoggedIn(),
    retry: false,
  })

  const brief = useQuery({
    queryKey: ['sales-brief'],
    queryFn: () => api<{ text: string }>('/reports/sales-brief'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const board = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () =>
      api<{
        name: string
        receivedAmount: string
        wonAmount: string
        newOpps: number
        winRate: string
        activities: number
        trend?: string
        rank?: number
      }[]>( '/reports/sales-leaderboard?days=30'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const goals = useQuery({
    queryKey: ['goal-attainment'],
    queryFn: () =>
      api<{ userId: string | null; metric: string; targetAmount: string; actualAmount: string; rate: string }[]>(
        '/reports/goal-attainment',
      ),
    enabled: isLoggedIn(),
    retry: false,
  })

  const lifecycle = useQuery({
    queryKey: ['lifecycle-distribution'],
    queryFn: () => api<{ stage: string; name: string; count: number }[]>('/reports/lifecycle-distribution'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const sources = useQuery({
    queryKey: ['source-analysis'],
    queryFn: () =>
      api<{ source: string; leads: number; convertRate: string }[]>('/reports/source-analysis'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const daily = useQuery({
    queryKey: ['daily-report'],
    queryFn: () =>
      api<{
        date: string
        summary: {
          doneToday: number
          planTomorrow: number
          overdueTasks: number
          staleOpps: number
          todayNewLeads: number
          todayWon: number
        }
        doneToday: { id: string; subject: string; type: string }[]
        planTomorrow: { id: string; subject: string; type: string; dueAt: string | null }[]
        overdueTasks: { id: string; subject: string; dueAt: string | null }[]
        staleOpps: { id: string; name: string; amount: string; stage: { name: string } }[]
      }>('/reports/daily-report'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const runAutoM = useMutation({
    mutationFn: () => api('/jobs/run-daily', { method: 'POST' }),
    onSuccess: (r: unknown) => {
      message.success(t('home.automationExecuted'))
      void qc.invalidateQueries({ queryKey: ['daily-report'] })
      void qc.invalidateQueries({ queryKey: ['smart-reminders'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      console.log('automation', r)
    },
    onError: (e: Error) => message.error(e.message),
  })

  const shareBriefM = useMutation({
    mutationFn: () =>
      api('/reports/sales-brief/share', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (r: unknown) => {
      const sent = (r as { sent?: number })?.sent ?? 0
      message.success(t('home.reportSharedWithPeople', { sent }))
    },
    onError: (e: Error) => message.error(e.message),
  })

  const npsQ = useQuery({
    queryKey: ['nps'],
    queryFn: () =>
      api<{ nps: number; avg: string; promoters: number; total: number }>('/nps'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const atRisk = useQuery({
    queryKey: ['at-risk-accounts'],
    queryFn: () =>
      api<{ id: string; name: string; score: number; levelCode: string; owner: string; factors: string[] }[]>(
        '/reports/at-risk-accounts?limit=5',
      ),
    enabled: isLoggedIn(),
    retry: false,
  })

  const funnelAlerts = useQuery({
    queryKey: ['funnel-alerts'],
    queryFn: () =>
      api<{
        total: number
        high: number
        items: { level: string; type: string; message: string; stage?: string; count?: number }[]
      }>('/reports/funnel-alerts'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const stageConv = useQuery({
    queryKey: ['stage-conversion-mini'],
    queryFn: () =>
      api<{
        conversions: { from: string; to: string; rate: string; fromCount: number; toCount: number }[]
      }>('/reports/stage-conversion?days=90'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const healthBoard = useQuery({
    queryKey: ['team-health-mini'],
    queryFn: () =>
      api<{
        distribution: { healthy: number; atRisk: number; risk: number; total: number }
      }>('/reports/team-health-trend'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const quality = useQuery({
    queryKey: ['data-quality-mini'],
    queryFn: () =>
      api<{
        score: number
        total: number
        high: number
        medium: number
        low: number
        items: { type: string; level: string; message: string; name: string }[]
      }>('/reports/data-quality'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const focusQ = useQuery({
    queryKey: ['score-board-mini'],
    queryFn: () =>
      api<{
        items: { id: string; name: string; amount: string; grade: string; score: number }[]
      }>('/reports/score-board?limit=5'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const doneM = useMutation({
    mutationFn: (id: string) =>
      api('/activities/complete', { method: 'POST', body: JSON.stringify({ id }) }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const badgesQ = useQuery({
    queryKey: ['menu-badges'],
    queryFn: () =>
      api<{
        approvals: number
        pendingSign: number
        expiring7: number
        expiring30: number
        overduePay: number
        overdueLead: number
      }>('/reports/menu-badges'),
    retry: false,
    refetchInterval: 60_000,
  })
  const badges = badgesQ.data

  const maxFunnel = Math.max(...(data?.funnel ?? []).map((f) => Number(f.amount)), 1)

  return (
    <div>
      <div className="crm-hero">
        <div>
          <div className="crm-hero-sub">{dayjs().format(t('home.ddddMmmmDYyyy'))}{' '}{t('home.home')}</div>
          <div className="crm-hero-title">{t('home.hello')}{me.name ?? t('common.sales')}</div>
          <div className="crm-hero-meta">{t('home.todaySTodosOpen', { v: data?.dueToday?.length ?? 0, v2: data?.openOppCount ?? 0, v3: data?.weightedAmount ?? '0' })}
          </div>
        </div>
        <Space wrap>
          <Button
            onClick={() => nav('/leads')}
            style={{
              background: '#fff',
              color: '#1e3a8a',
              border: 'none',
              fontWeight: 600,
            }}
          >{t('common.newLead')}</Button>
          <Button
            style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none' }}
            onClick={() => nav('/activities')}
          >{t('home.logFollowUp')}</Button>
          <Button
            style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: 'none' }}
            onClick={() => runAutoM.mutate()}
            loading={runAutoM.isPending}
          >{t('home.runAutomation')}</Button>
        </Space>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {[
          { to: '/leads', title: t('nav.leads'), sub: t('home.createFollowUp'), color: '#2b5fd9' },
          { to: '/accounts', title: t('nav.accounts'), sub: t('home.customer360'), color: '#0d9488' },
          { to: '/opportunities', title: t('nav.opportunities'), sub: t('home.kanban'), color: '#7c3aed' },
          { to: '/quotes', title: t('nav.quotes'), sub: t('home.templatePrint'), color: '#d97706' },
          { to: '/contracts', title: t('nav.contracts'), sub: t('home.signCollect'), color: '#dc2626' },
          { to: '/activities', title: t('nav.activities'), sub: t('home.checkIns'), color: '#0284c7' },
          { to: '/todos', title: t('nav.todos'), sub: t('home.taskCenter'), color: '#475569' },
          { to: '/calendar', title: t('home.schedule'), sub: t('home.calendarView'), color: '#059669' },
          { to: '/reports', title: t('nav.reports'), sub: t('home.sixAnalyses'), color: '#b45309' },
          { to: '/group', title: t('nav.group'), sub: t('home.multiEntity'), color: '#1e40af' },
          { to: '/group/screen', title: t('home.bigScreen'), sub: t('home.cockpit'), color: '#334155' },
          { to: '/approvals', title: t('nav.approvals'), sub: t('home.todoFlow'), color: '#be123c' },
        ].map((c) => (
          <Link key={c.to} to={c.to} style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 12px 10px',
                cursor: 'pointer',
                borderTop: `3px solid ${c.color}`,
                transition: 'box-shadow .15s',
              }}
              className="crm-quick-card"
            >
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{c.title}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{c.sub}</div>
            </div>
          </Link>
        ))}
      </div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Button loading={runAutoM.isPending} onClick={() => runAutoM.mutate()}>{t('home.runAutomation')}</Button>
        <Button
          onClick={() => {
            setHiddenDraft([...hiddenSet])
            setFavDraft([...favSet])
            setDashOpen(true)
          }}
        >{t('home.customizeHome')}</Button>
      </Space>
      {favSet.size > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16,
            padding: '8px 12px',
            background: 'var(--crm-card)',
            borderRadius: 10,
            border: '1px solid var(--crm-border)',
          }}
        >
          <Tag color="gold">{t('home.myFavorites')}</Tag>
          {WIDGETS.filter((w) => favSet.has(w.key)).map((w) => (
            <Tag key={w.key} color="geekblue">
              ★ {w.label}
            </Tag>
          ))}
        </div>
      )}
      {!data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : null}
      {show('brief') && (
        <Card size="small" title={t('home.weeklySalesBrief')} className="crm-panel-fixed" style={{ marginBottom: 16 }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
            {brief.data?.text ?? t('common.generating')}
          </pre>
          <Space style={{ marginTop: 8 }}>
            <Button
              size="small"
              onClick={() => {
                if (brief.data?.text) void navigator.clipboard.writeText(brief.data.text)
              }}
            >{t('home.copyBrief')}</Button>
            <Button
              size="small"
              type="primary"
              loading={shareBriefM.isPending}
              onClick={() => shareBriefM.mutate()}
            >{t('home.shareReportWithTeam')}</Button>
          </Space>
        </Card>
      )}
      {show('daily') && (
        <Card
          size="small"
          title={t('home.dailySalesReport', { v: daily.data?.date ?? '' })}
          className="crm-panel-fixed"
          style={{ marginBottom: 16 }}
          extra={<Link to="/activities">{t('common.allFollowUps')}</Link>}
        >
          <Space wrap style={{ marginBottom: 8 }}>
            <Tag color="green">{t('home.doneToday', { v: daily.data?.summary.doneToday ?? 0 })}</Tag>
            <Tag color="blue">{t('home.tomorrowSPlan', { v: daily.data?.summary.planTomorrow ?? 0 })}</Tag>
            <Tag color="red">{t('home.overdueTasks', { v: daily.data?.summary.overdueTasks ?? 0 })}</Tag>
            <Tag color="orange">{t('home.stalledDeals', { v: daily.data?.summary.staleOpps ?? 0 })}</Tag>
            <Tag>{t('home.newLeads', { v: daily.data?.summary.todayNewLeads ?? 0 })}</Tag>
            <Tag color="purple">{t('home.wonToday', { v: daily.data?.summary.todayWon ?? 0 })}</Tag>
          </Space>
          <div style={{ fontSize: 12, color: '#646A73' }}>
            {(daily.data?.planTomorrow ?? []).slice(0, 3).map((a) => (
              <div key={a.id}>{t('home.tomorrow', { subject: a.subject })}</div>
            ))}
            {(daily.data?.staleOpps ?? []).slice(0, 2).map((o) => (
              <div key={o.id}>{t('home.stalled', { name: o.name, name2: o.stage.name, amount: o.amount })}</div>
            ))}
            {!daily.data?.planTomorrow?.length && !daily.data?.staleOpps?.length && (
              <span>{t('home.goodPaceTodayNothing')}</span>
            )}
          </div>
        </Card>
      )}
      {show('stars') && stars.length > 0 && (
        <Card
          size="small"
          title={
            <Space size={6}>
              <StarFilled style={{ color: 'var(--crm-warn)' }} />{t('home.myFavorites')}<Tag bordered={false}>{stars.length}</Tag>
            </Space>
          }
          className="crm-panel-fixed crm-panel-sm"
          style={{ marginBottom: 16 }}
          extra={<span className="crm-muted">{t('home.addOrRemoveWith')}</span>}
        >
          <Space wrap size={8}>
            {stars.map((st) => (
              <span key={st.id} className="crm-star-chip">
                <Tag color="geekblue" bordered={false}>
                  {st.type === 'ACCOUNT' ? t('nav.accounts') : st.type === 'OPPORTUNITY' ? t('nav.opportunities') : st.type === 'LEAD' ? t('nav.leads') : t('nav.contacts')}
                </Tag>
                <Link
                  to={
                    st.type === 'ACCOUNT'
                      ? `/accounts/${st.id}`
                      : st.type === 'OPPORTUNITY'
                        ? `/opportunities/${st.id}`
                        : st.type === 'LEAD'
                          ? `/leads/${st.id}`
                          : '/contacts'
                  }
                >
                  {st.name}
                </Link>
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined style={{ fontSize: 10 }} />}
                  onClick={() => unstar(st.id)}
                />
              </span>
            ))}
          </Space>
        </Card>
      )}
      <div className="crm-grid crm-cols-3 crm-h-md">
        <div>
          {show('remind') && (
            <>
              <Card size="small" title={t('home.contractExpiryTiers')} extra={<Link to="/contracts">{t('nav.contracts')}</Link>} style={{ marginBottom: 16 }}>
                <ExpiryLayers />
              </Card>
              <Card size="small" title={t('common.smartAlerts')} extra={<Link to="/reports">{t('home.more')}</Link>}>
                <Space>
                  <Tag color="red">{t('common.overdueLeads', { v: remind.data?.overdueLeads?.length ?? 0 })}</Tag>
                  <Tag color="orange">{t('common.contractsExpiring', { v: remind.data?.expiringContracts?.length ?? 0 })}</Tag>
                  <Tag color="blue">{t('common.ticketAlerts', { v: remind.data?.slaTickets?.length ?? 0 })}</Tag>
                </Space>
              </Card>
            </>
          )}
        </div>
        <div>
          {show('leaderboard') && (
            <Card size="small" title={t('common.salesRanking30Days')} extra={<Link to="/reports">{t('nav.reports')}</Link>}>
              {(board.data ?? []).slice(0, 5).map((r, i) => (
                <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span>
                    <Tag
                      color={i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'orange' : 'default'}
                      style={{ marginRight: 4 }}
                    >
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </Tag>
                    {r.name}
                  </span>
                  <Space size={4}>
                    <Tag color="green">{t('home.collected', { receivedAmount: r.receivedAmount })}</Tag>
                    <Tag>{t('common.winRate', { winRate: r.winRate })}</Tag>
                    <Tag color={r.trend === 'UP' ? 'green' : r.trend === 'DOWN' ? 'red' : 'default'}>
                      {r.trend === 'UP' ? '↑' : r.trend === 'DOWN' ? '↓' : '→'}
                    </Tag>
                  </Space>
                </div>
              ))}
              {!board.data?.length && <span style={{ color: '#646A73' }}>{t('common.empty')}</span>}
            </Card>
          )}
        </div>
        <div>
          {show('funnel') && (
            <Card size="small" title={t('home.topFocusDeals')} extra={<Link to="/opportunities">{t('nav.opportunities')}</Link>}>
              {(focusQ.data?.items ?? []).slice(0, 5).map((o) => (
                <div
                  key={o.id}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}
                >
                  <Link to={`/opportunities/${o.id}`}>{o.name}</Link>
                  <Space size={4}>
                    <Tag color={o.grade === 'A' ? 'green' : o.grade === 'B' ? 'blue' : 'orange'}>
                      {o.grade}
                    </Tag>
                    <Tag>{o.amount}</Tag>
                  </Space>
                </div>
              ))}
              {!focusQ.data?.items?.length && <span style={{ color: '#646A73' }}>{t('home.noOpenDeals')}</span>}
            </Card>
          )}
        </div>
      </div>
      <div className="crm-grid crm-cols-3 crm-h-md">
        <div>
          {show('goals') && (
            <Card size="small" title={t('home.goalProgress')}>
              {(goals.data ?? []).slice(0, 3).map((g, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{g.metric === 'REVENUE' ? t('nav.payments') : g.metric === 'WON_AMOUNT' ? t('enum.stage.WON') : t('common.newDeal2')}</span>
                    <span>
                      {g.actualAmount} / {g.targetAmount}
                    </span>
                  </div>
                  <Progress
                    percent={Math.min(100, Number(g.rate))}
                    size="small"
                    status={Number(g.rate) >= 100 ? 'success' : Number(g.rate) >= 60 ? 'active' : 'normal'}
                  />
                </div>
              ))}
              {!goals.data?.length && <span style={{ color: '#646A73' }}>{t('home.noGoalsThisMonth')}</span>}
            </Card>
          )}
        </div>
        <div>
          {show('nps') && (
            <Card size="small" title={t('home.nps')}>
              <Space>
                <Statistic title="NPS" value={npsQ.data?.nps ?? 0} />
                <Statistic title={t('common.avgScore')} value={npsQ.data?.avg ?? '0'} />
                <Statistic title={t('common.followUpVisit')} value={npsQ.data?.total ?? 0} />
              </Space>
              <div style={{ marginTop: 8 }}>
                <Link to="/enablement">{t('home.followUpKnowledgeBase')}</Link>
              </div>
            </Card>
          )}
        </div>
        <div>
          {show('lifecycle') && (
            <Card size="small" title={t('home.lifecycle')}>
              <Space wrap>
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
                {!lifecycle.data?.length && <span style={{ color: '#646A73' }}>{t('common.empty')}</span>}
              </Space>
              <div style={{ marginTop: 8 }}>
                <Link to="/reports">{t('home.viewAnalysis')}</Link>
              </div>
            </Card>
          )}
        </div>
      </div>
      <div className="crm-grid crm-cols-2 crm-h-md">
        <div>
          {show('sources') && (
            <Card size="small" title={t('home.topSourceConversion')}>
              {(sources.data ?? [])
                .slice()
                .sort((a, b) => Number(b.convertRate) - Number(a.convertRate))
                .slice(0, 4)
                .map((s) => (
                  <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{s.source}</span>
                    <b>{s.convertRate}%</b>
                  </div>
                ))}
              {!sources.data?.length && <span style={{ color: '#646A73' }}>{t('common.empty')}</span>}
            </Card>
          )}
        </div>
        <div>
          {show('atrisk') && (
            <Card size="small" title={t('home.atRisk')} extra={<Link to="/reports">{t('home.more')}</Link>}>
              {(atRisk.data ?? []).map((a) => (
                <div
                  key={a.id}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}
                >
                  <Link to={`/accounts/${a.id}`}>{a.name}</Link>
                  <Tag color={a.levelCode === 'RISK' ? 'red' : 'orange'}>
                    {t('home.pts', { score: a.score, owner: a.owner })}
                  </Tag>
                </div>
              ))}
              {!atRisk.data?.length && <span style={{ color: '#646A73' }}>{t('home.noAtRiskAccounts')}</span>}
            </Card>
          )}
        </div>
      </div>
      {show('funnelAlerts') && (
        <Card
          size="small"
          title={t('home.salesFunnelAlerts')}
          className="crm-panel-fixed"
          style={{ marginBottom: 16 }}
          extra={
            <Tag color={funnelAlerts.data?.high ? 'red' : 'green'}>{t('common.highPriorityTotal', { v: funnelAlerts.data?.high ?? 0, v2: funnelAlerts.data?.total ?? 0 })}
            </Tag>
          }
        >
          {(funnelAlerts.data?.items ?? []).slice(0, 5).map((al, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
              <Tag color={al.level === 'HIGH' ? 'red' : al.level === 'MEDIUM' ? 'orange' : 'default'}>
                {al.level}
              </Tag>
              {al.message}
            </div>
          ))}
          {!funnelAlerts.data?.items?.length && (
            <span style={{ color: '#646A73' }}>{t('common.funnelPaceNormal')}</span>
          )}
        </Card>
      )}
      {show('stageConv') && (
        <Card
          size="small"
          title={t('home.stageConversionLast90')}
          className="crm-panel-fixed crm-panel-sm"
          style={{ marginBottom: 16 }}
          extra={<Link to="/reports/pipeline">{t('home.moreAnalysis')}</Link>}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(stageConv.data?.conversions ?? []).map((c) => (
              <Tag
                key={`${c.from}-${c.to}`}
                color={Number(c.rate) >= 50 ? 'green' : Number(c.rate) >= 20 ? 'blue' : 'orange'}
                style={{ marginRight: 0 }}
              >
                {c.from}→{c.to} {c.rate}%
              </Tag>
            ))}
            {!stageConv.data?.conversions?.length && (
              <span style={{ color: '#646A73', fontSize: 12 }}>{t('common.noStageData')}</span>
            )}
          </div>
        </Card>
      )}
      <div className="crm-grid crm-cols-3 crm-h-md">
        {show('todo') && (
          <div>
            <Card size="small" title={t('common.todoCenter')} extra={<Link to="/activities">{t('common.all')}</Link>}>
              <Space direction="vertical" style={{ width: '100%' }} size={6}>
                <Link to="/activities">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('home.todaySFollowUps')}</span>
                    <Tag color="blue">{data?.dueToday?.length ?? 0}</Tag>
                  </div>
                </Link>
                <Link to="/approvals">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('enum.quote.status.SUBMITTED')}</span>
                    <Tag color="orange">{badges?.approvals ?? remind.data?.total ?? 0}</Tag>
                  </div>
                </Link>
                <Link to="/leads">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('home.overdueLeads')}</span>
                    <Tag>{badges?.overdueLead ?? remind.data?.overdueLeads?.length ?? 0}</Tag>
                  </div>
                </Link>
                <Link to="/contracts/renewals">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('home.contractsExpiring')}</span>
                    <Tag color="red">{badges?.expiring7 ?? remind.data?.expiringContracts?.length ?? 0}</Tag>
                  </div>
                </Link>
                <Link to="/esign/board">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('home.pendingSignature')}</span>
                    <Tag color="purple">{badges?.pendingSign ?? 0}</Tag>
                  </div>
                </Link>
                <Link to="/reports/payments">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('home.overduePayments')}</span>
                    <Tag color="volcano">{badges?.overduePay ?? 0}</Tag>
                  </div>
                </Link>
                <Link to="/pool">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{t('home.poolPendingRecycle')}</span>
                    <Tag>{badges?.expiring30 ?? 0}</Tag>
                  </div>
                </Link>
              </Space>
            </Card>
          </div>
        )}
        {show('healthBoard') && (
          <div>
            <Card size="small" title={t('home.customerHealthBoard')} extra={<Link to="/reports/customer">{t('home.analysis')}</Link>}>
              <Space size="large">
                <GaugeRing
                  value={
                    healthBoard.data?.distribution.total
                      ? (healthBoard.data.distribution.healthy / healthBoard.data.distribution.total) *
                        100
                      : 0
                  }
                  label={t('home.health')}
                  size={72}
                  color="#0d9488"
                />
                <Space direction="vertical" size={4}>
                  <div>
                    <Tag color="green">{t('common.healthy', { v: healthBoard.data?.distribution.healthy ?? 0 })}</Tag>
                  </div>
                  <div>
                    <Tag color="orange">{t('common.atRisk', { v: healthBoard.data?.distribution.atRisk ?? 0 })}</Tag>
                  </div>
                  <div>
                    <Tag color="red">{t('common.critical', { v: healthBoard.data?.distribution.risk ?? 0 })}</Tag>
                  </div>
                </Space>
              </Space>
            </Card>
          </div>
        )}
        {show('dataQuality') && (
          <div>
            <Card
              size="small"
              title={t('common.dataQuality')}
              extra={<Link to="/reports/risk">{t('common.details')}</Link>}
            >
              <Space style={{ marginBottom: 8 }}>
                <Statistic title={t('home.qualityScore')} value={quality.data?.score ?? 0} suffix="/100" />
                <Tag color={quality.data?.high ? 'red' : 'green'}>{t('home.highPriority', { v: quality.data?.high ?? 0 })}</Tag>
                <Tag color={quality.data?.medium ? 'orange' : 'default'}>{t('common.medium', { v: quality.data?.medium ?? 0 })}
                </Tag>
              </Space>
              {(quality.data?.items ?? []).slice(0, 3).map((iss, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 2,
                  }}
                >
                  <span>
                    {iss.name} · {iss.message}
                  </span>
                  <Tag color={iss.level === 'HIGH' ? 'red' : iss.level === 'MEDIUM' ? 'orange' : 'default'}>
                    {iss.level}
                  </Tag>
                </div>
              ))}
              {!(quality.data?.items ?? []).length && (
                <div style={{ color: '#16a34a', fontSize: 12 }}>{t('home.dataQualityIsGood')}</div>
              )}
              <div style={{ marginTop: 8 }}>
                <Space>
                  <Link to="/goals">
                    <Button size="small">{t('home.viewQuotaWaterfall')}</Button>
                  </Link>
                  <Link to="/pool">
                    <Button size="small">{t('home.mergeDuplicateAccounts')}</Button>
                  </Link>
                </Space>
              </div>
            </Card>
          </div>
        )}
      </div>
      <div className="crm-grid crm-cols-4 crm-h-sm">
        <div>
          <Card className="crm-kpi">
            <Statistic title={t('nav.leads')} value={data?.openLeads ?? 0} valueStyle={{ color: '#2b5fd9' }} />
          </Card>
        </div>
        <div>
          <Card className="crm-kpi crm-kpi-purple">
            <Statistic title={t('common.openDeals')} value={data?.openOppCount ?? 0} valueStyle={{ color: '#7c3aed' }} />
          </Card>
        </div>
        <div>
          <Card className="crm-kpi crm-kpi-gold">
            <Statistic title={t('home.openAmount')} value={data?.openAmount ?? '0'} valueStyle={{ color: '#d97706' }} />
          </Card>
        </div>
        <div>
          <Card className="crm-kpi crm-kpi-green">
            <Statistic title={t('common.weightedForecast')} value={data?.weightedAmount ?? '0'} valueStyle={{ color: '#0d9488' }} />
          </Card>
        </div>
      </div>

      <div className="crm-grid crm-cols-2 crm-h-md">
        <div>
          {show('activities') && (
            <Card title={t('nav.activities')} size="small">
              <List
                size="small"
                dataSource={(data?.dueToday ?? []).slice(0, 5)}
                renderItem={(a) => (
                  <List.Item
                    actions={[
                      <Button key="done" size="small" onClick={() => doneM.mutate(a.id)}>{t('common.done')}</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={a.subject}
                      description={
                        <Space>
                          <Tag>{a.type}</Tag>
                          {a.dueAt ? dayjs(a.dueAt).format('HH:mm') : ''}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}
        </div>
        <div>
          {show('funnel') && (
            <Card title={t('common.salesFunnel')} size="small">
              {(data?.funnel ?? []).map((f) => (
                <div key={f.name} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{f.name}</span>
                    <span>
                      {f.count} · {f.amount}
                    </span>
                  </div>
                  <Progress
                    percent={Math.round((Number(f.amount) / maxFunnel) * 100)}
                    showInfo={false}
                    size="small"
                  />
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      {show('revenue') && (
        <Card title={t('home.paymentTrend')} size="small" className="crm-panel-fixed">
          <AutoFitTable
            rowKey="month"
            size="small"
            pagination={false}
            dataSource={data?.revenueTrend ?? []}
            columns={[
              { title: t('common.month'), dataIndex: 'month' },
              { title: t('home.confirmPayment'), dataIndex: 'confirmedAmount' },
              { title: t('enum.payment.status.RECONCILED'), dataIndex: 'reconciledAmount' },
            ]}
          />
        </Card>
      )}
      <Modal
        title={t('home.customizeHome')}
        open={dashOpen}
        onCancel={() => setDashOpen(false)}
        onOk={() => saveLayoutM.mutate({ hidden: hiddenDraft, favorites: favDraft })}
        confirmLoading={saveLayoutM.isPending}
      >
        <div style={{ marginBottom: 8, color: '#646A73', fontSize: 12 }}>{t('home.checkCardsToShow')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {WIDGETS.map((w) => (
            <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                checked={!hiddenDraft.includes(w.key)}
                onChange={(e) => {
                  setHiddenDraft((prev) =>
                    e.target.checked ? prev.filter((k) => k !== w.key) : [...prev, w.key],
                  )
                }}
              >
                {w.label}
              </Checkbox>
              <Button
                size="small"
                type="text"
                onClick={() => {
                  setFavDraft((prev) =>
                    prev.includes(w.key) ? prev.filter((k) => k !== w.key) : [...prev, w.key],
                  )
                }}
                style={{ color: favDraft.includes(w.key) ? '#f59e0b' : '#94a3b8' }}
              >
                {favDraft.includes(w.key) ? '★' : '☆'}
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
