import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Space, Tag, Input, Modal, Empty } from 'antd'
import { ErpListShell } from '../components/ErpListShell'
import { ErpTable } from '../components/ErpTable'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { useIsMobile } from '../hooks/useIsMobile'
import { t } from '../i18n'

interface ApprovalStep {
  id: string
  stepIndex: number
  approverId: string
  action: string | null
  comment: string | null
  actedAt: string | null
}

interface Approval {
  id: string
  status: string
  entityType: string
  entityId: string
  currentStep: number
  startedAt: string
  definition?: { name: string }
  steps: ApprovalStep[]
  entity?: { quoteNo?: string; contractNo?: string; subject?: string; title?: string; total?: string; status?: string } | null
}

export default function ApprovalsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'todo' | 'mine'>('todo')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const isMobile = useIsMobile()

  const listQ = useQuery({
    queryKey: ['approvals', tab],
    queryFn: () => api<{ items: Approval[]; total: number }>(`/approvals/${tab}?pageSize=50`),
  })

  const batchM = useMutation({
    mutationFn: (p: { ids: string[]; action: 'approve' | 'reject'; comment?: string }) =>
      api('/approvals/batch-approve', {
        method: 'POST',
        body: JSON.stringify(p),
      }),
    onSuccess: (r: unknown) => {
      const ok = (r as { ok?: number })?.ok ?? 0
      const failed = (r as { failed?: number })?.failed ?? 0
      message.success(t('approvals.batchProcessed', { ok, v: failed ? t('common.failed', { failed }) : '' }))
      setSelectedIds([])
      void qc.invalidateQueries({ queryKey: ['approvals'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const act = useMutation({
    mutationFn: (p: { id: string; action: 'approve' | 'reject' | 'cancel'; comment?: string }) =>
      api(`/approvals/${p.id}/${p.action}`, {
        method: 'POST',
        body: JSON.stringify({ comment: p.comment }),
      }),
    onSuccess: () => {
      message.success('OK')
      setRejectId(null)
      setComment('')
      void qc.invalidateQueries({ queryKey: ['approvals'] })
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtapv0001"
        title={t('nav.approvals')}
        subtitle={t('approvals.insightsApprovalCenter')}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['approvals'] })}
        extraActions={
          <Space wrap>
            <Button size="small" type={tab === 'todo' ? 'primary' : 'default'} onClick={() => setTab('todo')}>{t('common.awaitingMe')}</Button>
            <Button size="small" type={tab === 'mine' ? 'primary' : 'default'} onClick={() => setTab('mine')}>{t('approvals.submittedByMe')}</Button>
            {tab === 'todo' && selectedIds.length > 0 && (
              <>
                <Button
                  size="small"
                  type="primary"
                  loading={batchM.isPending}
                  onClick={() => batchM.mutate({ ids: selectedIds, action: 'approve' })}
                >{t('approvals.approveSelected', { length: selectedIds.length })}</Button>
                <Button
                  size="small"
                  danger
                  loading={batchM.isPending}
                  onClick={() => batchM.mutate({ ids: selectedIds, action: 'reject', comment: t('approvals.rejectSelected') })}
                >{t('approvals.rejectSelected')}</Button>
              </>
            )}
          </Space>
        }
      >
        {isMobile && tab === 'todo' && (
          <div style={{ marginBottom: 12 }}>
            <Space style={{ marginBottom: 10 }}>
              <Button
                size="small"
                onClick={() => {
                  const ids = (listQ.data?.items ?? []).map((r) => r.id)
                  setSelectedIds(ids)
                }}
              >{t('approvals.selectAll', { length: (listQ.data?.items ?? []).length })}</Button>
              <Button size="small" onClick={() => setSelectedIds([])}>{t('common.clear')}</Button>
              {selectedIds.length > 0 && (
                <Button
                  size="small"
                  type="primary"
                  loading={batchM.isPending}
                  onClick={() => batchM.mutate({ ids: selectedIds, action: 'approve' })}
                >{t('approvals.approveSelected', { length: selectedIds.length })}</Button>
              )}
            </Space>
            {(listQ.data?.items ?? []).map((r) => (
              <div key={r.id}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={(e) => {
                      setSelectedIds((prev) =>
                        e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                      )
                    }}
                  />
                  <span style={{ fontSize: 12, color: '#64748b' }}>{t('approvals.select')}</span>
                </label>
                <SwipeApproveCard
                  item={r}
                  onApprove={() => act.mutate({ id: r.id, action: 'approve', comment: t('approvals.approvedViaMobileSwipe') })}
                  onReject={() => act.mutate({ id: r.id, action: 'reject', comment: t('approvals.rejectedViaMobileSwipe') })}
                />
              </div>
            ))}
            {!(listQ.data?.items ?? []).length && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noPendingApprovals')} />
            )}
          </div>
        )}
        {!(isMobile && tab === 'todo') && (
        <ErpTable
          rowKey="id"
          storageKey="approvals"
          loading={listQ.isLoading}
          dataSource={(listQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
          pageSize={15}
          columns={[
            {
              title: t('approvals.document'),
              dataIndex: 'entity',
              width: 130,
              render: (_v, row) => {
                const r = row as unknown as Approval
                const no = r.entity?.quoteNo || r.entity?.contractNo || r.entityId
                if (r.entityType === 'QUOTE') return <Link to="/quotes">{no}</Link>
                if (r.entityType === 'CONTRACT') return <Link to="/contracts">{no}</Link>
                return String(no)
              },
            },
            {
              title: t('audit.field.title'),
              dataIndex: 'title',
              width: 160,
              filterType: 'text',
              render: (_v, row) => {
                const r = row as unknown as Approval
                return r.entity?.subject || r.entity?.title || '-'
              },
            },
            {
              title: t('common.type'),
              dataIndex: 'entityType',
              width: 90,
              filterType: 'select',
              filterOptions: [
                { value: 'QUOTE', label: 'QUOTE' },
                { value: 'CONTRACT', label: 'CONTRACT' },
                { value: 'PAYMENT', label: 'PAYMENT' },
              ],
            },
            {
              title: t('audit.field.amount'),
              dataIndex: 'amount',
              width: 100,
              render: (_v, row) => {
                const r = row as unknown as Approval
                return r.entity?.total ?? '-'
              },
            },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 90,
              filterType: 'select',
              filterOptions: [
                { value: 'PENDING', label: 'PENDING' },
                { value: 'APPROVED', label: 'APPROVED' },
                { value: 'REJECTED', label: 'REJECTED' },
              ],
              render: (v) => (
                <Tag
                  color={
                    String(v) === 'PENDING'
                      ? 'orange'
                      : String(v) === 'APPROVED'
                        ? 'green'
                        : String(v) === 'REJECTED'
                          ? 'red'
                          : 'default'
                  }
                >
                  {String(v)}
                </Tag>
              ),
            },
            {
              title: t('approvals.progress'),
              dataIndex: 'steps',
              width: 80,
              render: (_v, row) => {
                const r = row as unknown as Approval
                return `${(r.steps ?? []).filter((s) => s.action === 'APPROVE').length}/${(r.steps ?? []).length}`
              },
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 170,
              render: (_v, row) => {
                const r = row as unknown as Approval
                if (tab === 'mine') {
                  return r.status === 'PENDING' ? (
                    <Button size="small" onClick={(e) => { e.stopPropagation(); act.mutate({ id: r.id, action: 'cancel' }) }}>{t('approvals.withdraw')}</Button>
                  ) : null
                }
                const cur = (r.steps ?? []).find((s) => s.stepIndex === r.currentStep)
                if (r.status !== 'PENDING' || !cur) return null
                return (
                  <Space>
                    <Button
                      size="small"
                      type="primary"
                      onClick={(e) => { e.stopPropagation(); act.mutate({ id: r.id, action: 'approve' }) }}
                    >{t('common.approve2')}</Button>
                    <Button size="small" danger onClick={(e) => { e.stopPropagation(); setRejectId(r.id) }}>{t('common.reject')}</Button>
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        void api(`/approvals/${r.id}/urge`, { method: 'POST' })
                          .then(() => message.success(t('approvals.reminderSent')))
                          .catch((err: Error) => message.error(err.message))
                      }}
                    >{t('approvals.remind')}</Button>
                  </Space>
                )
              },
            },
          ]}
        />
        )}
      </ErpListShell>
      <Modal
        title={t('approvals.rejectionComment')}
        open={!!rejectId}
        onCancel={() => setRejectId(null)}
        onOk={() => {
          if (!comment) {
            message.error(t('validation.required'))
            return
          }
          act.mutate({ id: rejectId!, action: 'reject', comment })
        }}
        confirmLoading={act.isPending}
      >
        <Input.TextArea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </div>
  )
}

/** 移动端滑动审批卡片：右滑同意 / 左滑驳回 */
function SwipeApproveCard({
  item,
  onApprove,
  onReject,
}: {
  item: Approval
  onApprove: () => void
  onReject: () => void
}) {
  const startX = useRef(0)
  const [dx, setDx] = useState(0)
  const title = item.entity?.subject || item.entity?.title || item.entity?.quoteNo || item.entityId

  return (
    <div
      className="swipe-approve-card"
      onTouchStart={(e) => {
        startX.current = e.touches[0].clientX
      }}
      onTouchMove={(e) => {
        setDx(e.touches[0].clientX - startX.current)
      }}
      onTouchEnd={() => {
        if (dx > 70) onApprove()
        else if (dx < -70) onReject()
        setDx(0)
      }}
      style={{
        transform: `translateX(${Math.max(-100, Math.min(100, dx))}px)`,
        background: dx > 40 ? '#dcfce7' : dx < -40 ? '#fee2e2' : '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 8,
        touchAction: 'pan-y',
        transition: dx === 0 ? 'transform .2s, background .2s' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
          <div style={{ color: '#646A73', fontSize: 12, marginTop: 2 }}>
            {item.entityType} · {item.definition?.name ?? t('nav.approvals')}
          </div>
        </div>
        <Space>
          <Button size="small" type="primary" onClick={onApprove}>{t('common.approve2')}</Button>
          <Button size="small" danger onClick={onReject}>{t('common.reject')}</Button>
        </Space>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 6 }}>{t('approvals.swipeLeftToReject')}</div>
    </div>
  )
}
