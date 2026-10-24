import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { StarButton } from '../../components/StarButton'

import { App, Button, Card, Descriptions, Input, Modal, Select, Space, Steps, Tabs, Tag, Timeline, Typography } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiUrl } from '../../api/client'
import { CreateOpportunityButton } from '../../components/CreateOpportunityButton'
import { CustomFieldsBox } from '../../components/CustomFieldsBox'
import { DecisionChainChart } from '../../components/DecisionChainChart'
import { ActivityTimeline } from '../../components/ActivityTimeline'
import { ActivityCalendar } from '../../components/ActivityCalendar'
import { BizTimeline } from '../../components/BizTimeline'
import { NextBestActions } from '../../components/NextBestActions'
import { RenewalPlaybook } from '../../components/RenewalPlaybook'
import { MeetingMinutesBox, SuccessPlanBox } from '../../components/MeetingSuccess'
import { Sparkline } from '../../components/SimpleCharts'
import { t } from '../../i18n'

function NpsTrend({ accountId }: { accountId: string }) {
  const { data } = useQuery({
    queryKey: ['nps-account', accountId],
    enabled: !!accountId,
    queryFn: () =>
      api<{
        accountId: string
        nps: number
        avg: string
        total: number
        promoters: number
        detractors: number
        items: { id: string; score: number; comment?: string; createdAt: string }[]
      }>(`/nps/account/${accountId}`),
    retry: false,
  })
  const items = (data?.items ?? []).slice(0, 5)
  return (
    <div>
      <Space wrap>
        <Tag color="blue">NPS {data?.nps ?? 0}</Tag>
        <Tag>{t('common.average', { v: data?.avg ?? 0 })}</Tag>
        <Tag>{t('accounts.samples', { v: data?.total ?? 0 })}</Tag>
        <Tag color="green">{t('common.promoters', { v: data?.promoters ?? 0 })}</Tag>
        <Tag color="red">{t('common.detractors', { v: data?.detractors ?? 0 })}</Tag>
      </Space>
      {items.length ? (
        <>
          <div style={{ marginTop: 10 }}>
            <Sparkline
              points={[...items].reverse().map((x) => ({ date: String(x.createdAt).slice(0, 10), avg: Number(x.score) }))}
              labelKey="avg"
              color="#2b5fd9"
              height={72}
            />
          </div>
          <div style={{ marginTop: 8 }}>
            {items.map((x) => (
              <div key={x.id} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f1f5f9' }}>
                <b>{x.score}</b>{' '}{t('accounts.pts', { v: x.comment || '—', v2: ' ' })}
                <span style={{ color: '#94a3b8' }}>{String(x.createdAt).slice(0, 10)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>{t('accounts.noNpsScores')}</div>
      )}
    </div>
  )
}

export default function AccountDetailPage() {
  const [tagOpen, setTagOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const { id } = useParams()
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [detailTab, setDetailTab] = useState('overview')
  const healthQ = useQuery({
    queryKey: ['account-health', id],
    queryFn: () =>
      api<{ score: number; level: string; factors: string[] }>(`/reports/account-health/${id}`),
    enabled: !!id,
    retry: false,
  })
  const healthTrend = useQuery({
    queryKey: ['health-trend', id],
    queryFn: () =>
      api<{
        current: { score: number; level: string }
        points: { date: string; score: number; level: string }[]
      }>(`/reports/health-trend/${id}`),
    enabled: !!id,
    retry: false,
  })
  const journeyQ = useQuery({
    queryKey: ['account-journey', id],
    queryFn: () =>
      api<{
        milestones: {
          hasContact: boolean
          hasActivity: boolean
          hasOpp: boolean
          hasContract: boolean
          hasPayment: boolean
          hasService: boolean
        }
        events: { at: string; type: string; title: string; detail: string }[]
      }>(`/accounts/${id}/journey`),
    enabled: !!id,
    retry: false,
  })
  const hierarchyQ = useQuery({
    queryKey: ['account-hierarchy', id],
    queryFn: () =>
      api<{
        ancestors: { id: string; name: string; level: string; stage: string }[]
        children: { id: string; name: string; level: string; stage: string; children?: unknown[] }[]
      }>(`/accounts/${id}/hierarchy`),
    enabled: !!id,
    retry: false,
  })
  const accountsMini = useQuery({
    queryKey: ['accounts-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=50'),
    retry: false,
  })
  const { data, isLoading } = useQuery({
    queryKey: ['account-overview', id],
    queryFn: () =>
      api<{
        account: Record<string, unknown> & {
          id: string
          name: string
          level: string
          stage: string
          phone: string | null
          industry: string | null
          parentAccountId?: string | null
        }
        contacts: {
          id: string
          name: string
          mobile: string | null
          isPrimary: boolean
          title?: string | null
          decisionRole?: string | null
        }[]
        opportunities: { id: string; name: string; amount: string; stage: { name: string } }[]
        contracts: { id: string; contractNo: string; total: string; status: string }[]
        payments: { id: string; paymentNo: string; amount: string; status: string }[]
        tickets: { id: string; ticketNo: string; title: string; status: string }[]
        openActivities: { id: string; subject: string; dueAt: string | null }[]
        metrics: {
          totalContract: string
          totalReceived: string
          openOppAmount: string
          lifetimeValue?: string
          avgDeal?: string
          winRate?: string
          ticketCount?: number
          contactCount?: number
          lastActivityAt?: string | null
          nextActivityAt?: string | null
        }
      }>(`/accounts/${id}/overview`),
    enabled: !!id,
  })

  if (isLoading || !data) return null
  const a = data.account

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {a.name} <Tag>{a.level}</Tag> <Tag>{a.stage}</Tag>
        <Tag color="blue">{t('account.360')}</Tag>
        <StarButton type="ACCOUNT" id={a.id} name={a.name} />
      </Typography.Title>
      {healthQ.data && healthQ.data.level !== 'HEALTHY' ? (
        <div
          style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 8,
            background: healthQ.data.level === 'AT_RISK' ? '#fff7ed' : '#fef2f2',
            border: `1px solid ${healthQ.data.level === 'AT_RISK' ? '#fdba74' : '#fca5a5'}`,
            fontSize: 13,
          }}
        >
          <b style={{ color: healthQ.data.level === 'AT_RISK' ? '#9a3412' : '#b91c1c' }}>{t('accounts.n360InsightsRiskAlerts')}</b>
          <div style={{ marginTop: 4, color: '#475569' }}>{t('accounts.healthScore', { score: healthQ.data.score })}{' '}{(healthQ.data.factors ?? []).join(' / ') || t('accounts.lowEngagementFollowUp')}
          </div>
        </div>
      ) : null}
      <Card size="small" style={{ marginBottom: 12 }} className="crm-kpi">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#8b919a' }}>{t('account.ltv')}</div>
            <b style={{ fontSize: 18, color: '#2563eb' }}>
              {data.metrics.lifetimeValue ?? data.metrics.totalContract}
            </b>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b919a' }}>{t('accounts.contractsPayments')}</div>
            <b style={{ fontSize: 18, color: '#16a34a' }}>
              {data.metrics.totalContract} / {data.metrics.totalReceived}
            </b>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b919a' }}>{t('account.winRate')}</div>
            <b style={{ fontSize: 18, color: '#7c3aed' }}>{data.metrics.winRate ?? '0'}%</b>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b919a' }}>{t('accounts.contactsTickets')}</div>
            <b style={{ fontSize: 18, color: '#d97706' }}>
              {data.metrics.contactCount ?? data.contacts?.length ?? 0} / {data.metrics.ticketCount ?? 0}
            </b>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b919a' }}>{t('account.lastTouch')}</div>
            <b style={{ fontSize: 13 }}>
              {data.metrics.lastActivityAt
                ? String(data.metrics.lastActivityAt).slice(0, 10)
                : t('common.none')}
            </b>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#8b919a' }}>{t('account.nextAction')}</div>
            <b style={{ fontSize: 13, color: '#2563eb' }}>
              {data.metrics.nextActivityAt
                ? String(data.metrics.nextActivityAt).slice(0, 10)
                : t('accounts.toSchedule')}
            </b>
          </div>
        </div>
      </Card>
      <Tabs
        activeKey={detailTab}
        onChange={setDetailTab}
        style={{ marginBottom: 12 }}
        items={[
          { key: 'overview', label: t('accounts.overview') },
          { key: 'contacts', label: t('accounts.contacts', { v: data.contacts?.length ?? 0 }) },
          { key: 'biz', label: t('accounts.dealsContracts') },
          { key: 'collab', label: t('accounts.collaborationService') },
        ]}
      />
      {detailTab === 'overview' && (
        <>
      <Card size="small" title={t('accounts.accountTags')} style={{ marginBottom: 12 }}>
        <Space wrap>
          {(((a.customValues as { tags?: string[] } | null)?.tags) ?? []).map((tg) => (
            <Tag
              key={tg}
              color="geekblue"
              closable
              onClose={(e) => {
                e.preventDefault()
                const tags = (a.customValues as { tags?: string[] } | null)?.tags ?? []
                const list = tags.filter((x) => x !== tg)
                void api(`/accounts/${a.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ customValues: { ...(a.customValues as object), tags: list } }),
                }).then(() => window.location.reload())
              }}
            >
              {tg}
            </Tag>
          ))}
          <Button size="small" onClick={() => {
            const tags = (a.customValues as { tags?: string[] } | null)?.tags ?? []
            setTagInput(tags.join(','))
            setTagOpen(true)
          }}>{t('accounts.editTags')}</Button>
        </Space>
      </Card>
      <Modal
        title={t('accounts.editAccountTags')}
        open={tagOpen}
        onCancel={() => setTagOpen(false)}
        onOk={() => {
          const list = tagInput
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
          void api(`/accounts/${a.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ customValues: { ...(a.customValues as object), tags: list } }),
          }).then(() => {
            setTagOpen(false)
            window.location.reload()
          })
        }}
        okText={t('common.save')}
      >
        <Input
          placeholder={t('accounts.enterTagsSeparatedBy')}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
        />
        <div style={{ marginTop: 10 }}>
          <Space wrap>
            {([
              ['VIP', 'VIP'],
              ['续约', t('accounts.renewal')],
              ['重点客户', t('accounts.keyAccount')],
              ['风险', t('common.atRisk2')],
              ['新签', t('accounts.newSigning')],
            ] as const).map(([tag, label]) => (
              <Tag.CheckableTag
                key={tag}
                checked={tagInput.split(',').map((x) => x.trim()).includes(tag)}
                onChange={(c) => {
                  const set = new Set(tagInput.split(',').map((x) => x.trim()).filter(Boolean))
                  if (c) set.add(tag)
                  else set.delete(tag)
                  setTagInput([...set].join(','))
                }}
              >
                {label}
              </Tag.CheckableTag>
            ))}
          </Space>
        </div>
      </Modal>
      <Card size="small" title={t('accounts.n360Insights')} style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('common.healthScore')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: (healthQ.data?.score ?? 0) >= 80 ? '#16a34a' : (healthQ.data?.score ?? 0) >= 60 ? '#d97706' : '#dc2626' }}>
              {healthQ.data?.score ?? '-'}
            </div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('common.collectionRate')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2b5fd9' }}>
              {Number(data.metrics.totalContract) > 0
                ? ((Number(data.metrics.totalReceived) / Number(data.metrics.totalContract)) * 100).toFixed(0)
                : 0}%
            </div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('accounts.dealWinRate')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{data.metrics.winRate ?? 0}%</div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('nav.contacts')}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.metrics.contactCount ?? 0}</div>
          </div>
        </div>
      </Card>
      <Card size="small" title={t('accounts.n360Insights')} style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('common.healthScore')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: (healthQ.data?.score ?? 0) >= 80 ? '#16a34a' : (healthQ.data?.score ?? 0) >= 60 ? '#d97706' : '#dc2626' }}>
              {healthQ.data?.score ?? '-'}
            </div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('common.collectionRate')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2b5fd9' }}>
              {Number(data.metrics.totalContract) > 0
                ? ((Number(data.metrics.totalReceived) / Number(data.metrics.totalContract)) * 100).toFixed(0)
                : 0}%
            </div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('accounts.dealWinRate')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{data.metrics.winRate ?? 0}%</div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('nav.contacts')}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.metrics.contactCount ?? 0}</div>
          </div>
        </div>
      </Card>
      <Card size="small" title={t('accounts.n360Insights')} style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('common.healthScore')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: (healthQ.data?.score ?? 0) >= 80 ? '#16a34a' : (healthQ.data?.score ?? 0) >= 60 ? '#d97706' : '#dc2626' }}>
              {healthQ.data?.score ?? '-'}
            </div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('common.collectionRate')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2b5fd9' }}>
              {Number(data.metrics.totalContract) > 0
                ? ((Number(data.metrics.totalReceived) / Number(data.metrics.totalContract)) * 100).toFixed(0)
                : 0}%
            </div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('accounts.dealWinRate')}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{data.metrics.winRate ?? 0}%</div>
          </div>
          <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>{t('nav.contacts')}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data.metrics.contactCount ?? 0}</div>
          </div>
        </div>
      </Card>
      <Card size="small" title={t('account.health')} style={{ marginBottom: 12 }}>
        <Space>
          <Tag color={healthQ.data?.level === 'HEALTHY' ? 'green' : healthQ.data?.level === 'AT_RISK' ? 'orange' : 'red'}>
            {t('accounts.pts2', { v: healthQ.data?.score ?? '-', v2: healthQ.data?.level ?? '-' })}
          </Tag>
          {(healthQ.data?.factors ?? []).map((f) => (
            <Tag key={f}>{f}</Tag>
          ))}
        </Space>
        {(healthTrend.data?.points?.length ?? 0) > 1 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#8b919a', marginBottom: 4 }}>{t('accounts.healthTrend')}</div>
            <svg viewBox="0 0 280 60" style={{ width: '100%', maxWidth: 320 }}>
              {(healthTrend.data?.points ?? []).map((p, i, arr) => {
                const x = (i / Math.max(arr.length - 1, 1)) * 260 + 10
                const y = 50 - (p.score / 100) * 40
                return (
                  <g key={p.date + i}>
                    {i > 0 && (
                      <line
                        x1={(i - 1) / Math.max(arr.length - 1, 1) * 260 + 10}
                        y1={50 - (arr[i - 1].score / 100) * 40}
                        x2={x}
                        y2={y}
                        stroke={p.score >= 80 ? '#22c55e' : p.score >= 50 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="2"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={3}
                      fill={p.score >= 80 ? '#22c55e' : p.score >= 50 ? '#f59e0b' : '#ef4444'}
                    />
                  </g>
                )
              })}
              <line x1="10" y1={50 - 0.8 * 40} x2="270" y2={50 - 0.8 * 40} stroke="#e2e8f0" strokeDasharray="3 3" />
            </svg>
          </div>
        )}
        {healthQ.data && healthQ.data.score < 80 && (
          <Space style={{ marginTop: 8 }} wrap>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                void api(`/reports/account-health/${a.id}/intervene`, {
                  method: 'POST',
                  body: JSON.stringify({ action: 'care_task', note: t('accounts.careVisit', { name: a.name }) }),
                })
                  .then(() => {
                    message.success(t('accounts.careFollowUpTask'))
                    void qc.invalidateQueries({ queryKey: ['account-overview', id] })
                  })
                  .catch((e: Error) => message.error(e.message))
              }}
            >{t('accounts.createCareFollowUp')}</Button>
            <Button
              size="small"
              onClick={() => {
                void api(`/reports/account-health/${a.id}/intervene`, {
                  method: 'POST',
                  body: JSON.stringify({ action: 'risk_tag' }),
                })
                  .then(() => {
                    message.success(t('accounts.flaggedForRiskWatch'))
                    void qc.invalidateQueries({ queryKey: ['account-overview', id] })
                    void qc.invalidateQueries({ queryKey: ['account-health', id] })
                  })
                  .catch((e: Error) => message.error(e.message))
              }}
            >{t('accounts.flagRisk')}</Button>
            <Button
              size="small"
              onClick={() => {
                void api(`/reports/account-health/${a.id}/intervene`, {
                  method: 'POST',
                  body: JSON.stringify({ action: 'alert_owner' }),
                })
                  .then(() => message.success(t('accounts.ownerNotified')))
                  .catch((e: Error) => message.error(e.message))
              }}
            >{t('accounts.notifyOwner')}</Button>
          </Space>
        )}
      </Card>
      <Card size="small" title={t('account.hierarchy')} style={{ marginBottom: 12 }}>
        <Space wrap>
          {(hierarchyQ.data?.ancestors ?? []).map((p) => (
            <Tag key={p.id} color="blue">{t('accounts.parent', { name: p.name })}
            </Tag>
          ))}
          <Tag color="geekblue">{a.name}</Tag>
          {(hierarchyQ.data?.children ?? []).map((c) => (
            <Tag key={c.id} color="cyan">{t('accounts.child', { name: c.name })}
            </Tag>
          ))}
          {!hierarchyQ.data?.ancestors?.length && !hierarchyQ.data?.children?.length && (
            <span style={{ color: '#646A73' }}>{t('accounts.standaloneAccountNoHierarchy')}</span>
          )}
        </Space>
        <div style={{ marginTop: 8 }}>
          <Space>
            <Select
              style={{ width: 200 }}
              placeholder={t('accounts.setParentAccount')}
              allowClear
              value={
                (data.account as { parentAccountId?: string | null }).parentAccountId || undefined
              }
              options={(accountsMini.data?.items ?? []).map((x) => ({ value: x.id, label: x.name }))}
              onChange={(v) => {
                void api(`/accounts/${a.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ parentAccountId: v ?? null }),
                })
                  .then(() => {
                    message.success(t('accounts.hierarchyUpdated'))
                    void qc.invalidateQueries({ queryKey: ['account-hierarchy', id] })
                    void qc.invalidateQueries({ queryKey: ['account-overview', id] })
                  })
                  .catch((e: Error) => message.error(e.message))
              }}
            />
          </Space>
        </div>
      </Card>
      <NextBestActions accountId={a.id} />
      <ActivityTimeline entityType="ACCOUNT" entityId={a.id} title={t('common.interactionTimeline')} limit={10} />
      <Card size="small" title={t('accounts.customerSatisfactionNps')} style={{ marginBottom: 12 }}>
        <NpsTrend accountId={a.id} />
      </Card>
      <Card size="small" title={t('accounts.interactionCalendar')} style={{ marginBottom: 12 }}>
        <ActivityCalendar />
      </Card>
      <Card size="small" title={t('accounts.businessTimeline')} style={{ marginBottom: 12 }}>
        <BizTimeline accountId={a.id} limit={12} />
      </Card>
      <RenewalPlaybook accountId={a.id} compact />
      <Card size="small" title={t('account.journey')} style={{ marginBottom: 12 }}>
        <Steps
          size="small"
          current={(() => {
            const m = journeyQ.data?.milestones
            if (!m) return 0
            if (m.hasService) return 5
            if (m.hasPayment) return 4
            if (m.hasContract) return 3
            if (m.hasOpp) return 2
            if (m.hasActivity) return 1
            return 0
          })()}
          items={[
            { title: t('accounts.created') },
            { title: t('accounts.engaged') },
            { title: t('nav.opportunities') },
            { title: t('accounts.won') },
            { title: t('nav.payments') },
            { title: t('nav.tickets') },
          ]}
        />
        <Timeline
          style={{ marginTop: 16 }}
          items={(journeyQ.data?.events ?? []).slice(0, 8).map((e) => ({
            color:
              e.type === 'PAYMENT'
                ? 'green'
                : e.type === 'CONTRACT'
                  ? 'blue'
                  : e.type === 'OPPORTUNITY'
                    ? 'purple'
                    : e.type === 'TICKET'
                      ? 'red'
                      : 'gray',
            children: (
              <div>
                <b>{e.title}</b>
                <div style={{ color: '#8b919a', fontSize: 12 }}>
                  {e.at.slice(0, 10)} {e.detail}
                </div>
              </div>
            ),
          }))}
        />
      </Card>
      </>
      )}
      {detailTab === 'biz' && (
        <>
      <Space style={{ marginBottom: 12 }} wrap>
        <CreateOpportunityButton accountId={a.id} onDone={() => void qc.invalidateQueries({ queryKey: ['account-overview', id] })} />
        <Select
          style={{ width: 140 }}
          value={a.stage}
          options={['POTENTIAL', 'ACTIVE', 'AT_RISK', 'CHURNED'].map((s) => ({
            value: s,
            label: s,
          }))}
          onChange={(stage) => {
            void api(`/accounts/${a.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ stage }),
            })
              .then(() => {
                message.success('OK')
                void qc.invalidateQueries({ queryKey: ['account-overview', id] })
              })
              .catch((e: Error) => message.error(e.message))
          }}
        />
      </Space>
      <div className="crm-grid crm-cols-2 crm-h-md">
        <Card size="small" title={t('common.basicInfo')}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={t('common.industry')}>{a.industry ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('enum.activity.type.CALL')}>{a.phone ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={t('common.contractTotal')}>{data.metrics.totalContract}</Descriptions.Item>
            <Descriptions.Item label={t('common.received')}>{data.metrics.totalReceived}</Descriptions.Item>
            <Descriptions.Item label={t('common.outstanding')}>
              <b style={{ color: '#dc2626' }}>
                {(Number(data.metrics.totalContract) - Number(data.metrics.totalReceived)).toFixed(2)}
              </b>
            </Descriptions.Item>
            <Descriptions.Item label={t('common.collectionRate')}>
              <b>
                {Number(data.metrics.totalContract) > 0
                  ? (
                      (Number(data.metrics.totalReceived) / Number(data.metrics.totalContract)) *
                      100
                    ).toFixed(1)
                  : '0'}
                %
              </b>
            </Descriptions.Item>
            <Descriptions.Item label={t('accounts.openDealAmount')}>{data.metrics.openOppAmount}</Descriptions.Item>
            <Descriptions.Item label={t('account.winRate')}>{data.metrics.winRate ?? '0'}%</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card
          size="small"
          title={t('accounts.buyingCommittee')}
          extra={<Link to={`/contacts?accountId=${a.id}`}>{t('accounts.allContacts')}</Link>}
        >
          <ContactAddBox
            accountId={a.id}
            onDone={() => void qc.invalidateQueries({ queryKey: ['account-overview', id] })}
          />
          <div style={{ marginTop: 8 }}>
            <DecisionChainChart
              contacts={data.contacts ?? []}
              editable
              onChanged={() => void qc.invalidateQueries({ queryKey: ['account-overview', id] })}
            />
          </div>
        </Card>
      </div>
      <div className="crm-grid crm-cols-2 crm-h-md">
        <Card size="small" title={t('nav.opportunities')}>
          <AutoFitTable
            rowKey="id"
            size="small"
            pagination={{ pageSize: 6 }}
            dataSource={data.opportunities}
            columns={[
              { title: t('audit.field.name'), dataIndex: 'name' },
              { title: t('audit.field.amount'), dataIndex: 'amount' },
              { title: t('audit.field.stage'), render: (_: unknown, r: { stage: { name: string } }) => r.stage.name },
            ]}
          />
        </Card>
        <Card size="small" title={t('nav.contracts')}>
          <AutoFitTable
            rowKey="id"
            size="small"
            pagination={{ pageSize: 6 }}
            dataSource={data.contracts}
            columns={[
              { title: t('common.no'), dataIndex: 'contractNo' },
              { title: t('audit.field.amount'), dataIndex: 'total' },
              { title: t('audit.field.status'), dataIndex: 'status' },
            ]}
          />
        </Card>
        <Card size="small" title={t('nav.payments')}>
          <AutoFitTable
            rowKey="id"
            size="small"
            pagination={{ pageSize: 6 }}
            dataSource={data.payments}
            columns={[
              { title: t('common.no'), dataIndex: 'paymentNo' },
              { title: t('audit.field.amount'), dataIndex: 'amount' },
              { title: t('audit.field.status'), dataIndex: 'status' },
            ]}
          />
        </Card>
        <Card size="small" title={t('common.tickets')}>
          <AutoFitTable
            rowKey="id"
            size="small"
            pagination={{ pageSize: 6 }}
            dataSource={data.tickets}
            columns={[
              { title: t('common.no'), dataIndex: 'ticketNo' },
              { title: t('audit.field.title'), dataIndex: 'title' },
              { title: t('audit.field.status'), dataIndex: 'status' },
            ]}
          />
        </Card>
      </div>
        </>
      )}
      {detailTab === 'contacts' && (
        <>
          <Card
            size="small"
            title={t('accounts.contactsDecisionChain')}
            className="crm-panel-fixed"
            extra={<AddContactButton accountId={a.id} />}
          >
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={(data.contacts ?? []) as unknown as Record<string, unknown>[]}
              columns={[
                {
                  title: t('common.name'),
                  dataIndex: 'name',
                  render: (v: unknown, r: Record<string, unknown>) => (
                    <Space size={6}>
                      {Boolean(r.isPrimary) && <Tag color="gold">{t('common.primary')}</Tag>}
                      <b>{String(v)}</b>
                    </Space>
                  ),
                },
                { title: t('common.jobTitle'), dataIndex: 'title', render: (v: unknown) => (v ? String(v) : '-') },
                {
                  title: t('common.decisionRole'),
                  dataIndex: 'decisionRole',
                  render: (v: unknown) => {
                    const map: Record<string, string> = {
                      ECONOMIC: t('contacts.role.economic'),
                      CHAMPION: t('contacts.role.champion'),
                      TECH: t('common.technicalEvaluator'),
                      USER: t('common.user'),
                      OTHER: t('common.other'),
                    }
                    const key = String(v ?? 'OTHER')
                    return <Tag>{map[key] ?? key}</Tag>
                  },
                },
                { title: t('common.mobile'), dataIndex: 'mobile', render: (v: unknown) => (v ? String(v) : '-') },
              ]}
            />
            {!data.contacts?.length && (
              <div className="crm-muted" style={{ marginTop: 8 }}>{t('accounts.noContactsClickAdd')}</div>
            )}
          </Card>
        </>
      )}
      {detailTab === 'collab' && (
        <>
      <SuccessPlanBox accountId={a.id} />
      <MeetingMinutesBox entityType="ACCOUNT" entityId={a.id} />
      <ShareBox entityType="ACCOUNT" entityId={a.id} />
      <FilesBox entityType="ACCOUNT" entityId={a.id} />
      <CustomFieldsBox
        entityType="ACCOUNT"
        entityId={a.id}
        customValues={(a.customValues as Record<string, unknown>) ?? null}
      />
        </>
      )}
    </div>
  )
}

