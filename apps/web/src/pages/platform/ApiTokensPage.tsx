import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Tag, Typography } from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'

interface TokenRow {
  id: string
  name: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export default function ApiTokensPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [plain, setPlain] = useState<string | null>(null)
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api<TokenRow[]>('/api-tokens'),
    retry: false,
  })

  const createM = useMutation({
    mutationFn: (v: { name: string }) =>
      api<{ token: string }>('/api-tokens', {
        method: 'POST',
        body: JSON.stringify({ name: v.name, scopes: ['lead:read', 'account:read'] }),
      }),
    onSuccess: (r) => {
      setPlain(r.token)
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const removeM = useMutation({
    mutationFn: (id: string) => api(`/api-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mttok0001"
        title="API Token"
        subtitle={t('platform.platformOpenApiTokens')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['api-tokens'] })}
        onCreate={() => setOpen(true)}
        createLabel={t('common.create')}
      >
        <ErpTable
          rowKey="id"
          storageKey="tokens"
          loading={listQ.isLoading}
          dataSource={
            (listQ.data ?? []).filter(
              (r) => !q || r.name.toLowerCase().includes(q.toLowerCase()),
            ) as unknown as Record<string, unknown>[]
          }
          pageSize={12}
          columns={[
            { title: t('audit.field.name'), dataIndex: 'name', width: 160, filterType: 'text', sorter: true },
            {
              title: t('platform.permissions'),
              dataIndex: 'scopes',
              width: 180,
              render: (s: unknown) => ((s as string[]) ?? []).join(', '),
            },
            {
              title: t('platform.expires'),
              dataIndex: 'expiresAt',
              width: 110,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v).slice(0, 10) : '-'),
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 90,
              render: (_v, row) => {
                const r = row as unknown as TokenRow
                return (
                  <Button size="small" danger onClick={() => removeM.mutate(r.id)}>{t('common.delete')}</Button>
                )
              },
            },
          ]}
        />
      </ErpListShell>
      <Modal
        title={t('common.create')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createM.mutate(v)}>
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input placeholder={t('platform.integrationSystemA')} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={t('platform.tokenShownOnlyOnce')} open={!!plain} footer={null} onCancel={() => setPlain(null)}>
        <Typography.Paragraph copyable>{plain}</Typography.Paragraph>
        <Tag color="red">{t('platform.storeItSafelyIt')}</Tag>
      </Modal>
    </div>
  )
}
