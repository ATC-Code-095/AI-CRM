import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Drawer, Empty, List, Space, Tag } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, isLoggedIn } from '../api/client'

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

export function NotificationBell() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const authed = isLoggedIn()
  const countQ = useQuery({
    queryKey: ['notif-count'],
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 30_000,
    enabled: authed,
    retry: false,
  })
  const listQ = useQuery({
    queryKey: ['notifs'],
    queryFn: () =>
      api<{ items: Notification[]; total: number }>('/notifications?pageSize=20'),
    enabled: open && authed,
    retry: false,
  })

  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notif-count'] })
      void qc.invalidateQueries({ queryKey: ['notifs'] })
    },
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notif-count'] })
      void qc.invalidateQueries({ queryKey: ['notifs'] })
    },
  })

  return (
    <>
      <Badge count={countQ.data?.count ?? 0} size="small">
        <Button size="small" onClick={() => setOpen(true)}>{t('common.notifications')}</Button>
      </Badge>
      <Drawer
        title={t('common.notifications')}
        open={open}
        onClose={() => setOpen(false)}
        width={380}
        extra={
          <Space size={6}>
            <Button size="small" onClick={() => readAll.mutate()}>{t('common.markAllRead')}</Button>
            <Link to="/notifications" onClick={() => setOpen(false)}>
              <Button size="small" type="primary">{t('cmp.notificationBell.viewAll')}</Button>
            </Link>
          </Space>
        }
      >
        {(listQ.data?.items ?? []).length === 0 ? (
          <Empty description={t('common.empty')} />
        ) : (
          <List
            dataSource={listQ.data?.items ?? []}
            renderItem={(n) => (
              <List.Item
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id)
                }}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {!n.isRead && <Tag color="blue">{t('cmp.notificationBell.new')}</Tag>}
                      {n.title}
                    </Space>
                  }
                  description={
                    <>
                      {n.body}
                      <div>
                        {n.entityType === 'QUOTE' || n.type?.startsWith('APPROVAL') ? (
                          <Link
                            to="/approvals"
                            onClick={() => {
                              if (!n.isRead) markRead.mutate(n.id)
                              setOpen(false)
                            }}
                          >{t('common.review')}</Link>
                        ) : n.entityType === 'OPPORTUNITY' ? (
                          <Link
                            to={`/opportunities/${n.entityId}`}
                            onClick={() => {
                              if (!n.isRead) markRead.mutate(n.id)
                              setOpen(false)
                            }}
                          >{t('common.openDeal')}</Link>
                        ) : n.entityType === 'TICKET' ? (
                          <Link
                            to="/tickets"
                            onClick={() => {
                              if (!n.isRead) markRead.mutate(n.id)
                              setOpen(false)
                            }}
                          >{t('common.openTicket')}</Link>
                        ) : null}
                      </div>
                    </>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </>
  )
}