/** 客户 360 · 新增联系人（M03） */
function AddContactButton({ accountId }: { accountId: string }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [val, setVal] = useState<{
    name: string
    title?: string
    mobile?: string
    email?: string
    decisionRole?: string
    isPrimary?: boolean
  }>({ name: '' })

  const save = async () => {
    if (!val.name.trim()) {
      message.warning(t('accounts.pleaseEnterAName'))
      return
    }
    setSaving(true)
    try {
      await api(`/accounts/${accountId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ ...val, name: val.name.trim() }),
      })
      message.success(t('accounts.contactAdded'))
      setOpen(false)
      setVal({ name: '' })
      void qc.invalidateQueries({ queryKey: ['account-overview', accountId] })
      void qc.invalidateQueries({ queryKey: ['contacts'] })
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button size="small" type="primary" onClick={() => setOpen(true)}>{t('accounts.addContact')}</Button>
      <Modal
        title={t('accounts.addContact')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void save()}
        confirmLoading={saving}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Input
            placeholder={t('accounts.name')}
            value={val.name}
            onChange={(e) => setVal({ ...val, name: e.target.value })}
          />
          <Input
            placeholder={t('common.jobTitle')}
            value={val.title}
            onChange={(e) => setVal({ ...val, title: e.target.value })}
          />
          <Select
            allowClear
            placeholder={t('common.decisionRole')}
            style={{ width: '100%' }}
            value={val.decisionRole}
            onChange={(v) => setVal({ ...val, decisionRole: v })}
            options={[
              { value: 'ECONOMIC', label: t('contacts.role.economic') },
              { value: 'CHAMPION', label: t('contacts.role.champion') },
              { value: 'TECH', label: t('common.technicalEvaluator') },
              { value: 'USER', label: t('common.user') },
              { value: 'OTHER', label: t('common.other') },
            ]}
          />
          <Input
            placeholder={t('common.mobile')}
            value={val.mobile}
            onChange={(e) => setVal({ ...val, mobile: e.target.value })}
          />
          <Input
            placeholder={t('common.email')}
            value={val.email}
            onChange={(e) => setVal({ ...val, email: e.target.value })}
          />
        </Space>
      </Modal>
    </>
  )
}

function ShareBox({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { message } = App.useApp()
  const [userId, setUserId] = useState('')
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])

  const loadUsers = async () => {
    const res = await api<{ items: { id: string; name: string }[] }>('/users/options')
    setUsers(res.items ?? [])
  }

  const share = async () => {
    if (!userId) return
    try {
      const path =
        entityType === 'ACCOUNT'
          ? `/accounts/${entityId}/share`
          : `/opportunities/${entityId}/share`
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ userId, role: 'VIEWER' }),
      })
      message.success(t('common.shared'))
      setUserId('')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'failed')
    }
  }

  return (
    <Card size="small" style={{ marginBottom: 12 }} title={t('accounts.sharing')}>
      <Space wrap>
        <Select
          style={{ minWidth: 180 }}
          placeholder={t('common.selectUser')}
          value={userId || undefined}
          onFocus={() => void loadUsers()}
          options={users.map((u) => ({ value: u.id, label: u.name }))}
          onChange={setUserId}
        />
        <Button onClick={() => void share()}>{t('accounts.shareReadOnly')}</Button>
      </Space>
    </Card>
  )
}

function ContactAddBox({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const { message } = App.useApp()
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [title, setTitle] = useState('')
  const [role, setRole] = useState('USER')
  const create = useMutation({
    mutationFn: () =>
      api(`/accounts/${accountId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ name, mobile, title, decisionRole: role, isPrimary: false }),
      }),
    onSuccess: () => {
      message.success(t('accounts.contactAdded2'))
      setName('')
      setMobile('')
      setTitle('')
      setRole('USER')
      onDone()
    },
    onError: (e: Error) => message.error(e.message),
  })
  return (
    <Space style={{ marginBottom: 8 }} wrap>
      <Input
        placeholder={t('accounts.contactName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ width: 120 }}
      />
      <Input
        placeholder={t('accounts.title')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ width: 100 }}
      />
      <Input
        placeholder={t('common.mobile')}
        value={mobile}
        onChange={(e) => setMobile(e.target.value)}
        style={{ width: 120 }}
      />
      <Select
        value={role}
        style={{ width: 110 }}
        onChange={setRole}
        options={[
          { value: 'ECONOMIC', label: t('common.economicBuyer') },
          { value: 'CHAMPION', label: t('common.internalCoach') },
          { value: 'TECH', label: t('common.technicalGatekeeper') },
          { value: 'USER', label: t('common.userDepartment') },
          { value: 'OTHER', label: t('common.other') },
        ]}
      />
      <Button
        size="small"
        type="primary"
        disabled={!name}
        loading={create.isPending}
        onClick={() => create.mutate()}
      >{t('accounts.addContact2')}</Button>
    </Space>
  )
}

