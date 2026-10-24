import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, Empty, Segmented, Space, Tag, Tooltip, Typography } from 'antd'
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LeftOutlined,
  PhoneOutlined,
  PlusOutlined,
  RightOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { useQuickCreate } from '../../utils/quickCreate'
import { t } from '../../i18n'

interface Act {
  id: string
  type: string
  subject: string
  status: string
  dueAt: string | null
  startAt: string | null
  entityType?: string | null
  entityId?: string | null
}

interface Meeting {
  id: string
  title: string
  entityType?: string | null
  entityId?: string | null
  heldAt?: string | null
  attendees?: string | null
}

type CalItem = {
  id: string
  kind: 'activity' | 'meeting'
  title: string
  type: string
  status: string
  at: string
  entityType?: string | null
  entityId?: string | null
  extra?: string | null
}

const ACT_TYPE: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  CALL: { label: t('enum.activity.type.CALL'), icon: <PhoneOutlined />, color: 'blue' },
  VISIT: { label: t('enum.activity.type.VISIT'), icon: <TeamOutlined />, color: 'purple' },
  EMAIL: { label: t('enum.activity.type.EMAIL'), icon: <ClockCircleOutlined />, color: 'cyan' },
  TASK: { label: t('enum.activity.type.TASK'), icon: <CheckCircleOutlined />, color: 'gold' },
  NOTE: { label: t('enum.activity.type.NOTE'), icon: <CalendarOutlined />, color: 'default' },
  MEETING: { label: t('calendar.meeting'), icon: <TeamOutlined />, color: 'geekblue' },
}

function entityLink(entityType?: string | null, entityId?: string | null): string | null {
  const t = (entityType ?? '').toUpperCase()
  if (!entityId) return null
  if (t === 'ACCOUNT') return `/accounts/${entityId}`
  if (t === 'LEAD') return `/leads/${entityId}`
  if (t === 'OPPORTUNITY') return `/opportunities/${entityId}`
  return null
}

/**
 * 日历（月视图 + 议程）——对标 Salesforce 活动日历 / HubSpot 任务日历
 * 聚合「跟进活动」与「会议纪要」，按天落格，点某天看当天议程。
 */
