import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Checkbox, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { api } from '../../api/client'
import { t } from '../../i18n'

type Channel = 'wechat_work' | 'dingtalk' | 'feishu'

interface Bot {
  id?: string
  name: string
  channel: Channel
  webhookUrl: string
  hasSecret?: boolean
  secret?: string | null
  categories: string[]
  enabled: boolean
}

const CHANNEL_LABEL: Record<Channel, () => string> = {
  wechat_work: () => t('bots.channel.wechatWork'),
  dingtalk: () => t('bots.channel.dingtalk'),
  feishu: () => t('bots.channel.feishu'),
}

const URL_HINT: Record<Channel, string> = {
  wechat_work: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
  dingtalk: 'https://oapi.dingtalk.com/robot/send?access_token=…',
  feishu: 'https://open.feishu.cn/open-apis/bot/v2/hook/…',
}

/** 企业微信 / 钉钉 / 飞书群机器人：系统通知按分类转发到群 */
export function NotifyBotsCard({ className }: { className?: string }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Bot | null>(null)
  const [form] = Form.useForm<Bot>()
  const channel = Form.useWatch('channel', form) as Channel | undefined

  const q = useQuery({
    queryKey: ['notify-bots'],
    queryFn: () => api<{ items: Bot[]; categories: string[] }>('/notify/bots'),
  })
  const items = q.data?.items ?? []
  const categories = q.data?.categories ?? []

  const saveAll = useMutation({
    mutationFn: (next: Bot[]) => api('/notify/bots', { method: 'PUT', body: JSON.stringify({ items: next }) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setEditing(null)
      void qc.invalidateQueries({ queryKey: ['notify-bots'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const test = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ ok: boolean; error?: string | null }>('/notify/bots/test', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (r) => (r.ok ? message.success(t('bots.testSent')) : message.error(t('bots.testFailed', { v: r.error ?? '' }))),
    onError: (e: Error) => message.error(e.message),
  })

  // 列表里的机器人不带密钥：保存时不传 secret，服务端沿用原密钥
  const strip = (b: Bot): Bot => ({ id: b.id, name: b.name, channel: b.channel, webhookUrl: b.webhookUrl, categories: b.categories, enabled: b.enabled })

  const submit = async () => {
    const v = await form.validateFields()
    const row: Bot = { ...strip({ ...editing, ...v } as Bot), ...(v.secret ? { secret: v.secret } : {}) }
    const next = editing?.id ? items.map((b) => (b.id === editing.id ? row : strip(b))) : [...items.map(strip), row]
    saveAll.mutate(next)
  }

  return (
    <Card
      size="small"
      className={className}
      title={t('bots.title')}
      extra={
        <Button
          type="primary"
          size="small"
          onClick={() => {
            const b: Bot = { name: '', channel: 'wechat_work', webhookUrl: '', categories: ['APPROVAL', 'LEAD'], enabled: true }
            setEditing(b)
            form.setFieldsValue({ ...b, secret: '' })
          }}
        >
          {t('common.create')}
        </Button>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('bots.intro')}
      </Typography.Paragraph>
      <Table<Bot>
        rowKey={(r) => r.id ?? r.name}
        size="small"
        loading={q.isLoading}
        pagination={false}
        dataSource={items}
        columns={[
          { title: t('bots.name'), dataIndex: 'name' },
          { title: t('bots.channel'), dataIndex: 'channel', render: (v: Channel) => CHANNEL_LABEL[v]?.() ?? v },
          {
            title: t('bots.categories'),
            dataIndex: 'categories',
            render: (v: string[]) => v.map((c) => <Tag key={c}>{t(`bots.category.${c}`)}</Tag>),
          },
          {
            title: t('bots.enabled'),
            dataIndex: 'enabled',
            render: (v: boolean, r) => (
              <Switch
                size="small"
                checked={v}
                onChange={(on) => saveAll.mutate(items.map((b) => strip(b.id === r.id ? { ...b, enabled: on } : b)))}
              />
            ),
          },
          {
            title: t('common.actions'),
            render: (_: unknown, r) => (
              <Space size={4}>
                <Button size="small" type="link" loading={test.isPending} onClick={() => test.mutate({ id: r.id })}>
                  {t('bots.test')}
                </Button>
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    setEditing(r)
                    form.setFieldsValue({ ...r, secret: '' })
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  size="small"
                  type="link"
                  danger
                  onClick={() => saveAll.mutate(items.filter((b) => b.id !== r.id).map(strip))}
                >
                  {t('common.delete')}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={Boolean(editing)}
        title={editing?.id ? t('common.edit') : t('common.create')}
        onCancel={() => setEditing(null)}
        onOk={() => void submit()}
        confirmLoading={saveAll.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label={t('bots.name')} rules={[{ required: true, message: t('validation.required') }]}>
            <Input maxLength={60} placeholder={t('bots.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="channel" label={t('bots.channel')} rules={[{ required: true }]}>
            <Select options={(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => ({ value: c, label: CHANNEL_LABEL[c]() }))} />
          </Form.Item>
          <Form.Item
            name="webhookUrl"
            label={t('bots.webhookUrl')}
            rules={[{ required: true, message: t('validation.required') }]}
            extra={channel ? URL_HINT[channel] : undefined}
          >
            <Input />
          </Form.Item>
          {channel !== 'wechat_work' && (
            <Form.Item
              name="secret"
              label={t('bots.secret')}
              extra={editing?.hasSecret ? t('bots.secretKeep') : t('bots.secretHint')}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
          <Form.Item name="categories" label={t('bots.categories')} rules={[{ required: true, message: t('validation.required') }]}>
            <Checkbox.Group options={categories.map((c) => ({ value: c, label: t(`bots.category.${c}`) }))} />
          </Form.Item>
          <Form.Item name="enabled" label={t('bots.enabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button
            size="small"
            loading={test.isPending}
            onClick={() => {
              const v = form.getFieldsValue()
              if (editing?.id && !v.secret && v.webhookUrl === editing.webhookUrl) test.mutate({ id: editing.id })
              else test.mutate({ channel: v.channel, webhookUrl: v.webhookUrl, secret: v.secret || undefined })
            }}
          >
            {t('bots.testBeforeSave')}
          </Button>
        </Form>
      </Modal>
    </Card>
  )
}