function FilesBox({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { message } = App.useApp()
  const filesQ = useQuery({
    queryKey: ['files', entityType, entityId],
    queryFn: () =>
      api<{ id: string; fileName: string }[]>(`/files/entity/${entityType}/${entityId}`),
    retry: false,
  })

  return (
    <Card size="small" style={{ marginBottom: 12 }} title={t('accounts.attachments')}>
      <Button
        size="small"
        onClick={() => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.pdf,.png,.jpg,.jpeg'
          input.onchange = async () => {
            const f = input.files?.[0]
            if (!f) return
            const fd = new FormData()
            fd.append('file', f)
            fd.append('entityType', entityType)
            fd.append('entityId', entityId)
            const res = await fetch(apiUrl('/api/v1/files'), {
              method: 'POST',
              headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
              body: fd,
            })
            const body = await res.json()
            if (body.code === 0) {
              message.success(t('accounts.uploaded'))
              void filesQ.refetch()
            } else message.error(body.message)
          }
          input.click()
        }}
      >{t('common.uploadAttachment')}</Button>
      <AutoFitTable
        rowKey="id"
        size="small"
        pagination={false}
        style={{ marginTop: 8 }}
        dataSource={filesQ.data ?? []}
        columns={[
          {
            title: t('accounts.file'),
            dataIndex: 'fileName',
            render: (v: string, r: { id: string }) => (
              <a href={apiUrl(`/api/v1/files/${r.id}`)} target="_blank" rel="noreferrer">
                {v}
              </a>
            ),
          },
        ]}
      />
    </Card>
  )
}