export default function CalendarPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'))
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [kindFilter, setKindFilter] = useState<'all' | 'activity' | 'meeting'>('all')
  const [selected, setSelected] = useState<string>(() => dayjs().format('YYYY-MM-DD'))

  useQuickCreate('activity', () => nav('/activities'))

  const from = month.startOf('month').format('YYYY-MM-DD')
  const to = month.endOf('month').format('YYYY-MM-DD')

  const actQ = useQuery({
    queryKey: ['calendar-activities', from, to],
    queryFn: () =>
      api<{ items: Act[] }>(
        `/activities?pageSize=200&from=${from}T00:00:00&to=${to}T23:59:59`,
      ),
    retry: false,
  })

  const meetQ = useQuery({
    queryKey: ['calendar-meetings'],
    queryFn: () => api<{ items: Meeting[] }>('/meetings'),
    retry: false,
  })

  const items = useMemo<CalItem[]>(() => {
    const acts: CalItem[] = (actQ.data?.items ?? []).flatMap((a) => {
      const at = a.dueAt ?? a.startAt
      if (!at) return []
      return [
        {
          id: a.id,
          kind: 'activity' as const,
          title: a.subject,
          type: a.type,
          status: a.status,
          at,
          entityType: a.entityType,
          entityId: a.entityId,
        },
      ]
    })

    const meets: CalItem[] = (meetQ.data?.items ?? [])
      .filter((m) => m.heldAt && dayjs(m.heldAt).isSame(month, 'month'))
      .map((m) => ({
        id: m.id,
        kind: 'meeting' as const,
        title: m.title,
        type: 'MEETING',
        status: 'DONE',
        at: String(m.heldAt),
        entityType: m.entityType,
        entityId: m.entityId,
        extra: m.attendees ?? null,
      }))

    return [...acts, ...meets]
      .filter((i) => (kindFilter === 'all' ? true : i.kind === kindFilter))
      .sort((a, b) => a.at.localeCompare(b.at))
  }, [actQ.data, meetQ.data, kindFilter, month])

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>()
    for (const i of items) {
      const key = dayjs(i.at).format('YYYY-MM-DD')
      const arr = map.get(key) ?? []
      arr.push(i)
      map.set(key, arr)
    }
    return map
  }, [items])

  const cells = useMemo(() => {
    const start = month.startOf('month')
    const leading = start.day()
    const list: (Dayjs | null)[] = []
    for (let i = 0; i < leading; i++) list.push(null)
    for (let d = 1; d <= month.daysInMonth(); d++) list.push(month.date(d))
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [month])

  const todayKey = dayjs().format('YYYY-MM-DD')
  const selectedItems = byDay.get(selected) ?? []
  const weekdays = [t('common.sun'), t('common.mon'), t('common.tue'), t('common.wed'), t('common.thu'), t('common.fri'), t('common.sat')]
  const loading = actQ.isLoading || meetQ.isLoading

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['calendar-activities'] })
    void qc.invalidateQueries({ queryKey: ['calendar-meetings'] })
  }

  const itemChip = (i: CalItem) => {
    const meta = ACT_TYPE[i.type] ?? ACT_TYPE.NOTE
    const done = i.status === 'DONE'
    return (
      <Tooltip key={i.id} title={`${meta.label} · ${i.title}`}>
        <Link
          to={entityLink(i.entityType, i.entityId) ?? '/activities'}
          className={`crm-cal-chip${done ? ' done' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="crm-cal-chip-time">{dayjs(i.at).format('HH:mm')}</span>
          <span className="crm-cal-chip-text">{i.title}</span>
        </Link>
      </Tooltip>
    )
  }

  return (
    <div>
      <div className="crm-cal-toolbar">
        <Space size={8} wrap>
          <Button size="small" icon={<LeftOutlined />} onClick={() => setMonth(month.subtract(1, 'month'))} />
          <Button size="small" onClick={() => setMonth(dayjs().startOf('month'))}>{t('calendar.today')}</Button>
          <Button size="small" icon={<RightOutlined />} onClick={() => setMonth(month.add(1, 'month'))} />
          <Typography.Text strong style={{ fontSize: 15 }}>
            {month.format(t('calendar.mmmmYyyy'))}
          </Typography.Text>
          <Tag color="blue">{t('calendar.items', { length: items.length })}</Tag>
        </Space>
        <Space size={8} wrap>
          <Segmented
            size="small"
            value={kindFilter}
            onChange={(v) => setKindFilter(v as typeof kindFilter)}
            options={[
              { label: t('common.all'), value: 'all' },
              { label: t('nav.activities'), value: 'activity' },
              { label: t('calendar.meeting'), value: 'meeting' },
            ]}
          />
          <Segmented
            size="small"
            value={view}
            onChange={(v) => setView(v as typeof view)}
            options={[
              { label: t('calendar.monthView'), value: 'month' },
              { label: t('calendar.agenda'), value: 'agenda' },
            ]}
          />
          <Button size="small" icon={<PlusOutlined />} type="primary" onClick={() => nav('/activities')}>{t('common.newFollowUp')}</Button>
        </Space>
      </div>

      <div className="crm-cal-layout">
        <Card
          size="small"
          className="crm-cal-month"
          title={view === 'month' ? t('calendar.monthView') : t('calendar.thisMonthSAgenda')}
          extra={
            <Button size="small" type="text" onClick={refresh} loading={loading}>{t('common.refresh')}</Button>
          }
        >
          {view === 'month' ? (
            <div className="crm-cal-grid">
              {weekdays.map((w) => (
                <div key={w} className="crm-cal-weekday">
                  {w}
                </div>
              ))}
              {cells.map((d, idx) => {
                if (!d) return <div key={`e${idx}`} className="crm-cal-cell empty" />
                const key = d.format('YYYY-MM-DD')
                const list = byDay.get(key) ?? []
                const isToday = key === todayKey
                const isWeekend = d.day() === 0 || d.day() === 6
                return (
                  <div
                    key={key}
                    className={`crm-cal-cell${isToday ? ' today' : ''}${isWeekend ? ' weekend' : ''}${
                      selected === key ? ' selected' : ''
                    }`}
                    onClick={() => setSelected(key)}
                  >
                    <div className="crm-cal-date">
                      <span>{d.date()}</span>
                      {list.length > 0 && <span className="crm-cal-count">{list.length}</span>}
                    </div>
                    <div className="crm-cal-chips">{list.slice(0, 3).map(itemChip)}</div>
                    {list.length > 3 && <div className="crm-cal-more">+{list.length - 3}</div>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div>
              {Array.from(byDay.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([day, list]) => (
                  <div key={day} className="crm-cal-agenda-day">
                    <div className="crm-cal-agenda-date">
                      <b>{dayjs(day).format('MM-DD')}</b>
                      <span className="crm-muted">{' '}{t('calendar.text', { v: weekdays[dayjs(day).day()] })}</span>
                      <Tag bordered={false}>{list.length}</Tag>
                    </div>
                    {list.map((i) => {
                      const meta = ACT_TYPE[i.type] ?? ACT_TYPE.NOTE
                      const link = entityLink(i.entityType, i.entityId)
                      return (
                        <div key={i.id} className="crm-cal-agenda-row">
                          <span className="crm-cal-chip-time">{dayjs(i.at).format('HH:mm')}</span>
                          <Tag color={meta.color} bordered={false}>
                            {meta.label}
                          </Tag>
                          <span style={{ flex: 1, minWidth: 0 }}>{i.title}</span>
                          {i.status === 'DONE' ? <Tag color="green">{t('common.completed')}</Tag> : null}
                          {link ? <Link to={link}>{t('common.opens')}</Link> : null}
                        </div>
                      )
                    })}
                  </div>
                ))}
              {byDay.size === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('calendar.nothingScheduledThisMonth')} />}
            </div>
          )}
        </Card>

        <Card
          size="small"
          className="crm-cal-agenda"
          title={t('calendar.schedule', { v: dayjs(selected).format(t('calendar.mmmD')) })}
          extra={
            <Link to="/activities">
              <Button size="small" type="text">{t('common.allFollowUps')}</Button>
            </Link>
          }
        >
          {selectedItems.length ? (
            selectedItems.map((i) => {
              const meta = ACT_TYPE[i.type] ?? ACT_TYPE.NOTE
              const link = entityLink(i.entityType, i.entityId)
              return (
                <div key={i.id} className="crm-me-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Space size={6} wrap>
                      <Tag color={meta.color} bordered={false}>
                        {meta.icon} {meta.label}
                      </Tag>
                      <b style={{ fontSize: 13 }}>{i.title}</b>
                      {i.status === 'DONE' ? <Tag color="green">{t('common.completed')}</Tag> : null}
                    </Space>
                    <div className="crm-muted" style={{ marginTop: 4, fontSize: 12 }}>
                      {dayjs(i.at).format('YYYY-MM-DD HH:mm')}
                      {i.extra ? ` · ${i.extra}` : ''}
                    </div>
                  </div>
                  {link ? <Link to={link}>{t('common.opens')}</Link> : null}
                </div>
              )
            })
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('calendar.nothingScheduledThisDay')}>
              <Button size="small" type="primary" onClick={() => nav('/activities')}>{t('common.newFollowUp')}</Button>
            </Empty>
          )}
        </Card>
      </div>
    </div>
  )
}
