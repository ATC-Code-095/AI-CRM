import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Empty, Modal, Pagination, Segmented, Space, Tag, Typography } from 'antd'
import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  PhoneOutlined,
  SendOutlined,
  ThunderboltOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { t } from '../../i18n'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  isRead: boolean
  entityType: string | null
  entityId: string | null
  createdAt: string
}

const TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  APPROVAL_TODO: { label: t('enum.quote.status.SUBMITTED'), color: 'orange', icon: <CheckCircleOutlined /> },
  APPROVAL_DONE: { label: t('notifications.approvalCompleted'), color: 'green', icon: <CheckCircleOutlined /> },
  LEAD_ASSIGNED: { label: t('notifications.leadAssigned'), color: 'blue', icon: <BellOutlined /> },
  ACTIVITY_DUE: { label: t('notifications.followUpDue'), color: 'gold', icon: <ClockCircleOutlined /> },
  PAYMENT_CONFIRMED: { label: t('notifications.paymentConfirmed'), color: 'green', icon: <DollarOutlined /> },
  SLA_ALERT: { label: t('common.slaAlerts'), color: 'red', icon: <ClockCircleOutlined /> },
  JOURNEY_AUTO: { label: t('notifications.journeyAutomation'), color: 'purple', icon: <ThunderboltOutlined /> },
  OUTREACH: { label: t('common.batchOutreach'), color: 'cyan', icon: <SendOutlined /> },
  RENEWAL_OPP: { label: t('common.renewalDeal'), color: 'gold', icon: <FileTextOutlined /> },
  FUNNEL_STALL: { label: t('notifications.funnelStalled'), color: 'red', icon: <ClockCircleOutlined /> },
  SEGMENT: { label: t('notifications.segmentOutreach'), color: 'geekblue', icon: <SendOutlined /> },
  HEALTH_ALERT: { label: t('notifications.healthAlert'), color: 'orange', icon: <ClockCircleOutlined /> },
}

/** 未登记的类型：下划线转空格、首字母大写，避免直接暴露代码 */
function fallbackType(n: Notification) {
  const raw = (n.type ?? '')
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
  return { label: raw || t('common.notifications'), color: 'default', icon: <BellOutlined /> }
}

/** 通知 → 业务对象跳转 */
function linkOf(n: Notification): string | null {
  const type = (n.entityType ?? '').toUpperCase()
  if (type === 'OPPORTUNITY' && n.entityId) return `/opportunities/${n.entityId}`
  if (type === 'LEAD' && n.entityId) return `/leads/${n.entityId}`
  if (type === 'ACCOUNT' && n.entityId) return `/accounts/${n.entityId}`
  if (type === 'QUOTE' && n.entityId) return `/quotes/${n.entityId}`
  if (type === 'CONTRACT') return '/contracts'
  if (type === 'TICKET') return '/tickets'
  if (type === 'ACTIVITY') return '/activities'
  if ((n.type ?? '').startsWith('APPROVAL')) return '/approvals'
  return null
}

function textOf(n: Notification): string {
  const type = (n.entityType ?? '').toUpperCase()
  if (type === 'OPPORTUNITY' && n.entityId) return t('common.openDeal')
  if (type === 'LEAD' && n.entityId) return t('notifications.openLead')
  if (type === 'ACCOUNT' && n.entityId) return t('notifications.openAccount')
  if (type === 'QUOTE' && n.entityId) return t('notifications.openQuote')
  if (type === 'CONTRACT') return t('notifications.openContract')
  if (type === 'TICKET') return t('common.openTicket')
  if (type === 'ACTIVITY') return t('notifications.openFollowUp')
  if ((n.type ?? '').startsWith('APPROVAL')) return t('common.review')
  return t('notifications.view')
}

/**
 * 通知中心：全部 / 未读 / 审批 / 提醒 四类筛选，
 * 支持单条已读、全部已读、按业务对象跳转。
 */
