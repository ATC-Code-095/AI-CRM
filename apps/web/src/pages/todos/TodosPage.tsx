import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Col,
  List,
  Row,
  Select,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import dayjs from 'dayjs'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { t } from '../../i18n'

type TodoItem = {
  id: string
  subject: string
  type: string
  dueAt: string | null
  status: string
}

/** 待办中心（对标 Salesforce / HubSpot Tasks Inbox） */
export default function TodosPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [tab, setTab] = useState('today')
  const [prio, setPrio] = useState<Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>>(() => {
    try {
      return JSON.parse(localStorage.getItem('crm.todo.prio') ?? '{}') as Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>
    } catch {
      return {}
    }
  })
  const setP = (id: string, v: 'HIGH' | 'MEDIUM' | 'LOW') => {
    const next = { ...prio, [id]: v }
    setPrio(next)
    try {
      localStorage.setItem('crm.todo.prio', JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      api<{ dueToday: TodoItem[]; openLeads: number; openOppCount: number }>('/reports/dashboard'),
    retry: false,
  })
  const remind = useQuery({
    queryKey: ['smart-reminders'],
    queryFn: () =>
      api<{
        total: number
        overdueLeads: { id: string; name: string }[]
        expiringContracts: { id: string; contractNo: string }[]
        slaTickets: { id: string; title: string }[]
      }>('/reports/smart-reminders'),
    retry: false,
  })
  const approvals = useQuery({
    queryKey: ['approvals', 'todo'],
    queryFn: () =>
      api<{ items: { id: string; entityType: string; entityId: string }[]; total: number }>(
        '/approvals/todo?pageSize=10',
      ),
    retry: false,
  })
  const acts = useQuery({
    queryKey: ['activities', 'todo'],
    queryFn: () =>
      api<{ items: TodoItem[] }>('/activities?pageSize=30&status=PLANNED'),
    retry: false,
  })

  const [snoozed, setSnoozed] = useState<string[]>([])
  // 稍后 1 小时自动恢复
  useEffect(() => {
    if (!snoozed.length) return
    const timer = window.setTimeout(() => setSnoozed([]), 60 * 60 * 1000)
    return () => window.clearTimeout(timer)
  }, [snoozed])
  const doneM = useMutation({
    mutationFn: (id: string) =>
      api('/activities/complete', { method: 'POST', body: JSON.stringify({ id }) }),
    onSuccess: () => {
      message.success(t('common.completed'))
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
      void qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const today = dash.data?.dueToday ?? []
  const [alerted, setAlerted] = useState(false)
  const [sortOrder, setSortOrder] = useState<string[]>([])
  const dragId = useRef<string | null>(null)
  const orderedToday = sortOrder.length
    ? [...today].sort((a, b) => {
        const ia = sortOrder.indexOf(a.id)
        const ib = sortOrder.indexOf(b.id)
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
      })
    : [...today].sort((a, b) => {
        const rank = (x: TodoItem) =>
          prio[x.id] === 'HIGH' ? 0 : prio[x.id] === 'LOW' ? 2 : 1
        return rank(a) - rank(b)
      })
  const planned = (acts.data?.items ?? []).filter((a: TodoItem) => a.status === 'PLANNED')
  const overdue = planned.filter(
    (a: TodoItem) => !!a.dueAt && dayjs(a.dueAt).isBefore(dayjs(), 'day'),
  )
  // 到期提醒：进入页面时若有逾期，弹一次站内提醒
  if (!alerted && overdue.length > 0) {
    setAlerted(true)
    message.warning(t('todos.todosAreDuePlease', { length: overdue.length }))
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(t('todos.todoDueReminder'), { body: t('todos.tasksAreDue', { length: overdue.length }) })
      } else if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission()
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <ErpListShell
        program="mttdo0001"
        title={t('common.todoCenter')}
        subtitle={t('todos.collaborationTasksRemindersApprovals')}
        onRefresh={() => {
          void qc.invalidateQueries({ queryKey: ['dashboard'] })
          void qc.invalidateQueries({ queryKey: ['smart-reminders'] })
          void qc.invalidateQueries({ queryKey: ['approvals'] })
          void qc.invalidateQueries({ queryKey: ['activities'] })
        }}
      >
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}>
            <Card size="small" className="crm-panel-fixed crm-panel-sm">
              <Statistic title={t('todos.todaySTodos')} value={today.length} valueStyle={{ color: '#2b5fd9' }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" className="crm-panel-fixed crm-panel-sm">
              <Statistic title={t('todos.overdueTasks')} value={overdue.length} valueStyle={{ color: '#e11d48' }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" className="crm-panel-fixed crm-panel-sm">
              <Statistic title={t('enum.quote.status.SUBMITTED')} value={approvals.data?.total ?? 0} valueStyle={{ color: '#d97706' }} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" className="crm-panel-fixed crm-panel-sm">
              <Statistic title={t('common.smartAlerts')} value={remind.data?.total ?? 0} />
            </Card>
          </Col>
        </Row>

        <Card size="small">
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'today',
                label: t('todos.today', { length: today.length }),
                children: (
                  <List
                    dataSource={orderedToday.filter((x) => !snoozed.includes(x.id))}
                    locale={{ emptyText: t('todos.nothingDueToday') }}
                    renderItem={(a: TodoItem) => (
                      <List.Item
                        draggable
                        onDragStart={() => {
                          dragId.current = a.id
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const from = dragId.current
                          if (!from || from === a.id) return
                          const ids = orderedToday.map((x) => x.id)
                          const fi = ids.indexOf(from)
                          const ti = ids.indexOf(a.id)
                          ids.splice(ti, 0, ids.splice(fi, 1)[0])
                          setSortOrder(ids)
                          dragId.current = null
                        }}
                        style={{ cursor: 'grab', opacity: 1 }}
                        actions={[
                          <Button
                            key="done"
                            size="small"
                            type="primary"
                            onClick={() => doneM.mutate(a.id)}
                          >{t('common.done')}</Button>,
                          <Button
                            key="snooze"
                            size="small"
                            onClick={() => {
                              setSnoozed((s) => [...s, a.id])
                              message.info(t('todos.snoozed1Hour'))
                            }}
                          >{t('todos.later')}</Button>,
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
                ),
              },
              {
                key: 'planned',
                label: t('todos.planned', { length: planned.length }),
                children: (
                  <List
                    dataSource={planned.slice(0, 20)}
                    locale={{ emptyText: t('todos.noPlannedTasks') }}
                    renderItem={(a: TodoItem) => (
                      <List.Item
                        actions={[
                          <Button
                            key="done"
                            size="small"
                            onClick={() => doneM.mutate(a.id)}
                          >{t('common.done')}</Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={a.subject}
                          description={
                            <Space>
                              <Tag>{a.type}</Tag>
                              <Tag color={a.dueAt && dayjs(a.dueAt).isBefore(dayjs()) ? 'red' : 'blue'}>
                                {a.dueAt ? dayjs(a.dueAt).format('MM-DD HH:mm') : t('todos.unscheduled')}
                              </Tag>
                              {a.dueAt && dayjs(a.dueAt).isBefore(dayjs().add(1, 'day')) && (
                                <Tag color="orange">{t('todos.urgent')}</Tag>
                              )}
                              <Select
                                size="small"
                                style={{ width: 90 }}
                                value={prio[a.id] ?? 'MEDIUM'}
                                options={[
                                  { value: 'HIGH', label: t('todos.highPriority') },
                                  { value: 'MEDIUM', label: t('common.medium2') },
                                  { value: 'LOW', label: t('common.low') },
                                ]}
                                onChange={(v: 'HIGH' | 'MEDIUM' | 'LOW') => setP(a.id, v)}
                              />
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ),
              },
              {
                key: 'approvals',
                label: t('todos.pendingApproval', { v: approvals.data?.total ?? 0 }),
                children: (
                  <div>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>{t('todos.goToApprovalCenter')}{' '}<Link to="/approvals">{t('common.approvalCenter')}</Link>
                    </Typography.Paragraph>
                    <List
                      dataSource={(approvals.data?.items ?? []).slice(0, 10)}
                      locale={{ emptyText: t('common.noPendingApprovals') }}
                      renderItem={(a: { id: string; entityType: string; entityId: string }) => (
                        <List.Item>
                          <List.Item.Meta
                            title={`${a.entityType} · ${a.entityId.slice(0, 8)}`}
                            description={t('todos.awaitingYourApproval')}
                          />
                        </List.Item>
                      )}
                    />
                  </div>
                ),
              },
              {
                key: 'remind',
                label: t('todos.reminders', { v: remind.data?.total ?? 0 }),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Tag color="red">{t('common.overdueLeads', { v: remind.data?.overdueLeads?.length ?? 0 })}</Tag>
                      <Tag color="orange">{t('common.contractsExpiring', { v: remind.data?.expiringContracts?.length ?? 0 })}
                      </Tag>
                      <Tag color="blue">{t('common.ticketAlerts', { v: remind.data?.slaTickets?.length ?? 0 })}</Tag>
                    </div>
                    <Link to="/reports/risk">{t('todos.viewRiskQualityReports')}</Link>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </ErpListShell>
    </div>
  )
}
