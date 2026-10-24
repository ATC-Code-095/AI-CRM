import { useMutation } from '@tanstack/react-query'
import { App, Checkbox, Form, Input, Modal, Select } from 'antd'
import { useState } from 'react'
import { api } from '../../api/client'
import { t } from '../../i18n'

interface Props {
  leadId: string | null
  open: boolean
  onClose: () => void
  onDone: () => void
}

export function LeadConvertModal({ leadId, open, onClose, onDone }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [force, setForce] = useState(false)

  const convertM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api<{ accountId: string; contactId: string; opportunityId: string | null }>(
        `/leads/${leadId}/convert`,
        {
          method: 'POST',
          body: JSON.stringify({
            mode: v.mode || 'create_account',
            accountName: v.accountName,
            existingAccountId: v.existingAccountId,
            contactName: v.contactName,
            mobile: v.mobile,
            createOpportunity: v.createOpportunity ?? true,
            opportunityName: v.opportunityName,
            amount: v.amount ? String(v.amount) : '0',
            expectedCloseDate: v.expectedCloseDate
              ? String(v.expectedCloseDate).slice(0, 10)
              : undefined,
            forceCreate: force,
          }),
        },
      ),
    onSuccess: (r) => {
      message.success(t('leads.converted', { accountId: r.accountId }))
      form.resetFields()
      setForce(false)
      onDone()
      onClose()
    },
    onError: (e: Error) => {
      if (/duplicate/i.test(e.message)) {
        message.warning(t('leads.duplicateAccountNameCheck'))
      } else {
        message.error(e.message)
      }
    },
  })

  return (
    <Modal
      title={t('leads.convertLead')}
      open={open}
      onCancel={() => {
        setForce(false)
        onClose()
      }}
      onOk={() => form.submit()}
      confirmLoading={convertM.isPending}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ mode: 'create_account', createOpportunity: true }}
        onFinish={(v) => convertM.mutate(v)}
      >
        <Form.Item name="mode" label={t('leads.method')}>
          <Select
            options={[
              { value: 'create_account', label: t('common.newAccount') },
              { value: 'link_account', label: t('leads.linkExistingAccount') },
            ]}
          />
        </Form.Item>
        <Form.Item name="accountName" label={t('common.accountName')}>
          <Input placeholder={t('leads.defaultsToLeadName')} />
        </Form.Item>
        <Form.Item name="contactName" label={t('nav.contacts')}>
          <Input />
        </Form.Item>
        <Form.Item name="mobile" label={t('common.mobile')}>
          <Input />
        </Form.Item>
        <Form.Item name="createOpportunity" valuePropName="checked">
          <Checkbox>{t('leads.alsoCreateADeal')}</Checkbox>
        </Form.Item>
        <Form.Item name="opportunityName" label={t('common.dealName')}>
          <Input />
        </Form.Item>
        <Form.Item name="amount" label={t('audit.field.amount')}>
          <Input type="number" />
        </Form.Item>
        <Form.Item name="expectedCloseDate" label={t('common.expectedCloseDate')}>
          <Input type="date" />
        </Form.Item>
        <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)}>{t('leads.forceCreateOnDuplicate')}</Checkbox>
      </Form>
    </Modal>
  )
}