export default function NotificationsPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [tab, setTab] = useState<'all' | 'unread' | 'approval' | 'remind'>('all')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [prefOpen, setPrefOpen] = useState(false)
  const [muted, setMuted] = useState<string[]>([])

  const prefsQ = useQuery({
    queryKey: ['notif-prefs'],
    queryFn: () => api<{ mutedTypes: string[] }>('/notifications/preferences'),
    retry: false,
  })
  const savePrefsM = useMutation({
    mutationFn: () =>
      api('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({ mutedTypes: muted }),
      }),
    onSuccess: () => {
      message.success(t('notifications.notificationPreferencesSaved'))
      setPrefOpen(false)
      void qc.invalidateQueries({ queryKey: ['notif-prefs'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', tab, page, typeFilter],
    queryFn: () =>
      api<{ items: Notification[]; total: number }>(
        `/notifications?pageSize=20&page=${page}${tab === 'unread' ? '&unreadOnly=true' : ''}${
          typeFilter ? `&type=${typeFilter}` : ''
        }`,
      ),
    retry: false,
  })

  const rows = (data?.items ?? []).filter((n) => {
    if (tab === 'approval') return (n.type ?? '').startsWith('APPROVAL')
    if (tab === 'remind') return !(n.type ?? '').startsWith('APPROVAL')
    return true
  })

  useEffect(() => {
    if (prefsQ.data?.mutedTypes) setMuted(prefsQ.data.mutedTypes)
  }, [prefsQ.data])

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications-page'] })
      void qc.invalidateQueries({ queryKey: ['notif-count'] })
      void qc.invalidateQueries({ queryKey: ['notifs'] })
    },
  })

  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      message.success(t('notifications.allMarkedAsRead'))
      void qc.invalidateQueries({ queryKey: ['notifications-page'] })
      void qc.invalidateQueries({ queryKey: ['notif-count'] })
      void qc.invalidateQueries({ queryKey: ['notifs'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('common.notificationCenter')}</Typography.Title>
      <Card
        size="small"
        className="crm-panel-fixed crm-block-lg"
        title={
          <Space>
            <Segmented
              size="small"
              value={tab}
              onChange={(v) => {
                setTab(v as typeof tab)
                setPage(1)
              }}
              options={[
                { label: t('common.all'), value: 'all' },
                { label: t('notifications.unread'), value: 'unread' },
                { label: t('nav.approvals'), value: 'approval' },
                { label: t('notifications.reminders'), value: 'remind' },
              ]}
            />
            <span className="crm-muted">{t('common.total2', { v: data?.total ?? 0 })}</span>
          </Space>
        }
        extra={
          <Space>
            <Button size="small" onClick={() => setPrefOpen(true)}>{t('notifications.notificationPreferences')}</Button>
            <Button size="small" onClick={() => readAll.mutate()} loading={readAll.isPending}>{t('common.markAllRead')}</Button>
          </Space>
        }
      >
        <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(
            [
              ['', t('notifications.allTypes')],
              ['APPROVAL', t('nav.approvals')],
              ['CONTRACT', t('nav.contracts')],
              ['QUOTE', t('nav.quotes')],
              ['POOL', t('notifications.pool')],
              ['API', t('notifications.systemAlerts')],
              ['LEAD', t('nav.leads')],
            ] as const
          ).map(([v, label]) => (
            <Tag.CheckableTag
              key={v || 'all'}
              checked={typeFilter === v}
              onChange={(c) => {
                setTypeFilter(c ? v : '')
                setPage(1)
              }}
            >
              {label}
            </Tag.CheckableTag>
          ))}
        </div>
        {isLoading ? (
          <div className="crm-muted">{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('notifications.noNotifications')} />
        ) : (
          <div>
            {rows.map((n) => {
              const meta = TYPE_META[n.type] ?? fallbackType(n)
              const to = linkOf(n)
              return (
                <div
                  key={n.id}
                  className="crm-me-row"
                  style={{ cursor: to ? 'pointer' : 'default', alignItems: 'flex-start' }}
                  onClick={() => {
                    if (!n.isRead) markRead.mutate(n.id)
                    if (to) nav(to)
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Space size={6} wrap>
                      {!n.isRead && <span className="crm-notif-dot" />}
                      <Tag color={meta.color} bordered={false}>
                        {meta.icon} {meta.label}
                      </Tag>
                      <b style={{ fontSize: 13 }}>{n.title}</b>
                    </Space>
                    {n.body ? (
                      <div className="crm-muted" style={{ marginTop: 4 }}>
                        {n.body}
                      </div>
                    ) : null}
                    <div className="crm-muted" style={{ marginTop: 4, fontSize: 11 }}>
                      {new Date(n.createdAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  {to ? (
                    <Link to={to} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
                      {textOf(n)} <RightOutlined style={{ fontSize: 10 }} />
                    </Link>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>
      {(data?.total ?? 0) > 20 && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Pagination
            current={page}
            pageSize={20}
            total={data?.total ?? 0}
            onChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}
      <div className="crm-muted" style={{ marginTop: 12 }}>
        <PhoneOutlined />{' '}{t('notifications.onMobileOpenIt')}</div>

      <Modal
        title={t('notifications.notificationPreferences')}
        open={prefOpen}
        onCancel={() => setPrefOpen(false)}
        onOk={() => savePrefsM.mutate()}
        confirmLoading={savePrefsM.isPending}
        okText={t('common.save')}
      >
        <div style={{ marginBottom: 8 }}>{t('notifications.selectTypesToMute')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(
            [
              ['APPROVAL', t('nav.approvals')],
              ['CONTRACT_EXPIRY', t('notifications.contractExpiry')],
              ['POOL_RECYCLE', t('notifications.poolRecycling')],
              ['API_USAGE_ALERT', t('notifications.apiAlerts')],
              ['QUOTE_ACCEPTED', t('notifications.quoteConfirmed')],
              ['LEAD_ASSIGNED', t('notifications.leadAssigned')],
            ] as const
          ).map(([v, label]) => (
            <Tag.CheckableTag
              key={v}
              checked={muted.includes(v)}
              onChange={(c) => {
                setMuted((prev) => (c ? [...prev, v] : prev.filter((x) => x !== v)))
              }}
            >
              {label}
            </Tag.CheckableTag>
          ))}
        </div>
        <div className="crm-muted" style={{ marginTop: 12, fontSize: 12 }}>{t('notifications.mutedNotificationsAreStill')}</div>
      </Modal>
    </div>
  )
}
