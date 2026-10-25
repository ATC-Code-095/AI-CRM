import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useQuickCreate } from '../../utils/quickCreate'
import { App, Alert, Button, Card, Form, Input, List, Modal, Segmented, Select, Space, Tag, Typography } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { getMobileBridge } from '@zhixiao-crm/mobile-bridge'
import { EntityPicker } from '../../components/EntityPicker'
import { ActivityCalendar } from '../../components/ActivityCalendar'
import { GaugeRing } from '../../components/SimpleCharts'
import { isOnline, loadDrafts, onNetworkChange, saveDraft, syncDrafts, getLastSync } from '../../utils/offlineDraft'
import { t } from '../../i18n'

function VisitRoutePanel() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [planDate, setPlanDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [planRows, setPlanRows] = useState<Array<{ accountId: string; subject: string; time: string }>>([
    { accountId: '', subject: '', time: '09:30' },
  ])
  const planM = useMutation({
    mutationFn: () =>
      api('/activities/visit-plan', {
        method: 'POST',
        body: JSON.stringify({
          date: planDate,
          items: planRows.filter((r) => r.accountId || r.subject),
        }),
      }),
    onSuccess: (r: unknown) => {
      const created = (r as { created?: number })?.created ?? 0
      message.success(t('activities.createdVisitPlans', { created }))
      void qc.invalidateQueries({ queryKey: ['visit-route'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const routeQ = useQuery({
    queryKey: ['visit-route'],
    queryFn: () =>
      api<{
        date: string
        total: number
        checkedIn: number
        regions: string[]
        items: {
          seq: number
          id: string
          subject: string
          status: string
          time: string | null
          location: string
          region: string
          accountName: string
          checkedIn: boolean
          lat: number | null
          lng: number | null
        }[]
      }>('/activities/visit-route'),
    retry: false,
  })
  const accsQ = useQuery({
    queryKey: ['accounts-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=50'),
    retry: false,
  })
  const points = (routeQ.data?.items ?? []).filter(
    (p) => p.lat != null && p.lng != null && (p.lat !== 0 || p.lng !== 0),
  )
  // 简易签到地图：归一化坐标绘制
  const lats = points.map((p) => p.lat!)
  const lngs = points.map((p) => p.lng!)
  const minLat = Math.min(...lats, 31)
  const maxLat = Math.max(...lats, 31.3)
  const minLng = Math.min(...lngs, 121)
  const maxLng = Math.max(...lngs, 121.6)
  return (
    <>
    <Card size="small" title={t('activities.mobileVisitPlan')} style={{ marginBottom: 12 }}>
      <Space wrap style={{ marginBottom: 8 }}>
        <Input
          type="date"
          style={{ width: 150 }}
          value={planDate}
          onChange={(e) => setPlanDate(e.target.value)}
        />
        <Button
          size="small"
          onClick={() =>
            setPlanRows([...planRows, { accountId: '', subject: '', time: '10:00' }])
          }
        >{t('activities.addRow')}</Button>
        <Button
          type="primary"
          size="small"
          loading={planM.isPending}
          onClick={() => planM.mutate()}
        >{t('activities.generateVisitPlan')}</Button>
      </Space>
      {planRows.map((row, idx) => (
        <Space key={idx} style={{ display: 'flex', marginBottom: 6 }} wrap>
          <Select
            style={{ width: 200 }}
            placeholder={t('common.selectAccount')}
            allowClear
            value={row.accountId || undefined}
            options={(accsQ.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))}
            onChange={(v) => {
              const next = [...planRows]
              next[idx] = { ...next[idx], accountId: String(v ?? '') }
              setPlanRows(next)
            }}
          />
          <Input
            style={{ width: 160 }}
            placeholder={t('activities.subjectOptional')}
            value={row.subject}
            onChange={(e) => {
              const next = [...planRows]
              next[idx] = { ...next[idx], subject: e.target.value }
              setPlanRows(next)
            }}
          />
          <Input
            style={{ width: 100 }}
            placeholder="09:30"
            value={row.time}
            onChange={(e) => {
              const next = [...planRows]
              next[idx] = { ...next[idx], time: e.target.value }
              setPlanRows(next)
            }}
          />
        </Space>
      ))}
    </Card>
    <Card
      size="small"
      title={t('activities.visitRoute', { v: routeQ.data?.date ?? '' })}
      extra={
        <Space>
          <Tag>{t('activities.stops', { v: routeQ.data?.total ?? 0 })}</Tag>
          <Tag color="green">{t('activities.checkedIn', { v: routeQ.data?.checkedIn ?? 0 })}</Tag>
          <Tag color="blue">{(routeQ.data?.regions ?? []).join(' / ') || t('activities.noRegion')}</Tag>
        </Space>
      }
    >
      {points.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#8b919a', marginBottom: 4 }}>{t('activities.checkInMapRelative')}</div>
          <svg viewBox="0 0 400 180" style={{ width: '100%', maxWidth: 520, background: '#f8fafc', borderRadius: 8 }}>
            {points.map((p) => {
              const x = 30 + ((p.lng! - minLng) / Math.max(maxLng - minLng, 0.001)) * 340
              const y = 160 - ((p.lat! - minLat) / Math.max(maxLat - minLat, 0.001)) * 140
              return (
                <g key={p.id}>
                  <circle
                    cx={x}
                    cy={y}
                    r={p.checkedIn ? 8 : 5}
                    fill={p.checkedIn ? '#22c55e' : '#60a5fa'}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                  <text x={x + 10} y={y + 4} fontSize="10" fill="#334155">
                    {p.seq}
                  </text>
                </g>
              )
            })}
          </svg>
          <div style={{ fontSize: 11, color: '#8b919a' }}>
            <Tag color="green">{t('activities.checkedIn2')}</Tag>
            <Tag color="blue">{t('activities.toVisit')}</Tag>
          </div>
        </div>
      )}
      <AutoFitTable
        rowKey="id"
        size="small"
        pagination={false}
        loading={routeQ.isLoading}
        dataSource={routeQ.data?.items ?? []}
        columns={[
          {
            title: t('activities.order'),
            dataIndex: 'seq',
            render: (v: number) => <Tag color="geekblue">{v}</Tag>,
          },
          { title: t('common.subject'), dataIndex: 'subject' },
          { title: t('nav.accounts'), dataIndex: 'accountName' },
          { title: t('common.region'), dataIndex: 'region' },
          {
            title: t('common.time'),
            dataIndex: 'time',
            render: (v: string | null) => (v ? v.slice(11, 16) : '-'),
          },
          { title: t('common.address'), dataIndex: 'location' },
          {
            title: t('audit.field.status'),
            dataIndex: 'checkedIn',
            render: (v: boolean) =>
              v ? <Tag color="green">{t('activities.checkedIn2')}</Tag> : <Tag color="orange">{t('activities.toVisit')}</Tag>,
          },
        ]}
      />
    </Card>
    </>
  )
}

interface Activity {
  id: string
  type: string
  subject: string
  status: string
  content: string | null
  checkInAt: string | null
  checkInAddress: string | null
  createdAt: string
}

export default function ActivitiesPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  useQuickCreate('activity', () => setOpen(true))
  const [view, setView] = useState<'list' | 'calendar' | 'route'>('list')
  const [form] = Form.useForm()
  const watchedEntityId = Form.useWatch('entityId', form)
  const watchedEntityType = Form.useWatch('entityType', form)
  const bridge = getMobileBridge()

  const tplQ = useQuery({
    queryKey: ['templates'],
    queryFn: () =>
      api<{ items: { id: string; name: string; content: string; category: string }[] }>('/templates'),
    retry: false,
  })

  const listQ = useQuery({
    queryKey: ['activities'],
    queryFn: () => api<{ items: Activity[]; total: number }>('/activities?pageSize=50'),
  })

  const createM = useMutation({
    mutationFn: async (v: Record<string, unknown>) => {
      const payload = { ...v, entityType: 'ACCOUNT', entityId: v.entityId }
      if (!isOnline()) {
        saveDraft('activity', payload)
        throw new Error('offline')
      }
      return api('/activities', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (e: Error) => {
      if (e.message === 'offline') {
        message.warning(t('activities.draftSavedOfflineIt'))
        setOpen(false)
        form.resetFields()
        return
      }
      message.error(e.message)
    },
  })

  const [manualId, setManualId] = useState<string | null>(null)
  const [manualAddr, setManualAddr] = useState('')
  const drafts = loadDrafts()
  const lastSync = getLastSync()
  const syncM = useMutation({
    mutationFn: () =>
      syncDrafts((kind, payload) => {
        if (kind === 'activity') {
          return api('/activities', { method: 'POST', body: JSON.stringify(payload) })
        }
        return Promise.reject(new Error('unknown draft kind'))
      }),
    onSuccess: (r) => {
      message.success(t('activities.draftSyncCompleteSucceeded', { ok: r.ok, failed: r.failed }))
      void qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  // 恢复联网自动同步
  useEffect(() => {
    return onNetworkChange((online) => {
      if (online && loadDrafts().length > 0) {
        syncM.mutate()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkInM = useMutation({
    mutationFn: async (payload: { id: string; lat?: number; lng?: number; address?: string }) => {
      if (payload.lat !== undefined && payload.lng !== undefined) {
        return api('/activities/check-in', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      // 无定位：只写地址，用 0,0 坐标占位（业务可改为仅 address）
      return api('/activities/check-in', {
        method: 'POST',
        body: JSON.stringify({
          id: payload.id,
          lat: 0,
          lng: 0,
          address: payload.address ?? t('activities.enteredManually'),
        }),
      })
    },
    onSuccess: () => {
      message.success(t('activities.checkedIn3'))
      setManualId(null)
      setManualAddr('')
      void qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (e: Error) => message.error(e.message || t('activities.checkInFailed')),
  })

  const tryCheckIn = async (id: string) => {
    try {
      const pos = await bridge.getCurrentPosition()
      let address: string | undefined
      try {
        address = (await bridge.reverseGeocode(pos.lat, pos.lng)).address
      } catch {
        address = undefined
      }
      checkInM.mutate({ id, lat: pos.lat, lng: pos.lng, address })
    } catch {
      // 定位失败 → 手工地址
      setManualId(id)
    }
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {t('nav.activities')}
      </Typography.Title>
      {drafts.length > 0 && (
        <Alert
          type="warning"
          style={{ marginBottom: 12 }}
          message={t('activities.offlineDrafts', { length: drafts.length, v: isOnline() ? t('activities.online') : t('activities.offline') })}
          description={
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <GaugeRing
                value={
                  drafts.length
                    ? ((drafts.filter((d) => d.status !== 'failed').length / drafts.length) * 100)
                    : 0
                }
                label={t('activities.pendingSync')}
                color={isOnline() ? '#2563eb' : '#94a3b8'}
                size={64}
              />
              <div style={{ flex: 1, minWidth: 200 }}>
                <Space wrap size={4}>
                  {drafts.slice(0, 6).map((d) => (
                    <Tag key={d.id} color={d.status === 'failed' ? 'red' : 'orange'}>
                      {d.kind} ·{' '}
                      {String((d.payload as { subject?: string })?.subject ?? d.createdAt.slice(11, 16))}
                    </Tag>
                  ))}
                  {lastSync ? (
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('activities.lastSynced', { v: lastSync.slice(0, 19).replace('T', ' ') })}
                    </Typography.Text>
                  ) : null}
                </Space>
                <div style={{ marginTop: 6, height: 6, background: '#e2e8f0', borderRadius: 4 }}>
                  <div
                    style={{
                      width: `${drafts.filter((d) => d.status !== 'failed').length ? 100 - (drafts.filter((d) => d.status === 'failed').length / drafts.length) * 100 : 0}%`,
                      height: 6,
                      background: isOnline() ? '#2563eb' : '#94a3b8',
                      borderRadius: 4,
                      transition: 'width .3s',
                    }}
                  />
                </div>
              </div>
            </div>
          }
          action={
            <Space>
              <Button size="small" loading={syncM.isPending} onClick={() => syncM.mutate()}>{t('common.syncNow')}</Button>
              <Button
                size="small"
                onClick={() => {
                  void qc.invalidateQueries()
                  message.info(t('activities.refreshed'))
                }}
              >{t('common.refresh')}</Button>
            </Space>
          }
        />
      )}
      <Space style={{ marginBottom: 12 }} wrap>
        <Button type="primary" onClick={() => setOpen(true)}>
          {t('common.create')}
        </Button>
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'list' | 'calendar' | 'route')}
          options={[
            { label: t('activities.list'), value: 'list' },
            { label: t('activities.month'), value: 'calendar' },
            { label: t('visit.route'), value: 'route' },
          ]}
        />
        <Button
          onClick={() => {
            void bridge.callPhone('400-000-0000').catch(() => undefined)
          }}
        >{t('activities.quickDial')}</Button>
        <Button
          type="primary"
          ghost
          loading={checkInM.isPending}
          onClick={() => {
            const pending = (listQ.data?.items ?? []).find(
              (a) => a.type === 'VISIT' && !a.checkInAt,
            )
            if (!pending) {
              message.info(t('activities.noVisitsToCheck'))
              return
            }
            void tryCheckIn(pending.id)
          }}
        >{t('activities.quickCheckIn')}</Button>
      </Space>
      {view === 'calendar' ? (
        <ActivityCalendar />
      ) : view === 'route' ? (
        <VisitRoutePanel />
      ) : (
      <List
        dataSource={listQ.data?.items ?? []}
        loading={listQ.isLoading}
        renderItem={(a: Activity) => (
          <List.Item
            actions={
              a.type === 'VISIT' && !a.checkInAt
                ? [
                    <Button key="ci" size="small" loading={checkInM.isPending} onClick={() => void tryCheckIn(a.id)}>{t('activities.checkIn')}</Button>,
                  ]
                : undefined
            }
          >
            <List.Item.Meta
              title={
                <Space>
                  <Tag>{a.type}</Tag>
                  {a.subject}
                  {a.checkInAt && <Tag color="green">{t('activities.checkedIn2')}</Tag>}
                </Space>
              }
              description={
                <>
                  {a.content}
                  {a.checkInAddress ? <div>📍 {a.checkInAddress}</div> : null}
                </>
              }
            />
          </List.Item>
        )}
      />
      )}
      <Modal
        title={t('activities.manualCheckInAddress')}
        open={!!manualId}
        onCancel={() => setManualId(null)}
        onOk={() => {
          if (!manualAddr) {
            message.error(t('validation.required'))
            return
          }
          checkInM.mutate({ id: manualId!, address: manualAddr })
        }}
        confirmLoading={checkInM.isPending}
      >
        <Input.TextArea
          rows={3}
          value={manualAddr}
          onChange={(e) => setManualAddr(e.target.value)}
          placeholder={t('activities.enterTheVisitAddress')}
        />
      </Modal>
      <Modal
        title={t('common.create')}
        open={open}
        forceRender
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'NOTE' }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="type" label={t('common.type')}>
            <Select
              options={['NOTE', 'TASK', 'VISIT', 'CALL'].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
          <Form.Item name="subject" label={t('common.subject')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="entityId" label={t('common.relatedRecord')}>
            <EntityPicker
              value={
                watchedEntityId
                  ? { entityType: watchedEntityType ?? 'ACCOUNT', entityId: watchedEntityId }
                  : null
              }
              onChange={(v) => form.setFieldValue('entityId', v?.entityId ?? '')}
            />
          </Form.Item>
          <Form.Item label={t('activities.talkTrackTemplates')}>
            <Select
              allowClear
              placeholder={t('activities.selectToInsertQuickly')}
              options={(tplQ.data?.items ?? []).map((x) => ({
                value: x.id,
                label: x.name,
                content: x.content,
              }))}
              onChange={(_, opt) => {
                const c = (opt as { content?: string })?.content
                if (c) form.setFieldValue('content', c)
              }}
            />
          </Form.Item>
          <Form.Item
            label={t('activities.voiceInput')}
            extra={t('activities.speechToTextWhen')}
          >
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const SR =
                    (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
                  const Ctor = (SR.SpeechRecognition || SR.webkitSpeechRecognition) as
                    | (new () => {
                        lang: string
                        interimResults: boolean
                        start: () => void
                        onresult: (e: {
                          results: ArrayLike<ArrayLike<{ transcript: string }>>
                        }) => void
                        onerror: () => void
                      })
                    | undefined
                  if (!Ctor) {
                    message.error(t('activities.thisBrowserDoesNot'))
                    return
                  }
                  const rec = new Ctor()
                  rec.lang = 'zh-CN'
                  rec.interimResults = false
                  rec.onresult = (e) => {
                    const text = e.results[0][0].transcript
                    form.setFieldValue('content', (form.getFieldValue('content') || '') + text)
                  }
                  rec.onerror = () => message.error(t('activities.speechRecognitionFailed'))
                  rec.start()
                }}
              >{t('activities.startSpeaking')}</Button>
            </Space>
          </Form.Item>
          <Form.Item name="content" label={t('common.content')}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
