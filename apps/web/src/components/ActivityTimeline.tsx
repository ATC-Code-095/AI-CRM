import { useQuery } from '@tanstack/react-query'
import { Card, Empty, Tag, Timeline } from 'antd'
import dayjs from 'dayjs'
import { api } from '../api/client'
import { t } from '../i18n'

type Event = { at: string; type: string; title: string; detail: string }

const TYPE_COLOR: Record<string, string> = {
  ACTIVITY: 'blue',
  OPPORTUNITY: 'purple',
  CONTRACT: 'green',
  PAYMENT: 'gold',
  QUOTE: 'cyan',
  TICKET: 'orange',
  LEAD: 'geekblue',
}

/** 互动时间线（对标 Salesforce Activity Timeline / HubSpot） */
export function ActivityTimeline({
  entityType,
  entityId,
  title = t('common.interactionTimeline'),
  limit = 12,
}: {
  entityType: string
  entityId: string
  title?: string
  limit?: number
}) {
  const q = useQuery({
    queryKey: ['activity-timeline', entityType, entityId],
    queryFn: () =>
      entityType === 'ACCOUNT'
        ? api<{ events: Event[] }>(`/accounts/${entityId}/journey`)
        : api<{ events: Event[] }>(`/reports/entity-timeline/${entityType}/${entityId}`),
    retry: false,
  })

  const events = (q.data?.events ?? []).slice(0, limit)

  return (
    <Card size="small" title={title} style={{ marginBottom: 12 }}>
      {events.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cmp.activityTimeline.noInteractions')} />
      ) : (
        <Timeline
          items={events.map((e) => ({
            color: TYPE_COLOR[e.type] ?? 'gray',
            children: (
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{e.title}</b>
                  <Tag color={TYPE_COLOR[e.type] ?? 'default'} style={{ marginRight: 0 }}>
                    {e.type}
                  </Tag>
                  <span style={{ color: '#8b919a', fontSize: 11 }}>
                    {dayjs(e.at).format('MM-DD HH:mm')}
                  </span>
                </div>
                {e.detail && (
                  <div style={{ color: '#646A73', fontSize: 12, marginTop: 2 }}>{e.detail}</div>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Card>
  )
}
