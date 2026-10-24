import { useMutation } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, InputNumber } from 'antd'
import { useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

interface Props {
  accountId: string
  onDone?: () => void
}

export function CreateOpportunityButton({ accountId, onDone }: Props) {
  const { message } = App.useApp()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          ...v,
          accountId,
          amount: String(v.amount ?? 0),
          expectedCloseDate: v.expectedCloseDate
            ? String(v.expectedCloseDate)
            : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        }),
      }),
    onSuccess: () => {
      message.success(t('cmp.createOpportunityButton.dealCreated'))
      setOpen(false)
      form.resetFields()
      onDone?.()
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <>
      <Button size="small" type="primary" onClick={() => setOpen(true)}>{t('common.newDeal')}</Button>
      <Modal
        title={t('common.newDeal')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ amount: 0, expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amount" label={t('audit.field.amount')}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="expectedCloseDate" label={t('common.expectedCloseDate')}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="nextStep" label={t('account.nextAction')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
