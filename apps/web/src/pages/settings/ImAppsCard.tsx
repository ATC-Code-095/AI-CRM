import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Descriptions, Form, Input, Modal, Space, Switch, Tag, Typography } from 'antd'
import { useState } from 'react'
import { api, type SsoProvider } from '../../api/client'
import { SSO_LABEL } from '../../components/SsoButtons'
import { t } from '../../i18n'

interface AppView {
  appId: string
  agentId: string
  enabled: boolean
  syncDaily: boolean
  hasSecret: boolean
}

interface SyncResult {
  at: string
  ok: boolean
  error?: string
  departments?: { created: number; updated: number }
  users?: { matched: number; created: number; disabled: number; skippedDisable?: number }
}

const PROVIDERS: SsoProvider[] = ['wechat_work', 'dingtalk', 'feishu']

/** 各平台「应用 ID」字段的名称不同 */
const APP_ID_LABEL: Record<SsoProvider, () => string> = {
  wechat_work: () => t('im.corpId'),
  dingtalk: () => t('im.appKey'),
  feishu: () => t('im.appIdFeishu'),
}

/** 企业微信 / 钉钉 / 飞书：企业自建应用凭证、通讯录同步与扫码登录 */
export function ImAppsCard({ className }: { className?: string }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<SsoProvider | null>(null)
  const [form] = Form.useForm<{ appId: string; agentId?: string; secret?: string; enabled: boolean; syncDaily: boolean }>()
  const q = useQuery({
    queryKey: ['im-apps'],
    queryFn: () => api<{ apps: Record<SsoProvider, AppView | null>; lastSync: Partial<Record<SsoProvider, SyncResult>> }>('/im/apps'),
  })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['im-apps'] })

  const save = useMutation({
    mutationFn: ({ p, v }: { p: SsoProvider; v: Record<string, unknown> }) => api(`/im/apps/${p}`, { method: 'PUT', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setEditing(null)
      refresh()
    },
    onError: (e: Error) => message.error(e.message),
  })
  const test = useMutation({
    mutationFn: (p: SsoProvider) => api<{ ok: boolean; error?: string }>(`/im/apps/${p}/test`, { method: 'POST' }),
    onSuccess: (r) => (r.ok ? message.success(t('im.testOk')) : message.error(t('im.testFailed', { v: r.error ?? '' }))),
    onError: (e: Error) => message.error(e.message),
  })
  const sync = useMutation({
    mutationFn: (p: SsoProvider) => api<SyncResult>(`/im/apps/${p}/sync`, { method: 'POST' }),
    onSuccess: (r) => {
      if (r.ok) message.success(t('im.syncDone', { m: r.users?.matched ?? 0, c: r.users?.created ?? 0, d: r.users?.disabled ?? 0 }))
      else message.error(t('im.syncFailed', { v: r.error ?? '' }))
      refresh()
    },
    onError: (e: Error) => message.error(e.message),
  })

  const summary = (r?: SyncResult) => {
    if (!r) return <span className="crm-muted">{t('im.neverSynced')}</span>
    if (!r.ok) return <Tag color="red">{t('im.syncFailed', { v: r.error ?? '' })}</Tag>
    return (
      <span>
        {new Date(r.at).toLocaleString()} ·{' '}
        {t('im.syncSummary', {
          dc: r.departments?.created ?? 0,
          du: r.departments?.updated ?? 0,
          m: r.users?.matched ?? 0,
          c: r.users?.created ?? 0,
          d: r.users?.disabled ?? 0,
        })}
        {r.users?.skippedDisable ? <Tag color="orange" style={{ marginLeft: 6 }}>{t('im.skippedDisable', { n: r.users.skippedDisable })}</Tag> : null}
      </span>
    )
  }

  return (
    <Card size="small" className={className} title={t('im.title')} loading={q.isLoading}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('im.intro', { url: `${window.location.origin}/login/sso/<provider>` })}
      </Typography.Paragraph>
      <Space direction="vertical" style={{ width: '100%' }}>
        {PROVIDERS.map((p) => {
          const a = q.data?.apps[p]
          return (
            <Card key={p} size="small" type="inner" title={SSO_LABEL[p]()} extra={a?.enabled ? <Tag color="green">{t('im.enabled')}</Tag> : <Tag>{t('im.disabled')}</Tag>}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label={APP_ID_LABEL[p]()}>{a?.appId || '—'}</Descriptions.Item>
                <Descriptions.Item label={t('im.callback')}>
                  <Typography.Text copyable>{`${window.location.origin}/login/sso/${p}`}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('im.lastSync')}>{summary(q.data?.lastSync[p])}</Descriptions.Item>
              </Descriptions>
              <Space wrap>
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(p)
                    form.setFieldsValue({ appId: a?.appId ?? '', agentId: a?.agentId ?? '', secret: '', enabled: a?.enabled ?? true, syncDaily: a?.syncDaily ?? false })
                  }}
                >
                  {a ? t('common.edit') : t('im.configure')}
                </Button>
                <Button size="small" disabled={!a} loading={test.isPending && test.variables === p} onClick={() => test.mutate(p)}>
                  {t('im.test')}
                </Button>
                <Button size="small" type="primary" disabled={!a?.enabled} loading={sync.isPending && sync.variables === p} onClick={() => sync.mutate(p)}>
                  {t('im.syncNow')}
                </Button>
              </Space>
            </Card>
          )
        })}
      </Space>
      <Modal
        open={Boolean(editing)}
        title={editing ? SSO_LABEL[editing]() : ''}
        onCancel={() => setEditing(null)}
        onOk={() => void form.validateFields().then((v) => editing && save.mutate({ p: editing, v: { ...v, secret: v.secret || undefined } }))}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        {editing && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t(`im.howto.${editing}`)} />}
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="appId" label={editing ? APP_ID_LABEL[editing]() : ''} rules={[{ required: true, message: t('validation.required') }]}>
            <Input />
          </Form.Item>
          {editing === 'wechat_work' && (
            <Form.Item name="agentId" label="AgentId" rules={[{ required: true, message: t('validation.required') }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item
            name="secret"
            label={t('im.secret')}
            extra={editing && q.data?.apps[editing]?.hasSecret ? t('im.secretKeep') : undefined}
            rules={[{ required: !(editing && q.data?.apps[editing]?.hasSecret), message: t('validation.required') }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="enabled" label={t('im.enableLogin')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="syncDaily" label={t('im.syncDaily')} valuePropName="checked" extra={t('im.syncHint')}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
