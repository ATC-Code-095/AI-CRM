import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpTable } from '../../components/ErpTable'

interface Webhook {
  id: string
  url: string
  events: string[]
  isActive: boolean
  createdAt: string
}

interface Delivery {
  id: string
  event: string
  success: boolean
  responseCode: number | null
  at: string
}

export default function WebhooksPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api<Webhook[]>('/webhooks'),
    retry: false,
  })
  const delivQ = useQuery({
    queryKey: ['webhook-deliveries'],
    queryFn: () =>
      api<{ items: Delivery[]; total: number }>('/webhooks/deliveries?pageSize=20'),
    retry: false,
  })

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      const body = JSON.stringify({
        ...v,
        events: String(v.events ?? '*')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
      return editId
        ? api(`/webhooks/${editId}`, { method: 'PATCH', body })
        : api('/webhooks', { method: 'POST', body })
    },
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const removeM = useMutation({
    mutationFn: (id: string) => api(`/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['webhooks'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const testM = useMutation({
    mutationFn: (id: string) => api(`/webhooks/${id}/test`, { method: 'POST' }),
    onSuccess: () => {
      message.success(t('platform.testEventSent'))
      void qc.invalidateQueries({ queryKey: ['webhook-deliveries'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Webhook
      </Typography.Title>
      <Space style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          onClick={() => {
            setEditId(null)
            form.resetFields()
            setOpen(true)
          }}
        >
          {t('common.create')}
        </Button>
      </Space>
      <ErpTable
        rowKey="id"
        onRowClick={(row) => {
          const r = row as unknown as Record<string, unknown>
          setEditId(String(r.id))
          form.setFieldsValue({
            ...r,
            events: Array.isArray(r.events) ? (r.events as string[]).join(',') : r.events,
          })
          setOpen(true)
        }}
        storageKey="webhooks"
        loading={listQ.isLoading}
        dataSource={(listQ.data ?? []) as unknown as Record<string, unknown>[]}
        pageSize={12}
        columns={[
          { title: 'URL', dataIndex: 'url', width: 260, filterType: 'text' },
          {
            title: t('platform.events'),
            dataIndex: 'events',
            width: 180,
            render: (e: unknown) => ((e as string[]) ?? []).join(', '),
          },
          {
            title: t('audit.field.status'),
            dataIndex: 'isActive',
            width: 80,
            filterType: 'select',
            filterOptions: [
              { value: 'true', label: t('common.enabled2') },
              { value: 'false', label: t('common.disable') },
            ],
            render: (v) => (v ? <Tag color="green">{t('common.enabled2')}</Tag> : <Tag>{t('common.disable')}</Tag>),
          },
          {
            title: t('common.actions'),
            dataIndex: '__op',
            width: 120,
            render: (_v, row) => {
              const r = row as unknown as Webhook
              return (
                <Space>
                  <Button size="small" onClick={() => testM.mutate(r.id)}>{t('platform.test')}</Button>
                  <Button size="small" danger onClick={() => removeM.mutate(r.id)}>{t('common.delete')}</Button>
                </Space>
              )
            },
          },
        ]}
      />
      <Typography.Title level={5} style={{ marginTop: 24 }}>{t('platform.recentDeliveries')}</Typography.Title>
      <ErpTable
        rowKey="id"
        storageKey="webhook-deliveries"
        loading={delivQ.isLoading}
        dataSource={(delivQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
        pageSize={15}
        columns={[
          { title: t('platform.events'), dataIndex: 'event', width: 160, filterType: 'text' },
          {
            title: t('platform.result'),
            dataIndex: 'success',
            width: 80,
            filterType: 'select',
            filterOptions: [
              { value: 'true', label: 'OK' },
              { value: 'false', label: 'FAIL' },
            ],
            render: (ok) =>
              ok ? <Tag color="green">OK</Tag> : <Tag color="red">FAIL</Tag>,
          },
          { title: 'HTTP', dataIndex: 'responseCode', width: 80, filterType: 'number' },
          {
            title: t('common.time'),
            dataIndex: 'at',
            width: 150,
            filterType: 'text',
            render: (v: unknown) => (v ? String(v).slice(0, 19).replace('T', ' ') : '-'),
          },
        ]}
      />
      <Modal
        title={t('common.create')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ events: '*' }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="url" label="URL" rules={[{ required: true }]}>
            <Input placeholder="https://example.com/hook" />
          </Form.Item>
          <Form.Item name="secret" label="Secret">
            <Input />
          </Form.Item>
          <Form.Item name="events" label={t('platform.eventsCommaSeparatedFor')}>
            <Input placeholder="opportunity.won,payment.confirmed" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
