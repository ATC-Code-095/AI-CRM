import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Row, Tag } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { api } from '../../api/client'
import { t } from '../../i18n'

export default function ActivityReports() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const eff = useQuery({
    queryKey: ['followup-efficiency'],
    queryFn: () =>
      api<{ name: string; activities: number; converted: number; rate: string }[]>(
        '/reports/followup-efficiency',
      ),
    retry: false,
  })
  const touchpoints = useQuery({
    queryKey: ['touchpoint-calendar'],
    queryFn: () =>
      api<{
        month: string
        days: { date: string; count: number; events: { type: string; title: string }[] }[]
      }>('/reports/touchpoint-calendar'),
    retry: false,
  })
  const meetingActions = useQuery({
    queryKey: ['meeting-actions'],
    queryFn: () =>
      api<{
        total: number
        openCount: number
        items: { meetingId: string; index: number; text: string; owner: string; done: boolean; meetingTitle: string }[]
      }>('/meeting-actions'),
    retry: false,
  })
  const revisit = useQuery({
    queryKey: ['revisit-plan'],
    queryFn: () =>
      api<{ total: number; items: { id: string; name: string; level: string }[] }>(
        '/reports/revisit-plan?days=30',
      ),
    retry: false,
  })
  const care = useQuery({
    queryKey: ['care-reminders'],
    queryFn: () =>
      api<{ birthdays: { id: string; name: string; mobile: string | null }[] }>(
        '/reports/care-reminders',
      ),
    retry: false,
  })
  const outreachM = useMutation({
    mutationFn: () =>
      api('/reports/outreach', {
        method: 'POST',
        body: JSON.stringify({ days: 30, template: '客户成功关怀回访' }),
      }),
    onSuccess: (r: unknown) => {
      message.success(t('reports.createdOutreachTasks', { v: (r as { created?: number })?.created ?? 0 }))
      void qc.invalidateQueries({ queryKey: ['revisit-plan'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col xs={24}>
          <Card size="small" title={t('reports.followUpEfficiency30')}>
            <AutoFitTable
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={eff.data ?? []}
              columns={[
                { title: t('common.sales'), dataIndex: 'name' },
                { title: t('nav.activities'), dataIndex: 'activities' },
                { title: t('common.convert'), dataIndex: 'converted' },
                { title: t('reports.conversion2'), dataIndex: 'rate' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.suggestedCareVisits')}
            extra={
              <Button
                size="small"
                type="primary"
                loading={outreachM.isPending}
                onClick={() => outreachM.mutate()}
              >{t('common.batchOutreach')}</Button>
            }
          >
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={revisit.data?.items ?? []}
              columns={[
                { title: t('nav.accounts'), dataIndex: 'name' },
                { title: t('audit.field.level'), dataIndex: 'level' },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <Card
        size="small"
        title={t('reports.customerTouchpointCalendar', { v: touchpoints.data?.month ?? '' })}
        style={{ marginTop: 12 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(touchpoints.data?.days ?? []).map((d) => (
            <div
              key={d.date}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                padding: 8,
                minWidth: 130,
                background: d.count >= 3 ? '#f6ffed' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <b style={{ fontSize: 12 }}>{d.date.slice(5)}</b>
                <Tag color="blue">{d.count}</Tag>
              </div>
              {d.events.slice(0, 2).map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: '#646A73' }}>
                  {e.title.slice(0, 10)}
                </div>
              ))}
            </div>
          ))}
          {!touchpoints.data?.days?.length && (
            <span style={{ color: '#646A73' }}>{t('reports.noTouchpointsThisMonth')}</span>
          )}
        </div>
      </Card>
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24}>
          <Card
            size="small"
            title={t('reports.meetingActionTracking')}
            extra={
              <Tag color={meetingActions.data?.openCount ? 'orange' : 'green'}>{t('reports.open', { v: meetingActions.data?.openCount ?? 0 })}
              </Tag>
            }
          >
            <AutoFitTable
              rowKey={(r) => `${(r as { meetingId: string }).meetingId}-${(r as { index: number }).index}`}
              size="small"
              pagination={{ pageSize: 6 }}
              dataSource={(meetingActions.data?.items ?? []) as unknown as Record<string, unknown>[]}
              columns={[
                {
                  title: t('audit.field.status'),
                  dataIndex: 'done',
                  render: (v: boolean) => (v ? <Tag color="green">{t('common.done')}</Tag> : <Tag color="orange">{t('nav.todos')}</Tag>),
                },
                { title: t('common.actions2'), dataIndex: 'text' },
                { title: t('audit.field.ownerId'), dataIndex: 'owner' },
                {
                  title: t('common.actions'),
                  render: (_: unknown, r: Record<string, unknown>) => (
                    <Button
                      size="small"
                      onClick={() => {
                        void api('/meeting-actions/toggle', {
                          method: 'POST',
                          body: JSON.stringify({ meetingId: r.meetingId, index: r.index }),
                        }).then(() => void qc.invalidateQueries({ queryKey: ['meeting-actions'] }))
                      }}
                    >{t('common.toggle')}</Button>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card size="small" title={t('reports.customerCareBirthdaysThis')}>
            <AutoFitTable
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={care.data?.birthdays ?? []}
              columns={[
                { title: t('nav.accounts'), dataIndex: 'name' },
                { title: t('common.mobile'), dataIndex: 'mobile' },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
