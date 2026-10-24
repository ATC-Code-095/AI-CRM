import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpTable } from '../../components/ErpTable'

interface FieldRow {
  id: string
  entity: string
  apiName: string
  label: string
  dataType: string
  required: boolean
  isActive: boolean
}

export default function FieldDefsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['field-defs'],
    queryFn: () => api<FieldRow[]>('/field-definitions'),
    retry: false,
  })

  const dict = useQuery({
    queryKey: ['data-dictionary'],
    queryFn: () =>
      api<{
        enums: { name: string; label: string; items: { code: string; label: string }[] }[]
        entities: { code: string; label: string; fields: string[] }[]
        customFields: FieldRow[]
      }>('/field-definitions/dictionary'),
    retry: false,
  })

  const saveM = useMutation({
    // 编辑时后端只允许改标签与必填；对象 / API 名 / 类型创建后不可变
    mutationFn: (v: Record<string, unknown>) =>
      editId
        ? api(`/field-definitions/${editId}`, {
            method: 'PATCH',
            body: JSON.stringify({ label: v.label, required: v.required }),
          })
        : api('/field-definitions', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      setEditId(null)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['field-defs'] })
      void qc.invalidateQueries({ queryKey: ['data-dictionary'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const toggleM = useMutation({
    mutationFn: (p: { id: string; isActive: boolean }) =>
      api(`/field-definitions/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: p.isActive }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['field-defs'] }),
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('fields.dataDictionaryCustomFields')}</Typography.Title>
      <Tabs
        items={[
          {
            key: 'dict',
            label: t('common.dataDictionary'),
            children: (
              <Card size="small" className="crm-panel-fixed crm-block-lg">
                <Typography.Title level={5} style={{ marginTop: 0 }}>{t('fields.enumValues')}</Typography.Title>
                <ErpTable
                  rowKey="name"
                  storageKey="dict-enums"
                  dataSource={(dict.data?.enums ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={8}
                  columns={[
                    { title: t('fields.dictionary'), dataIndex: 'label', width: 120, filterType: 'text', sorter: true },
                    { title: t('common.code'), dataIndex: 'name', width: 140, filterType: 'text' },
                    {
                      title: t('fields.values'),
                      dataIndex: 'items',
                      width: 280,
                      render: (items: unknown) => (
                        <Space wrap>
                          {((items as { code: string; label: string }[]) ?? []).map((i) => (
                            <Tag key={i.code}>{i.label}={i.code}</Tag>
                          ))}
                        </Space>
                      ),
                    },
                  ]}
                />
                <Typography.Title level={5} style={{ marginTop: 16 }}>{t('fields.standardEntityFields')}</Typography.Title>
                <ErpTable
                  rowKey="code"
                  storageKey="dict-entities"
                  dataSource={(dict.data?.entities ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={8}
                  columns={[
                    { title: t('common.entity'), dataIndex: 'label', width: 100, filterType: 'text' },
                    { title: t('common.code'), dataIndex: 'code', width: 110, filterType: 'text' },
                    {
                      title: t('nav.fields'),
                      dataIndex: 'fields',
                      width: 320,
                      render: (fields: unknown) => (
                        <Space wrap>
                          {((fields as string[]) ?? []).map((f) => (
                            <Tag key={f} color="blue">
                              {f}
                            </Tag>
                          ))}
                        </Space>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'fields',
            label: t('common.customFields'),
            children: (
              <Card
                size="small"
                className="crm-panel-fixed crm-block-lg"
                extra={
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
                }
              >
                <ErpTable
                  rowKey="id"
                  storageKey="custom-fields"
                  onRowClick={(row) => {
                    const r = row as unknown as Record<string, unknown>
                    setEditId(String(r.id))
                    form.setFieldsValue(r)
                    setOpen(true)
                  }}
                  loading={listQ.isLoading}
                  dataSource={(listQ.data ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={12}
                  columns={[
                    { title: t('common.object'), dataIndex: 'entity', width: 110, filterType: 'select', filterOptions: [
                      { value: 'ACCOUNT', label: 'ACCOUNT' },
                      { value: 'LEAD', label: 'LEAD' },
                      { value: 'OPPORTUNITY', label: 'OPPORTUNITY' },
                      { value: 'CONTACT', label: 'CONTACT' },
                    ]},
                    { title: t('fields.apiName'), dataIndex: 'apiName', width: 130, filterType: 'text' },
                    { title: t('common.tags'), dataIndex: 'label', width: 110, filterType: 'text', sorter: true },
                    {
                      title: t('common.type'),
                      dataIndex: 'dataType',
                      width: 90,
                      filterType: 'select',
                      filterOptions: ['string', 'number', 'date', 'enum'].map((s) => ({ value: s, label: s })),
                    },
                    {
                      title: t('validation.required'),
                      dataIndex: 'required',
                      width: 70,
                      render: (v) => (v ? <Tag>Y</Tag> : null),
                    },
                    {
                      title: t('common.enabled2'),
                      dataIndex: 'isActive',
                      width: 80,
                      render: (_v, row) => {
                        const r = row as unknown as FieldRow
                        return (
                          <Switch
                            checked={r.isActive}
                            onChange={(on) => toggleM.mutate({ id: r.id, isActive: on })}
                          />
                        )
                      },
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
      <Modal
        title={editId ? t('common.edit') : t('common.create')}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditId(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ entity: 'ACCOUNT', dataType: 'string', required: false }}
          onFinish={(v) => saveM.mutate(v)}
        >
          <Form.Item name="entity" label={t('common.object')}>
            <Select
              disabled={!!editId}
              options={['ACCOUNT', 'LEAD', 'OPPORTUNITY', 'CONTACT'].map((s) => ({
                value: s,
                label: s,
              }))}
            />
          </Form.Item>
          <Form.Item name="apiName" label={t('fields.apiName')} rules={[{ required: true }]}>
            <Input placeholder="customField1" disabled={!!editId} />
          </Form.Item>
          <Form.Item name="label" label={t('common.tags')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="dataType" label={t('common.type')}>
            <Select
              disabled={!!editId}
              options={['string', 'number', 'date', 'enum'].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
          <Form.Item name="required" label={t('validation.required')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
