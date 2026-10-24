import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Space, Tag } from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, getAccessToken, apiUrl } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'

interface Campaign {
  id: string
  name: string
  type: string
  status: string
  leadCount: number
  forms?: { id: string; name: string }[]
}

export default function CampaignsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api<Campaign[]>('/campaigns'),
  })

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      editId
        ? api<{ id: string }>(`/campaigns/${editId}`, { method: 'PATCH', body: JSON.stringify(v) })
        : api<{ id: string }>('/campaigns', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: (created) => {
      const done = () => {
        message.success(t('common.save'))
        setOpen(false)
        form.resetFields()
        void qc.invalidateQueries({ queryKey: ['campaigns'] })
      }
      // 编辑时不重复建表单；新建活动默认建一张表单
      if (editId) return done()
      void api('/forms', {
        method: 'POST',
        body: JSON.stringify({ name: `${(form.getFieldValue('name') as string) || t('campaigns.campaign')}-表单`, campaignId: created.id }),
      }).finally(done)
    },
    onError: (e: Error) => message.error(e.message),
  })

  const testSubmit = async (formId: string) => {
    const res = await fetch(apiUrl(`/api/v1/forms/${formId}/submit`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: t('campaigns.formLead', { v: Date.now() % 10000 }),
        contactName: t('campaigns.visitor'),
        phone: '13900000000',
        email: 'guest@example.com',
      }),
    })
    const body = await res.json()
    if (body.code === 0) {
      message.success(t('campaigns.leadCreated'))
      void qc.invalidateQueries({ queryKey: ['campaigns'] })
      void qc.invalidateQueries({ queryKey: ['leads'] })
    } else {
      message.error(body.message)
    }
  }

  const exportLeads = async () => {
    const res = await fetch(apiUrl('/api/v1/leads?export=csv&pageSize=5000'), {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <ErpListShell
        program="mtcmp0001"
        title={t('nav.campaigns')}
        subtitle={t('campaigns.acquisitionCampaigns')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['campaigns'] })}
        onCreate={() => {
          setEditId(null)
          form.resetFields()
          setOpen(true)
        }}
        createLabel={t('common.create')}
        onExport={() => void exportLeads()}
        extraActions={null}
      >
        <ErpTable
          rowKey="id"
          onRowClick={(row) => {
            const r = row as unknown as Record<string, unknown>
            setEditId(String(r.id))
            form.setFieldsValue(r)
            setOpen(true)
          }}
          storageKey="campaigns"
          loading={listQ.isLoading}
          dataSource={
            (listQ.data ?? []).filter(
              (r) => !q || r.name.toLowerCase().includes(q.toLowerCase()),
            ) as unknown as Record<string, unknown>[]
          }
          pageSize={12}
          columns={[
            { title: t('campaigns.campaign'), dataIndex: 'name', width: 180, filterType: 'text', sorter: true },
            { title: t('common.type'), dataIndex: 'type', width: 110, filterType: 'select', filterOptions: [
              { value: 'WEBINAR', label: 'WEBINAR' },
              { value: 'EXHIBITION', label: 'EXHIBITION' },
              { value: 'EMAIL', label: 'EMAIL' },
              { value: 'ADS', label: 'ADS' },
              { value: 'OTHER', label: 'OTHER' },
            ]},
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 90,
              filterType: 'select',
              filterOptions: [
                { value: 'ACTIVE', label: 'ACTIVE' },
                { value: 'ENDED', label: 'ENDED' },
              ],
              render: (v) => <Tag>{String(v)}</Tag>,
            },
            { title: t('campaigns.leads'), dataIndex: 'leadCount', width: 80, filterType: 'number' },
            {
              title: t('campaigns.form'),
              dataIndex: 'forms',
              width: 200,
              render: (_v, row) => {
                const r = row as unknown as Campaign
                return (
                  <Space>
                    {(r.forms ?? []).map((f) => (
                      <Button key={f.id} size="small" onClick={() => void testSubmit(f.id)}>{t('campaigns.simulate', { name: f.name })}
                      </Button>
                    ))}
                  </Space>
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
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'WEBINAR' }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="name" label={t('campaigns.campaignName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')}>
            <Input placeholder="WEBINAR / EXHIBITION / EMAIL / ADS / OTHER" />
          </Form.Item>
          <Form.Item name="description" label={t('common.notes')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
