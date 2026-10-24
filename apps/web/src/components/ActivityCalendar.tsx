import { useQuery } from '@tanstack/react-query'
import { Badge, Card, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

interface Act {
  id: string
  type: string
  subject: string
  status: string
  dueAt: string | null
  startAt: string | null
}

/** 活动月历视图：按 dueAt/startAt 落格 */
export function ActivityCalendar() {
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const from = month.format('YYYY-MM-DD')
  const to = month.endOf('month').format('YYYY-MM-DD')

  const q = useQuery({
    queryKey: ['activities-cal', from, to],
    queryFn: () =>
      api<{ items: Act[] }>('/activities?pageSize=100&from=' + from + 'T00:00:00&to=' + to + 'T23:59:59'),
    retry: false,
  })

  const cells = useMemo(() => {
    const start = month.startOf('month')
    const daysInMonth = month.daysInMonth()
    const leading = start.day() // 0=Sun
    const list: (dayjs.Dayjs | null)[] = []
    for (let i = 0; i < leading; i++) list.push(null)
    for (let d = 1; d <= daysInMonth; d++) list.push(month.date(d))
    while (list.length % 7 !== 0) list.push(null)
    return list
  }, [month])

  const byDay = useMemo(() => {
    const map = new Map<string, Act[]>()
    for (const a of q.data?.items ?? []) {
      const dt = a.dueAt || a.startAt
      if (!dt) continue
      const key = dayjs(dt).format('YYYY-MM-DD')
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    return map
  }, [q.data])

  const todayKey = dayjs().format('YYYY-MM-DD')
  const weekdays = [t('common.sun'), t('common.mon'), t('common.tue'), t('common.wed'), t('common.thu'), t('common.fri'), t('common.sat')]

  return (
    <Card
      size="small"
      title={t('cmp.activityCalendar.activityCalendar')}
      extra={
        <span>
          <a
            onClick={() => setMonth(month.subtract(1, 'month'))}
            style={{ marginRight: 8 }}
          >
            ‹
          </a>
          {month.format(t('cmp.activityCalendar.mmmmYyyy'))}
          <a onClick={() => setMonth(month.add(1, 'month'))} style={{ marginLeft: 8 }}>
            ›
          </a>
        </span>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {weekdays.map((w) => (
          <div key={w} style={{ textAlign: 'center', color: 'var(--crm-muted-2)', fontSize: 12 }}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const key = d.format('YYYY-MM-DD')
          const items = byDay.get(key) ?? []
          const isToday = key === todayKey
          return (
            <div
              key={key}
              style={{
                minHeight: 64,
                border: isToday ? '1.5px solid var(--crm-accent)' : '1px solid var(--crm-border)',
                borderRadius: 6,
                padding: 4,
                background: isToday ? 'var(--crm-brand-50)' : 'var(--crm-card)',
              }}
            >
              <Typography.Text style={{ fontSize: 11 }}>{d.date()}</Typography.Text>
              <div>
                {items.slice(0, 3).map((a) => (
                  <Tag
                    key={a.id}
                    color={a.status === 'DONE' ? 'green' : a.status === 'PLANNED' ? 'blue' : 'default'}
                    style={{ margin: '1px 0', fontSize: 10, padding: '0 4px', maxWidth: '100%' }}
                  >
                    {a.subject.slice(0, 6)}
                  </Tag>
                ))}
                {items.length > 3 && (
                  <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                    +{items.length - 3}
                  </Typography.Text>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        <Badge status="processing" text={t('cmp.activityCalendar.planned')} />{' '}
        <Badge status="success" text={t('common.completed')} />{' '}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('common.total2', { v: q.data?.items?.length ?? 0 })}</Typography.Text>
      </div>
    </Card>
  )
}
