import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Checkbox, Space, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

const STEPS = [
  { key: 'usage', label: t('cmp.renewalPlaybook.confirmProductUsageActivity'), tip: t('cmp.renewalPlaybook.areLoginsUsageHealthy') },
  { key: 'health', label: t('cmp.renewalPlaybook.reviewCustomerHealthScore'), tip: t('cmp.renewalPlaybook.interveneFirstIfBelow') },
  { key: 'value', label: t('cmp.renewalPlaybook.summarizeDeliveredValue'), tip: t('cmp.renewalPlaybook.prepareRoiScorecard') },
  { key: 'stakeholder', label: t('cmp.renewalPlaybook.reachTheDecisionChain'), tip: t('cmp.renewalPlaybook.contactAtLeastThe') },
  { key: 'quote', label: t('cmp.renewalPlaybook.sendRenewalQuote'), tip: t('cmp.renewalPlaybook.includeExpansionUpgradeSuggestions') },
  { key: 'negotiate', label: t('cmp.renewalPlaybook.commercialNegotiation'), tip: t('cmp.renewalPlaybook.discountAndPaymentTerms') },
  { key: 'contract', label: t('cmp.renewalPlaybook.signingAndPaymentPlan'), tip: t('cmp.renewalPlaybook.eSignPaymentSchedule') },
]

/** 续约/客户成功剧本（对标 Gainsight / HubSpot Playbook） */
export function RenewalPlaybook({
  accountId,
  compact = false,
}: {
  accountId?: string
  compact?: boolean
}) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [done, setDone] = useState<Record<string, boolean>>({})

  const q = useQuery({
    queryKey: ['renewal-playbook', accountId ?? 'global'],
    enabled: !!accountId,
    queryFn: () =>
      api<{ score?: number; level?: string }>(`/reports/account-health/${accountId}`),
    retry: false,
  })

  const progressQ = useQuery({
    queryKey: ['renewal-playbook', 'progress', accountId ?? 'global'],
    queryFn: () =>
      api<{ steps: Record<string, boolean> }>(
        `/settings/renewal-playbook${accountId ? `?accountId=${accountId}` : ''}`,
      ),
    retry: false,
  })

  useEffect(() => {
    if (progressQ.data) setDone(progressQ.data.steps ?? {})
  }, [progressQ.data])

  const saveM = useMutation({
    mutationFn: () =>
      api('/settings/renewal-playbook', {
        method: 'PUT',
        body: JSON.stringify({ accountId, steps: done }),
      }),
    onSuccess: () => {
      message.success(t('cmp.renewalPlaybook.playbookProgressSaved'))
      void qc.invalidateQueries({ queryKey: ['renewal-playbook'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const doneCount = STEPS.filter((s) => done[s.key]).length
  const pct = Math.round((doneCount / STEPS.length) * 100)

  return (
    <Card
      size="small"
      title={t('cmp.renewalPlaybook.renewalPlaybook')}
      style={{ marginBottom: 12 }}
      extra={
        <Space>
          <Tag color={pct >= 80 ? 'green' : pct >= 40 ? 'blue' : 'default'}>{pct}%</Tag>
          {accountId && (
            <Tag color={q.data?.level === 'HEALTHY' ? 'green' : 'orange'}>{t('common.healthy', { v: q.data?.score ?? '-' })}
            </Tag>
          )}
        </Space>
      }
    >
      {!compact && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>{t('cmp.renewalPlaybook.standardRenewalPathSecure')}</Typography.Paragraph>
      )}
      <Space direction="vertical" style={{ width: '100%' }} size={4}>
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              padding: '4px 6px',
              borderRadius: 4,
              background: done[s.key] ? '#f0fdf4' : 'transparent',
            }}
          >
            <Checkbox
              checked={!!done[s.key]}
              onChange={(e) => setDone((p) => ({ ...p, [s.key]: e.target.checked }))}
            />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  textDecoration: done[s.key] ? 'line-through' : 'none',
                  opacity: done[s.key] ? 0.6 : 1,
                }}
              >
                {i + 1}. {s.label}
              </div>
              {!compact && (
                <div style={{ fontSize: 11, color: '#8b919a' }}>{s.tip}</div>
              )}
            </div>
          </div>
        ))}
      </Space>
      <Button
        size="small"
        type="primary"
        style={{ marginTop: 8 }}
        loading={saveM.isPending}
        onClick={() => saveM.mutate()}
      >{t('cmp.renewalPlaybook.saveProgress')}</Button>
    </Card>
  )
}
