import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Tabs, Tag, Tooltip, Typography } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, apiUrl, webUrl } from '../../api/client'
import { ErpTable } from '../../components/ErpTable'
import { setUiLocale } from '../../hooks/useUiLocale'
import { t } from '../../i18n'
import { NotifyBotsCard } from './NotifyBotsCard'
import { PushStatusCard } from './PushStatusCard'
import { CurrencyCard } from './CurrencyCard'
import { ImAppsCard } from './ImAppsCard'

interface Setting {
  key: string
  value: unknown
}

function EsignProviderForm() {
  const qc = useQueryClient()
  const { message } = App.useApp()
  const [provider, setProvider] = useState<string>('BUILTIN')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [orgId, setOrgId] = useState('')
  const [callbackUrl, setCallbackUrl] = useState('')
  const [enabled, setEnabled] = useState(true)

  const q = useQuery({
    queryKey: ['esign-provider'],
    queryFn: () =>
      api<{
        provider: string
        appId: string
        appSecretSet: boolean
        orgId: string
        callbackUrl: string
        enabled: boolean
        capabilities: string[]
      }>('/esign/provider'),
    retry: false,
  })

  useEffect(() => {
    if (!q.data) return
    setProvider(q.data.provider)
    setAppId(q.data.appId)
    setOrgId(q.data.orgId)
    setCallbackUrl(q.data.callbackUrl)
    setEnabled(q.data.enabled)
  }, [q.data])

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={8}>
      <Space wrap>
        <span>{t('settings.provider')}</span>
        <Select
          style={{ width: 160 }}
          value={provider}
          onChange={(v: string) => setProvider(v)}
          options={[
            { value: 'BUILTIN', label: t('settings.builtInSealingLocal') },
            { value: 'EQB', label: t('settings.esignbao') },
            { value: 'FADADA', label: t('settings.fadada') },
          ]}
        />
        <span>AppId：</span>
        <Input style={{ width: 180 }} value={appId} onChange={(e) => setAppId(e.target.value)} />
        <span>AppSecret：</span>
        <Input.Password
          style={{ width: 180 }}
          value={appSecret}
          placeholder={q.data?.appSecretSet ? t('settings.configuredLeaveBlankTo') : t('settings.pleaseEnter')}
          onChange={(e) => setAppSecret(e.target.value)}
        />
      </Space>
      <Space wrap>
        <span>{t('settings.organizationId')}</span>
        <Input style={{ width: 160 }} value={orgId} onChange={(e) => setOrgId(e.target.value)} />
        <span>{t('settings.callbackUrl')}</span>
        <Input
          style={{ width: 260 }}
          value={callbackUrl}
          placeholder="https://…/api/v1/esign/callback"
          onChange={(e) => setCallbackUrl(e.target.value)}
        />
        <span>{t('settings.enabled')}</span>
        <Button size="small" type={enabled ? 'primary' : 'default'} onClick={() => setEnabled(!enabled)}>
          {enabled ? t('settings.enabled2') : t('settings.disabled')}
        </Button>
        <Button
          size="small"
          type="primary"
          onClick={() => {
            void api('/esign/provider', {
              method: 'PUT',
              body: JSON.stringify({
                provider,
                appId,
                ...(appSecret ? { appSecret } : {}),
                orgId,
                callbackUrl,
                enabled,
              }),
            })
              .then(() => {
                message.success(t('settings.eSignProviderConfiguration'))
                setAppSecret('')
                void qc.invalidateQueries({ queryKey: ['esign-provider'] })
              })
              .catch((e: Error) => message.error(e.message))
          }}
        >{t('settings.saveConfiguration')}</Button>
      </Space>
      <Space wrap>
        {(q.data?.capabilities ?? []).map((c) => (
          <Tag key={c} color="blue">
            {c}
          </Tag>
        ))}
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('settings.builtInModeUses')}</Typography.Text>
    </Space>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('biz')
  const show = (k: string) => (tab === k ? undefined : 'crm-hide')
  const [form] = Form.useForm()

  const approvalsQ = useQuery({
    queryKey: ['approval-defs'],
    queryFn: () =>
      api<{
        threshold: string
        items: { id: string; code: string; name: string; entityType: string; isActive: boolean }[]
      }>('/approvals/definitions'),
    retry: false,
  })
  const perfQ = useQuery({
    queryKey: ['perf-stats'],
    queryFn: () =>
      api<{
        total: number
        errorCount: number
        p50: number
        p95: number
        p99: number
        avg: number
        slowest: { path: string; count: number; avgMs: number; maxMs: number }[]
      }>('/health/perf'),
    retry: false,
    refetchInterval: 30000,
  })
  const healthQ = useQuery({
    queryKey: ['health-status'],
    queryFn: () =>
      api<{ status: string; db: string; redis: string }>('/health'),
    retry: false,
    refetchInterval: 30000,
  })
  const healthReportQ = useQuery({
    queryKey: ['health-report'],
    queryFn: () =>
      api<{
        generatedAt: string
        db: string
        status: string
        metrics24h: {
          leads: number
          opportunities: number
          contracts: number
          payments: number
          activities: number
        }
        backlog: { pendingApprovals: number; overduePaymentPlans: number }
        backup: { last: string | null; status: string }
      }>('/jobs/health-report', { method: 'POST' }),
    retry: false,
    refetchInterval: 120000,
  })

  // settings 列表接口在 Org 模块：GET /settings 未做则用默认键
  const { data, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      try {
        const r = await api<Setting[]>('/settings')
        return Array.isArray(r) ? r : []
      } catch {
        return [] as Setting[]
      }
    },
    retry: false,
  })

  const save = useMutation({
    mutationFn: (v: { key: string; value: number | string }) =>
      api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ key: v.key, value: v.value }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      void refetch()
      void qc.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('common.settings')}</Typography.Title>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        style={{ marginBottom: 12 }}
        items={[
          { key: 'biz', label: t('settings.businessParameters') },
          { key: 'sec', label: t('settings.securityWorkflow') },
          { key: 'ops', label: t('settings.monitoringAutomation') },
          { key: 'api', label: t('settings.openPlatform') },
        ]}
      />
      <div className="crm-grid crm-cols-1 crm-h-md">
      <CurrencyCard className={show('biz')} />
      <Card
        size="small"
        className={show('biz')}
        title={t('settings.businessParameters')}
        extra={
          <Button type="primary" size="small" onClick={() => setOpen(true)}>
            {t('common.edit')}
          </Button>
        }
      >
        <ErpTable
          rowKey="key"
          storageKey="biz-settings"
          dataSource={
            (data?.length
              ? data
              : [
                  { key: 'discount_approval_threshold', value: 0.2 },
                  { key: 'lead.assign_rule', value: 'MANUAL' },
                  { key: 'i18n.default_locale', value: 'zh-CN' },
                ]) as unknown as Record<string, unknown>[]
          }
          pageSize={12}
          columns={[
            { title: 'Key', dataIndex: 'key', width: 200, filterType: 'text', sorter: true },
            {
              title: 'Value',
              dataIndex: 'value',
              width: 200,
              filterType: 'text',
              render: (v: unknown) => {
                if (v == null) return '-'
                if (typeof v === 'object') {
                  const json = JSON.stringify(v)
                  return (
                    <Space size={6}>
                      <Tooltip
                        title={
                          <pre style={{ margin: 0, maxHeight: 260, overflow: 'auto', fontSize: 11 }}>
                            {JSON.stringify(v, null, 2)}
                          </pre>
                        }
                      >
                        <Tag color="blue" style={{ marginRight: 0 }}>
                          {Array.isArray(v)
                            ? t('settings.listItems', { length: v.length })
                            : t('settings.configObjectItems', { length: Object.keys(v as object).length })}
                        </Tag>
                      </Tooltip>
                      <span style={{ color: 'var(--crm-muted-2)', fontSize: 11 }}>
                        {json.length > 32 ? `${json.slice(0, 32)}…` : json}
                      </span>
                    </Space>
                  )
                }
                return String(v)
              },
            },
          ]}
        />
      </Card>
      </div>
      <Modal
        title={t('common.edit')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="key" label={t('settings.configKey')} rules={[{ required: true }]}>
            <Input placeholder="discount_approval_threshold" />
          </Form.Item>
          <Form.Item name="value" label={t('settings.value')} rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <div className="crm-grid crm-cols-2 crm-h-md">
      <Card size="small" className={show('sec')} title={t('settings.changePassword')}>
        <Form
          layout="vertical"
          onFinish={(v) => {
            void fetch(apiUrl('/api/v1/auth/change-password'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
              },
              body: JSON.stringify({
                oldPassword: v.oldPassword,
                newPassword: v.newPassword,
              }),
            })
              .then((r) => r.json())
              .then((body) => {
                if (body.code === 0) message.success(t('settings.passwordChanged'))
                else message.error(body.message)
              })
              .catch(() => message.error(t('settings.networkError')))
          }}
        >
          <Form.Item
            name="oldPassword"
            label={t('settings.currentPassword')}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t('settings.newPassword')}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit">{t('settings.changePassword')}</Button>
        </Form>
      </Card>
      <Card size="small" className={show('sec')} title={t('settings.approvalFlowConfiguration')}>
        <Space style={{ marginBottom: 8 }} wrap>
          <span>{t('settings.discountApprovalThresholdApproval')}</span>
          <Input
            style={{ width: 100 }}
            defaultValue={approvalsQ.data?.threshold ?? '0.2'}
            id="discount-threshold"
          />
          <Button
            size="small"
            onClick={() => {
              const el = document.getElementById('discount-threshold') as HTMLInputElement
              const amountEl = document.getElementById('amount-threshold') as HTMLInputElement
              void api('/approvals/definitions/' + (approvalsQ.data?.items?.[0]?.id ?? ''), {
                method: 'POST',
                body: JSON.stringify({ threshold: el?.value ?? '0.2' }),
              })
                .then(() =>
                  api('/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({
                      key: 'amount_approval_threshold',
                      value: amountEl?.value ?? '200000',
                    }),
                  }),
                )
                .then(() => {
                  message.success(t('settings.thresholdSaved'))
                  void qc.invalidateQueries({ queryKey: ['approval-defs'] })
                })
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.saveThreshold')}</Button>
          <span>{t('settings.amountApprovalThresholdApproval')}</span>
          <Input
            style={{ width: 110 }}
            defaultValue="200000"
            id="amount-threshold"
          />
        </Space>
        <AutoFitTable
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={approvalsQ.data?.items ?? []}
          columns={[
            { title: t('common.code'), dataIndex: 'code' },
            { title: t('audit.field.name'), dataIndex: 'name' },
            { title: t('common.entity'), dataIndex: 'entityType' },
            {
              title: t('common.enabled2'),
              dataIndex: 'isActive',
              render: (v: boolean, r: { id: string }) => (
                <Button
                  size="small"
                  type={v ? 'primary' : 'default'}
                  onClick={() => {
                    void api(`/approvals/definitions/${r.id}`, {
                      method: 'POST',
                      body: JSON.stringify({ isActive: !v }),
                    }).then(() => qc.invalidateQueries({ queryKey: ['approval-defs'] }))
                  }}
                >
                  {v ? t('settings.enabled2') : t('settings.disabled')}
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card size="small" className={show('sec')} title={t('settings.eSignProvider')}>
        <EsignProviderForm />
      </Card>
      </div>
      <div className="crm-grid crm-cols-1 crm-h-lg">
      <Card
        size="small"
        title={t('settings.monitoringDashboard')}
        extra={
          <Button
            size="small"
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ['perf-stats'] })
              void qc.invalidateQueries({ queryKey: ['health-status'] })
            }}
          >{t('common.refresh')}</Button>
        }
      >
        <Space wrap style={{ marginBottom: 8 }}>
          <Tag color={healthQ.data?.status === 'ok' ? 'green' : 'red'}>{t('settings.service', { v: healthQ.data?.status ?? '-' })}
          </Tag>
          <Tag color={healthQ.data?.db === 'up' ? 'green' : 'red'}>DB {healthQ.data?.db ?? '-'}</Tag>
          <Tag color={healthQ.data?.redis === 'up' ? 'green' : 'default'}>
            Redis {healthQ.data?.redis ?? '-'}
          </Tag>
          <Tag color={perfQ.data?.errorCount ? 'red' : 'green'}>{t('common.errorRate', { v: perfQ.data?.total ? ((perfQ.data.errorCount / perfQ.data.total) * 100).toFixed(1) : 0 })}</Tag>
          <Tag>{t('common.requests', { v: perfQ.data?.total ?? 0 })}</Tag>
          <Tag color="blue">p50 {perfQ.data?.p50 ?? 0}ms</Tag>
          <Tag color="orange">p95 {perfQ.data?.p95 ?? 0}ms</Tag>
          <Tag color="purple">p99 {perfQ.data?.p99 ?? 0}ms</Tag>
          <Tag>{t('settings.avgMs', { v: perfQ.data?.avg ?? 0 })}</Tag>
        </Space>
        <Space wrap style={{ marginBottom: 8 }}>
          <Tag color={healthReportQ.data?.status === 'HEALTHY' ? 'green' : 'orange'}>{t('settings.healthCheck', { v: healthReportQ.data?.status ?? '-' })}
          </Tag>
          <Tag>{t('settings.leads24h', { v: healthReportQ.data?.metrics24h?.leads ?? 0 })}</Tag>
          <Tag>{t('common.deals3', { v: healthReportQ.data?.metrics24h?.opportunities ?? 0 })}</Tag>
          <Tag>{t('common.contracts', { v: healthReportQ.data?.metrics24h?.contracts ?? 0 })}</Tag>
          <Tag>{t('settings.payments', { v: healthReportQ.data?.metrics24h?.payments ?? 0 })}</Tag>
          <Tag>{t('settings.followUps', { v: healthReportQ.data?.metrics24h?.activities ?? 0 })}</Tag>
          <Tag color={healthReportQ.data?.backlog?.pendingApprovals ? 'red' : 'green'}>{t('settings.pendingApproval', { v: healthReportQ.data?.backlog?.pendingApprovals ?? 0 })}
          </Tag>
          <Tag color={healthReportQ.data?.backlog?.overduePaymentPlans ? 'orange' : 'green'}>{t('settings.overduePlans', { v: healthReportQ.data?.backlog?.overduePaymentPlans ?? 0 })}
          </Tag>
          <Tag color={healthReportQ.data?.backup?.status === 'fresh' ? 'green' : 'default'}>{t('settings.backup')}{' '}{healthReportQ.data?.backup?.last?.slice(0, 10) ?? t('settings.none')}
          </Tag>
        </Space>
        <AutoFitTable
          rowKey="path"
          size="small"
          pagination={false}
          dataSource={perfQ.data?.slowest ?? []}
          columns={[
            { title: t('common.endpoint'), dataIndex: 'path' },
            { title: t('common.count'), dataIndex: 'count' },
            { title: t('common.avgMs'), dataIndex: 'avgMs' },
            { title: t('settings.maxMs'), dataIndex: 'maxMs' },
          ]}
        />
      </Card>
      </div>
      <div className="crm-grid crm-cols-2 crm-h-lg">
      <NotifyBotsCard className={show('ops')} />
      <PushStatusCard className={show('ops')} />
      <Card size="small" className={show('ops')} title={t('settings.salesAutomation')}>
        <Space wrap>
          <Button
            onClick={() => {
              void api('/jobs/auto-assign-leads', { method: 'POST' })
                .then((r) => message.success(t('settings.assignedLeads', { v: (r as { assigned?: number })?.assigned ?? 0 })))
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.autoAssignLeads')}</Button>
          <Button
            onClick={() => {
              void api('/jobs/create-renewal-opps', { method: 'POST' })
                .then((r) => message.success(t('settings.generatedRenewalDeals', { v: (r as { created?: number })?.created ?? 0 })))
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.generateRenewalDeals')}</Button>
          <Button
            onClick={() => {
              void api('/jobs/nudge-stale-followups', { method: 'POST' })
                .then((r) => message.success(t('settings.remindedOverdueLeads', { v: (r as { nudged?: number })?.nudged ?? 0 })))
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.followUpTimeoutReminders')}</Button>
          <Button
            onClick={() => {
              void api('/jobs/journey-automation', { method: 'POST' })
                .then((r) => message.success(t('settings.journeyAutomation', { v: (r as { created?: number })?.created ?? 0 })))
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.customerJourneyAutomation')}</Button>
          <Button
            onClick={() => {
              void api('/jobs/funnel-auto-advance', { method: 'POST' })
                .then((r) => {
                  const d = r as { advanced?: number; nudged?: number }
                  message.success(t('settings.funnelAdvancedStallReminders', { v: d?.advanced ?? 0, v2: d?.nudged ?? 0 }))
                })
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.autoAdvanceFunnel')}</Button>
          <Button
            type="primary"
            onClick={() => {
              void api('/jobs/run-daily', { method: 'POST' })
                .then(() => message.success(t('settings.todaySAutomationFinished')))
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('settings.runTodaySAutomation')}</Button>
        </Space>
        <div style={{ marginTop: 8, color: 'var(--crm-muted)', fontSize: 12 }}>{t('settings.runsDailyAt08')}</div>
      </Card>
      <ImAppsCard className={show('api')} />
      <Card size="small" className={show('api')} title={t('settings.openApiDevelopers')}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Button onClick={() => window.open(apiUrl('/api/v1/docs'), '_blank')}>{t('settings.openapiDocs')}</Button>
          <Button onClick={() => window.open(apiUrl('/api/v1/docs-json'), '_blank')}>OpenAPI JSON</Button>
          <Button
            onClick={() => {
              const token = localStorage.getItem('access_token') ?? '<TOKEN>'
              const snippet = `curl -H "Authorization: Bearer ${token}" \\\n  ${webUrl('/api/v1')}/reports/dashboard`
              void navigator.clipboard.writeText(snippet)
              message.success(t('common.curlExampleCopied'))
            }}
          >{t('common.copyCurlExample')}</Button>
        </Space>
        <Typography.Paragraph style={{ fontSize: 12, color: 'var(--crm-muted)', marginBottom: 8 }}>
          Base URL：<code>{webUrl('/api/v1')}</code>{' '}{t('settings.auth')}<code>Authorization: Bearer &lt;access_token&gt;</code>{' '}{t('settings.afterSignInGet')}{' '}<code>access_token</code>{t('settings.orIssueOneOn')}</Typography.Paragraph>
        <AutoFitTable
          rowKey="p"
          size="small"
          pagination={false}
          dataSource={[
            { m: 'POST', p: '/auth/login', d: t('settings.signInToGet') },
            { m: 'GET', p: '/reports/dashboard', d: t('settings.homeDashboard') },
            { m: 'GET', p: '/opportunities?pageSize=20', d: t('settings.dealList') },
            { m: 'POST', p: '/activities', d: t('settings.createFollowUp') },
            { m: 'GET', p: '/reports/renewal-board', d: t('settings.renewalsBoard') },
            { m: 'GET', p: '/health/perf', d: t('settings.performanceMonitoring') },
            { m: 'GET', p: '/audit-logs?export=csv', d: t('settings.auditExport') },
          ]}
          columns={[
            { title: t('common.method'), dataIndex: 'm', width: 80 },
            {
              title: t('common.path'),
              dataIndex: 'p',
              render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code>,
            },
            { title: t('common.notes'), dataIndex: 'd' },
          ]}
        />
      </Card>
      </div>
      <Space style={{ marginTop: 16 }}>
        <Button
          onClick={() => {
            void fetch(apiUrl('/api/v1/auth/preferences'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
              },
              body: JSON.stringify({ locale: 'zh-CN' }),
            }).then(() => message.success(t('settings.setToChinese')))
          }}
        >
          语言：中文
        </Button>
        <Button
          onClick={() => {
            void fetch(apiUrl('/api/v1/auth/preferences'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
              },
              body: JSON.stringify({ locale: 'en-US' }),
            }).then(() => {
              message.success('Set to English')
              setUiLocale('en-US')
            })
          }}
        >
          Language: English
        </Button>
      </Space>
    </div>
  )
}
