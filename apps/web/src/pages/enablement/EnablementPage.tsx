import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { api, isLoggedIn } from '../../api/client'
import { ErpTable } from '../../components/ErpTable'
import { EmailTrackingPanel } from '../../components/EmailTrackingPanel'
import { BarChart, Sparkline } from '../../components/SimpleCharts'
import { t } from '../../i18n'

export default function EnablementPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [kbOpen, setKbOpen] = useState(false)
  const [ptOpen, setPtOpen] = useState(false)
  const [npsOpen, setNpsOpen] = useState(false)
  const [portalId, setPortalId] = useState<string | null>(null)
  const [emOpen, setEmOpen] = useState(false)
  const [sgOpen, setSgOpen] = useState(false)
  const [segMembers, setSegMembers] = useState<{
    segment: { name: string }
    total: number
    items: { id: string; name: string; stage: string; level: string; industry: string; tags: string[] }[]
  } | null>(null)
  const [kbForm] = Form.useForm()
  const [ptForm] = Form.useForm()
  const [npsForm] = Form.useForm()
  const [emForm] = Form.useForm()
  const [sgForm] = Form.useForm()
  const [kbQ, setKbQ] = useState('')
  const [kbCategory, setKbCategory] = useState<string | undefined>()

  const kb = useQuery({
    queryKey: ['knowledge', kbQ, kbCategory],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{
        items: Array<
          Record<string, unknown> & {
            id: string
            title: string
            category: string
            content: string
            tags: string
            authorName: string
          }
        >
        categories: string[]
      }>(
        '/knowledge' +
          (kbQ || kbCategory
            ? '?' +
              [
                kbQ ? `q=${encodeURIComponent(kbQ)}` : '',
                kbCategory ? `category=${encodeURIComponent(kbCategory)}` : '',
              ]
                .filter(Boolean)
                .join('&')
            : ''),
      ),
    retry: false,
  })
  const partners = useQuery({
    queryKey: ['partners'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<
        Array<
          Record<string, unknown> & {
            id: string
            name: string
            contactName: string
            phone: string
            region: string
            leadCount: number
            oppCount: number
            oppAmount: string
            wonAmount: string
          }
        >
      >('/partners'),
    retry: false,
  })
  const nps = useQuery({
    queryKey: ['nps'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{
        nps: number
        avg: string
        promoters: number
        passives: number
        detractors: number
        total: number
        items: Array<Record<string, unknown> & { id: string; accountName: string; score: number; comment: string }>
      }>('/nps'),
    retry: false,
  })
  const npsPending = useQuery({
    queryKey: ['nps-pending'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{ items: Array<{ accountId: string; accountName: string; contractNo: string; total: string }> }>(
        '/nps/pending',
      ),
    retry: false,
  })
  const npsTrend = useQuery({
    queryKey: ['nps-trend'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{
        months: number
        items: Array<{
          month: string
          nps: number
          avg: string
          count: number
          promoters: number
          passives: number
          detractors: number
        }>
      }>('/nps/trend?months=6'),
    retry: false,
  })
  const npsAlerts = useQuery({
    queryKey: ['nps-alerts'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{
        items: Array<{
          id: string
          accountId: string
          accountName: string
          score: number
          comment: string
          level: string
          createdAt: string
        }>
        total: number
      }>('/nps/alerts'),
    retry: false,
  })
  const portal = useQuery({
    queryKey: ['partner-portal', portalId],
    enabled: !!portalId && isLoggedIn(),
    queryFn: () =>
      api<{
        partner: { name: string }
        summary: {
          leadCount: number
          oppCount: number
          openAmount: string
          wonAmount: string
          contractCount: number
        }
        leads: { id: string; name: string; status: string }[]
        opportunities: { id: string; name: string; amount: string; stage: { name: string } }[]
        contracts: { id: string; contractNo: string; total: string; status: string }[]
      }>(`/partners/${portalId}/portal`),
    retry: false,
  })
  const emailTpls = useQuery({
    queryKey: ['email-templates'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{
        items: { id: string; name: string; subject: string; body: string; category: string }[]
      }>('/email-templates'),
    retry: false,
  })
  const segments = useQuery({
    queryKey: ['segments'],
    enabled: isLoggedIn(),
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          stage: string
          industry: string
          level: string
          tag: string
        }[]
      }>('/segments'),
    retry: false,
  })

  const emCreate = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/email-templates', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('enablement.emailTemplateSaved'))
      setEmOpen(false)
      emForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const sgCreate = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/segments', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('enablement.customerSegmentSaved'))
      setSgOpen(false)
      sgForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['segments'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const kbCreate = useMutation({
    mutationFn: (v: Record<string, unknown>) => api('/knowledge', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.saved'))
      setKbOpen(false)
      kbForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['knowledge'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const ptCreate = useMutation({
    mutationFn: (v: Record<string, unknown>) => api('/partners', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.saved'))
      setPtOpen(false)
      ptForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['partners'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const npsCreate = useMutation({
    mutationFn: (v: Record<string, unknown>) => api('/nps', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('enablement.recorded'))
      setNpsOpen(false)
      npsForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['nps'] })
      void qc.invalidateQueries({ queryKey: ['nps-pending'] })
      void qc.invalidateQueries({ queryKey: ['nps-trend'] })
      void qc.invalidateQueries({ queryKey: ['nps-alerts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const npsFollowup = useMutation({
    mutationFn: (v: { accountId: string; note?: string }) =>
      api('/nps/followup', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('enablement.followUpTaskCreated'))
      void qc.invalidateQueries({ queryKey: ['nps-alerts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('nav.enablement')}</Typography.Title>
      <Tabs
        type="card"
        style={{ marginBottom: 0 }}
        items={[
          {
            key: 'kb',
            label: t('enablement.knowledgeBaseTalkTracks'),
            children: (
              <Card
                extra={
                  <Space>
                    <Input.Search
                      placeholder={t('enablement.searchTitleTagsContent')}
                      allowClear
                      style={{ width: 220 }}
                      onSearch={setKbQ}
                    />
                    <Select
                      allowClear
                      placeholder={t('common.category2')}
                      style={{ width: 120 }}
                      options={(kb.data?.categories ?? ['general', 'product', 'objection', 'compete']).map(
                        (c) => ({ value: c, label: c }),
                      )}
                      onChange={(v) => setKbCategory(v ? String(v) : undefined)}
                    />
                    <Button type="primary" onClick={() => setKbOpen(true)}>{t('enablement.newArticle')}</Button>
                  </Space>
                }
              >
                <ErpTable
                rowKey="id"
                storageKey="tbl1"
                    onRowClick={(row) => {
                      const r = row as unknown as Record<string, unknown>
                      kbForm?.setFieldsValue?.(r)
                      setKbOpen(true)
                    }}
                    loading={kb.isLoading}
                  dataSource={kb.data?.items ?? []}
                  columns={[
                    {
                      title: t('audit.field.title'),
                      dataIndex: 'title',
                      render: (v: unknown, r: Record<string, unknown>) => (
                        <span>
                          <b>{String(v)}</b>
                          <div style={{ color: '#8b919a', fontSize: 12 }}>{String(r.content ?? '').slice(0, 60)}</div>
                        </span>
                      ),
                    },
                    {
                      title: t('common.category2'),
                      dataIndex: 'category',
                      render: (v: unknown) => <Tag>{String(v)}</Tag>,
                    },
                    { title: t('common.tags'), dataIndex: 'tags' },
                    { title: t('enablement.author'), dataIndex: 'authorName' },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Button
                                    danger
                          onClick={() => {
                            void api(`/knowledge/${String(r.id)}`, { method: 'DELETE' }).then(() =>
                              qc.invalidateQueries({ queryKey: ['knowledge'] }),
                            )
                          }}
                        >{t('common.delete')}</Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'pt',
            label: t('enablement.channelPartners'),
            children: (
              <Card
                extra={
                  <Button type="primary" onClick={() => setPtOpen(true)}>{t('enablement.newPartner')}</Button>
                }
              >
                <ErpTable
                rowKey="id"
                storageKey="tbl2"
                  onRowClick={(row) => {
                    const r = row as unknown as Record<string, unknown>
                    ptForm.setFieldsValue(r)
                    setPtOpen(true)
                  }}
                    loading={partners.isLoading}
                  dataSource={partners.data ?? []}
                  columns={[
                    { title: t('common.partner'), dataIndex: 'name' },
                    { title: t('nav.contacts'), dataIndex: 'contactName' },
                    { title: t('enum.activity.type.CALL'), dataIndex: 'phone' },
                    { title: t('common.region'), dataIndex: 'region' },
                    { title: t('nav.leads'), dataIndex: 'leadCount' },
                    { title: t('nav.opportunities'), dataIndex: 'oppCount' },
                    { title: t('common.dealAmount'), dataIndex: 'oppAmount' },
                    { title: t('common.wonAmount'), dataIndex: 'wonAmount' },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      render: (_: unknown, r: { id: string }) => (
                        <Button size="small" onClick={() => setPortalId(r.id)}>{t('enablement.portalView')}</Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'nps',
            label: t('enablement.npsSatisfaction'),
            children: (
              <Card
                title={t('enablement.customerSatisfactionNps')}
                extra={
                  <Button
                    type="primary"
                    onClick={() => {
                      const first = npsPending.data?.items?.[0]
                      if (first) npsForm.setFieldsValue({ accountId: first.accountId, score: 9 })
                      setNpsOpen(true)
                    }}
                  >{t('enablement.recordSurvey')}</Button>
                }
              >
                <Space size={16} wrap>
                  <Card size="small" style={{ minWidth: 120 }}>
                    <div style={{ color: '#8b919a', fontSize: 12 }}>{t('enablement.npsScore')}</div>
                    <Typography.Title level={2} style={{ margin: 0 }}>
                      {nps.data?.nps ?? 0}
                    </Typography.Title>
                  </Card>
                  <Card size="small" style={{ minWidth: 120 }}>
                    <div style={{ color: '#8b919a', fontSize: 12 }}>{t('common.avgScore')}</div>
                    <Typography.Title level={2} style={{ margin: 0 }}>
                      {nps.data?.avg ?? 0}
                    </Typography.Title>
                  </Card>
                  <Space>
                    <Tag color="green">{t('common.promoters', { v: nps.data?.promoters ?? 0 })}</Tag>
                    <Tag color="blue">{t('enablement.passives', { v: nps.data?.passives ?? 0 })}</Tag>
                    <Tag color="red">{t('common.detractors', { v: nps.data?.detractors ?? 0 })}</Tag>
                  </Space>
                </Space>
                <Typography.Title level={5} style={{ marginTop: 16 }}>{t('enablement.npsTrendLast6')}</Typography.Title>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 280 }}>
                    <BarChart
                      items={(npsTrend.data?.items ?? []).map((t) => ({ label: t.month.slice(5), value: t.nps }))}
                      color="#2b5fd9"
                      height={140}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 12, color: '#8b919a', marginBottom: 4 }}>{t('enablement.averageTrend')}</div>
                    <Sparkline
                      points={(npsTrend.data?.items ?? []).map((t) => ({ date: t.month, avg: Number(t.avg) }))}
                      labelKey="avg"
                      color="#22a06b"
                      height={120}
                    />
                    <div style={{ fontSize: 12, color: '#8b919a', marginTop: 8 }}>{t('enablement.monthlySamples', { v: (npsTrend.data?.items ?? []).map((t) => `${t.month.slice(5)}:${t.count}`).join('  ') })}
                    </div>
                  </div>
                </div>
                {(npsAlerts.data?.items?.length ?? 0) > 0 && (
                  <>
                    <Typography.Title level={5} style={{ marginTop: 16 }}>{t('enablement.lowScoreAlertsDetractors')}<Tag color="red" style={{ marginLeft: 8 }}>
                        {npsAlerts.data?.total ?? 0}
                      </Tag>
                    </Typography.Title>
                    <ErpTable
                      rowKey="id"
                      storageKey="nps-alerts"
                      dataSource={npsAlerts.data?.items ?? []}
                      columns={[
                        { title: t('nav.accounts'), dataIndex: 'accountName' },
                        {
                          title: t('enablement.score'),
                          dataIndex: 'score',
                          width: 80,
                          render: (v: unknown) => <Tag color="red">{String(v)}</Tag>,
                        },
                        { title: t('enablement.comment'), dataIndex: 'comment' },
                        {
                          title: t('common.level'),
                          dataIndex: 'level',
                          width: 90,
                          render: (v: unknown) => (
                            <Tag color={v === 'HIGH' ? 'volcano' : 'orange'}>{v === 'HIGH' ? t('common.high') : t('common.medium2')}</Tag>
                          ),
                        },
                        {
                          title: t('common.actions'),
                          dataIndex: '__op',
                          width: 110,
                          render: (_: unknown, r: { accountId: string; comment: string }) => (
                            <Button
                              size="small"
                              type="primary"
                              loading={npsFollowup.isPending}
                              onClick={() =>
                                npsFollowup.mutate({
                                  accountId: r.accountId,
                                  note: t('enablement.npsLowScoreFollow', { v: r.comment || t('enablement.confirmTheIssueAnd') }),
                                })
                              }
                            >{t('enablement.createFollowUp')}</Button>
                          ),
                        },
                      ]}
                    />
                  </>
                )}
                <Typography.Title level={5} style={{ marginTop: 16 }}>{t('enablement.accountsToFollowUp')}</Typography.Title>
                <ErpTable
                rowKey="accountId"
                storageKey="tbl3"
                    dataSource={npsPending.data?.items ?? []}
                  columns={[
                    { title: t('nav.accounts'), dataIndex: 'accountName' },
                    { title: t('nav.contracts'), dataIndex: 'contractNo' },
                    { title: t('audit.field.amount'), dataIndex: 'total' },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      render: (_, r) => (
                        <Button
                                    onClick={() => {
                            npsForm.setFieldsValue({ accountId: r.accountId, score: 9 })
                            setNpsOpen(true)
                          }}
                        >{t('common.followUpVisit')}</Button>
                      ),
                    },
                  ]}
                />
                <Typography.Title level={5} style={{ marginTop: 16 }}>{t('enablement.recentSurveys')}</Typography.Title>
                <ErpTable
                rowKey="id"
                storageKey="tbl4"
                    dataSource={nps.data?.items ?? []}
                  columns={[
                    { title: t('nav.accounts'), dataIndex: 'accountName' },
                    {
                      title: t('enablement.score'),
                      dataIndex: 'score',
                      render: (v: unknown) => (
                        <Tag color={Number(v) >= 9 ? 'green' : Number(v) >= 7 ? 'blue' : 'red'}>{String(v)}</Tag>
                      ),
                    },
                    { title: t('enablement.comment'), dataIndex: 'comment' },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'email',
            label: t('enablement.emailOutreach'),
            children: (
              <div>
                <EmailTrackingPanel />
                <Card
                  title={t('enablement.emailTemplates')}
                  size="small"
                  extra={
                    <Button type="primary" size="small" onClick={() => setEmOpen(true)}>{t('enablement.newTemplate')}</Button>
                  }
                >
                <ErpTable
                  rowKey="id"
                  storageKey="email-tpls"
                  onRowClick={(row) => {
                    const r = row as unknown as Record<string, unknown>
                    emForm.setFieldsValue(r)
                    setEmOpen(true)
                  }}
                  dataSource={(emailTpls.data?.items ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={8}
                  columns={[
                    { title: t('audit.field.name'), dataIndex: 'name' },
                    { title: t('common.subject'), dataIndex: 'subject' },
                    {
                      title: t('common.content'),
                      dataIndex: 'body',
                      render: (v: unknown) => (
                        <span style={{ color: '#8b919a', fontSize: 12 }}>{String(v ?? '').slice(0, 40)}</span>
                      ),
                    },
                    { title: t('common.category2'), dataIndex: 'category' },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Button
                                    danger
                          onClick={() => {
                            void api(`/email-templates/${String(r.id)}`, { method: 'DELETE' }).then(() =>
                              qc.invalidateQueries({ queryKey: ['email-templates'] }),
                            )
                          }}
                        >{t('common.delete')}</Button>
                      ),
                    },
                  ]}
                />
                </Card>
              </div>
            ),
          },
          {
            key: 'seg',
            label: t('enablement.segmentsOperations'),
            children: (
              <Card
                extra={
                  <Button type="primary" onClick={() => setSgOpen(true)}>{t('common.newSegment')}</Button>
                }
              >
                <ErpTable
                  rowKey="id"
                  storageKey="segments"
                  dataSource={(segments.data?.items ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={8}
                  columns={[
                    { title: t('common.segment'), dataIndex: 'name' },
                    {
                      title: t('common.conditions'),
                      dataIndex: '__cond',
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Space wrap>
                          {r.stage ? <Tag>{t('enablement.stage', { stage: String(r.stage) })}</Tag> : null}
                          {r.industry ? <Tag>{t('enablement.industry', { industry: String(r.industry) })}</Tag> : null}
                          {r.level ? <Tag>{t('enablement.level', { level: String(r.level) })}</Tag> : null}
                          {r.tag ? <Tag color="geekblue">{t('enablement.tag', { tag: String(r.tag) })}</Tag> : null}
                        </Space>
                      ),
                    },
                    {
                      title: t('common.autoOutreach'),
                      dataIndex: 'autoOutreach',
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Tag
                          color={r.autoOutreach ? 'green' : 'default'}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            void api(`/segments/${String(r.id)}`, {
                              method: 'PUT',
                              body: JSON.stringify({ autoOutreach: !r.autoOutreach }),
                            }).then(() => {
                              message.success(
                                r.autoOutreach ? t('enablement.autoOutreachDisabled') : t('enablement.autoOutreachEnabledDaily'),
                              )
                              void qc.invalidateQueries({ queryKey: ['segments'] })
                            })
                          }}
                        >
                          {r.autoOutreach ? t('common.enabled') : t('enum.lead.status.CLOSED_LOST')}
                        </Tag>
                      ),
                    },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Space>
                          <Button
                                        onClick={() => {
                              void api(`/segments/${String(r.id)}/members`).then((d) =>
                                setSegMembers(d as typeof segMembers),
                              )
                            }}
                          >{t('enablement.viewList')}</Button>
                          <Button
                                        type="primary"
                            onClick={() => {
                              void api(`/segments/${String(r.id)}/outreach`, {
                                method: 'POST',
                                body: JSON.stringify({}),
                              })
                                .then((d) => {
                                  const created = (d as { created?: number })?.created ?? 0
                                  message.success(t('enablement.reachedAccountsAndNotified', { created }))
                                })
                                .catch((e: Error) => message.error(e.message))
                            }}
                          >{t('enablement.reachOutNow')}</Button>
                          <Button
                                        danger
                            onClick={() => {
                              void api(`/segments/${String(r.id)}`, { method: 'DELETE' }).then(() =>
                                qc.invalidateQueries({ queryKey: ['segments'] }),
                              )
                            }}
                          >{t('common.delete')}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      <Modal title={t('enablement.newKnowledgeArticle')} open={kbOpen} onCancel={() => setKbOpen(false)} onOk={() => kbForm.submit()} confirmLoading={kbCreate.isPending}>
        <Form form={kbForm} layout="vertical" onFinish={(v) => kbCreate.mutate(v)}>
          <Form.Item name="title" label={t('audit.field.title')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label={t('common.category2')} initialValue="general">
            <Input placeholder={t('enablement.eGProductObjection')} />
          </Form.Item>
          <Form.Item name="tags" label={t('common.tags')}>
            <Input placeholder={t('common.commaSeparated')} />
          </Form.Item>
          <Form.Item name="content" label={t('common.content')}>
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('enablement.newChannelPartner')} open={ptOpen} onCancel={() => setPtOpen(false)} onOk={() => ptForm.submit()} confirmLoading={ptCreate.isPending}>
        <Form form={ptForm} layout="vertical" onFinish={(v) => ptCreate.mutate(v)}>
          <Form.Item name="name" label={t('enablement.partnerName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactName" label={t('nav.contacts')}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label={t('enum.activity.type.CALL')}>
            <Input />
          </Form.Item>
          <Form.Item name="region" label={t('common.region')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('enablement.recordNpsSurvey')} open={npsOpen} onCancel={() => setNpsOpen(false)} onOk={() => npsForm.submit()} confirmLoading={npsCreate.isPending}>
        <Form form={npsForm} layout="vertical" onFinish={(v) => npsCreate.mutate(v)}>
          <Form.Item name="accountId" label={t('common.accountId')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="score" label={t('enablement.recommendationScore010')} rules={[{ required: true }]}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="contactName" label={t('enablement.contactSurveyed')}>
            <Input />
          </Form.Item>
          <Form.Item name="comment" label={t('enablement.comment')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('enablement.partnerPortal', { v: portal.data?.partner?.name ?? '' })}
        open={!!portalId}
        onCancel={() => setPortalId(null)}
        footer={null}
        width={720}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Tag>{t('enablement.leads', { v: portal.data?.summary.leadCount ?? 0 })}</Tag>
          <Tag>{t('common.deals3', { v: portal.data?.summary.oppCount ?? 0 })}</Tag>
          <Tag color="blue">{t('enablement.openAmount', { v: portal.data?.summary.openAmount ?? 0 })}</Tag>
          <Tag color="green">{t('enablement.wonAmount', { v: portal.data?.summary.wonAmount ?? 0 })}</Tag>
          <Tag color="purple">{t('common.contracts', { v: portal.data?.summary.contractCount ?? 0 })}</Tag>
        </Space>
        <Typography.Text strong>{t('nav.opportunities')}</Typography.Text>
        <ErpTable
                rowKey="id"
                storageKey="tbl5"
            dataSource={portal.data?.opportunities ?? []}
          columns={[
            { title: t('audit.field.name'), dataIndex: 'name' },
            { title: t('audit.field.amount'), dataIndex: 'amount' },
            {
              title: t('audit.field.stage'),
              dataIndex: 'stage',
              render: (_: unknown, r: { stage?: { name?: string } }) => r.stage?.name ?? '-',
            },
          ]}
        />
        <Typography.Text strong style={{ display: 'block', marginTop: 12 }}>{t('nav.leads')}</Typography.Text>
        <ErpTable
                rowKey="id"
                storageKey="tbl6"
            dataSource={portal.data?.leads ?? []}
          columns={[
            { title: t('audit.field.name'), dataIndex: 'name' },
            { title: t('audit.field.status'), dataIndex: 'status' },
          ]}
        />
      </Modal>
      <Modal title={t('enablement.newEmailTemplate')} open={emOpen} onCancel={() => setEmOpen(false)} onOk={() => emForm.submit()} confirmLoading={emCreate.isPending} width={560}>
        <Form form={emForm} layout="vertical" onFinish={(v) => emCreate.mutate(v)}>
          <Form.Item name="name" label={t('common.templateName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="subject" label={t('enablement.emailSubject')} rules={[{ required: true }]}>
            <Input placeholder={t('enablement.supportsVariablesSuchAs')} />
          </Form.Item>
          <Form.Item name="category" label={t('common.category2')} initialValue="general">
            <Input />
          </Form.Item>
          <Form.Item name="body" label={t('common.body')} rules={[{ required: true }]}>
            <Input.TextArea rows={6} placeholder={t('enablement.supportsVariablesSuchAs2')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('common.newCustomerSegment')} open={sgOpen} onCancel={() => setSgOpen(false)} onOk={() => sgForm.submit()} confirmLoading={sgCreate.isPending}>
        <Form form={sgForm} layout="vertical" onFinish={(v) => sgCreate.mutate(v)}>
          <Form.Item name="name" label={t('common.segmentName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="stage" label={t('common.accountStage')}>
            <Select
              allowClear
              options={[
                { value: 'POTENTIAL', label: t('common.prospect') },
                { value: 'ACTIVE', label: t('common.active') },
                { value: 'AT_RISK', label: t('common.atRisk2') },
                { value: 'CHURNED', label: t('common.churned') },
              ]}
            />
          </Form.Item>
          <Form.Item name="industry" label={t('common.industry')}>
            <Input />
          </Form.Item>
          <Form.Item name="level" label={t('audit.field.level')}>
            <Select allowClear options={['A', 'B', 'C', 'D'].map((x) => ({ value: x, label: x }))} />
          </Form.Item>
          <Form.Item name="tag" label={t('common.tags')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('enablement.segmentMembers', { v: segMembers?.segment?.name ?? '', v2: segMembers?.total ?? 0 })}
        open={!!segMembers}
        onCancel={() => setSegMembers(null)}
        footer={null}
        width={640}
      >
        <ErpTable
                rowKey="id"
                storageKey="tbl7"
          dataSource={segMembers?.items ?? []}
          columns={[
            { title: t('nav.accounts'), dataIndex: 'name' },
            { title: t('audit.field.stage'), dataIndex: 'stage' },
            { title: t('audit.field.level'), dataIndex: 'level' },
            { title: t('common.industry'), dataIndex: 'industry' },
            {
              title: t('common.tags'),
              dataIndex: 'tags',
              render: (tags: unknown) => (
                <Space wrap>
                  {((tags as string[]) ?? []).map((t: string) => (
                    <Tag key={t} color="geekblue">
                      {t}
                    </Tag>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  )
}
