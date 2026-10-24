import { useQuery } from '@tanstack/react-query'
import { Tag } from 'antd'
import { api } from '../api/client'
import { t } from '../i18n'

/** 报价/审批流图：水平步骤 + 当前进度 */
export function ApprovalFlowChart({ quoteId }: { quoteId?: string }) {
  const q = useQuery({
    queryKey: ['approval-flow', quoteId],
    queryFn: () =>
      api<{
        definition: { name: string; isActive: boolean } | null
        steps: { index: number; label: string; type: string; levels: number }[]
        instance: {
          status: string
          currentStep: number
          steps: { stepIndex: number; action: string | null }[]
        } | null
      }>(`/reports/approval-flow${quoteId ? `?quoteId=${quoteId}` : ''}`),
    retry: false,
  })

  const steps = q.data?.steps ?? []
  const inst = q.data?.instance
  const current = inst?.currentStep ?? -1

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {steps.map((s, i) => {
          const action = inst?.steps?.find((x) => x.stepIndex === s.index)?.action
          const done = action === 'APPROVE'
          const rejected = action === 'REJECT'
          const active = inst && current === s.index && !action
          return (
            <div key={s.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  minWidth: 100,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${rejected ? '#dc2626' : done ? '#16a34a' : active ? '#2563eb' : '#e2e8f0'}`,
                  background: rejected ? '#fef2f2' : done ? '#f0fdf4' : active ? '#eff6ff' : '#fff',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: '#94a3b8' }}>Step {s.index + 1}</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.label}</div>
                <Tag
                  color={rejected ? 'red' : done ? 'green' : active ? 'blue' : 'default'}
                  style={{ marginTop: 4, fontSize: 10 }}
                >
                  {rejected ? t('common.reject') : done ? t('cmp.approvalFlowChart.approved') : active ? t('enum.quote.status.SUBMITTED') : t('common.notStarted')}
                </Tag>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 24, height: 2, background: '#cbd5e1' }} />
              )}
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: '#646A73' }}>{t('cmp.approvalFlowChart.rule')}{q.data?.definition?.name ?? t('cmp.approvalFlowChart.quoteDiscountAmountApproval')}
        {inst ? t('cmp.approvalFlowChart.instanceStatus', { status: inst.status }) : t('cmp.approvalFlowChart.notStartedYet')}
      </div>
    </div>
  )
}
