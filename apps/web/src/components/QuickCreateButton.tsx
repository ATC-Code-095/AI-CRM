import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EntityPicker } from './EntityPicker'
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { t } from '../i18n'

type Kind = 'LEAD' | 'ACCOUNT' | 'CONTACT' | 'OPPORTUNITY' | 'ACTIVITY'

const TITLES: Record<Kind, string> = {
  LEAD: t('common.newLead'),
  ACCOUNT: t('common.newAccount'),
  CONTACT: t('common.newContact'),
  OPPORTUNITY: t('common.newDeal'),
  ACTIVITY: t('common.newFollowUp'),
}

/** 顶栏/首页快捷新建：线索 / 客户 / 商机 / 跟进 */
export function QuickCreateButton({ kind, size = 'small' }: { kind?: Kind; size?: 'small' | 'middle' }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Kind>(kind ?? 'LEAD')
  const [form] = Form.useForm()

  // 客户下拉：商机与联系人都需要选择所属客户（不再手输 ID）
  // 快捷键 c → 打开快捷新建
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('crm:quick-create', onOpen)
    return () => window.removeEventListener('crm:quick-create', onOpen)
  }, [])

  const accountsQ = useQuery({
    queryKey: ['qc-accounts'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=100'),
    enabled: open && (selected === 'OPPORTUNITY' || selected === 'CONTACT'),
    retry: false,
  })
  const accountOptions = (accountsQ.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      if (selected === 'LEAD') {
        return api('/leads', {
          method: 'POST',
          body: JSON.stringify({
            name: v.name,
            contactName: v.contactName,
            phone: v.phone,
            email: v.email,
            source: v.source ?? 'PHONE',
            expectedAmount: v.expectedAmount != null ? String(v.expectedAmount) : undefined,
            remark: v.remark,
          }),
        })
      }
      if (selected === 'ACCOUNT') {
        return api('/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: v.name,
            industry: v.industry,
            phone: v.phone,
            website: v.website,
            remark: v.remark,
          }),
        })
      }
      if (selected === 'CONTACT') {
        return api(`/accounts/${String(v.accountId)}/contacts`, {
          method: 'POST',
          body: JSON.stringify({
            name: v.name,
            title: v.title,
            mobile: v.mobile,
            email: v.email,
            decisionRole: v.decisionRole,
            isPrimary: !!v.isPrimary,
          }),
        })
      }
      if (selected === 'OPPORTUNITY') {
        return api('/opportunities', {
          method: 'POST',
          body: JSON.stringify({
            name: v.name,
            accountId: v.accountId,
            amount: String(v.amount ?? 0),
            expectedCloseDate: v.expectedCloseDate
              ? dayjs(v.expectedCloseDate as string).format('YYYY-MM-DD')
              : dayjs().add(30, 'day').format('YYYY-MM-DD'),
            nextStep: v.nextStep,
          }),
        })
      }
      return api('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: v.type ?? 'CALL',
          subject: v.subject,
          content: v.content,
          entityType: v.entityType ?? 'ACCOUNT',
          entityId: v.entityId ?? '',
          dueAt: v.dueAt ? dayjs(v.dueAt as string).toISOString() : undefined,
        }),
      })
    },
    onSuccess: () => {
      message.success(t('cmp.quickCreateButton.createdSuccessfully'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries()
      if (selected === 'LEAD') nav('/leads')
      else if (selected === 'ACCOUNT') nav('/accounts')
      else if (selected === 'CONTACT') nav('/contacts')
      else if (selected === 'OPPORTUNITY') nav('/opportunities')
      else nav('/activities')
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <>
      <Button type="primary" size={size} onClick={() => setOpen(true)}>
        {size === 'small' ? t('cmp.quickCreateButton.quickCreate') : t('command.quickCreate')}
      </Button>
      <Modal
        title={TITLES[selected]}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
        width={520}
      >
        {!kind && (
          <Space style={{ marginBottom: 12 }} wrap>
            {(Object.keys(TITLES) as Kind[]).map((k) => (
              <Button
                key={k}
                size="small"
                type={selected === k ? 'primary' : 'default'}
                onClick={() => {
                  setSelected(k)
                  form.resetFields()
                }}
              >
                {TITLES[k]}
              </Button>
            ))}
          </Space>
        )}
        <Form form={form} layout="vertical" onFinish={(v) => createM.mutate(v)}>
          {selected === 'LEAD' && (
            <>
              <Form.Item name="name" label={t('common.leadName')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="contactName" label={t('nav.contacts')}>
                <Input />
              </Form.Item>
              <Form.Item name="phone" label={t('enum.activity.type.CALL')}>
                <Input />
              </Form.Item>
              <Form.Item name="source" label={t('common.source')} initialValue="PHONE">
                <Select
                  options={[
                    { value: 'WEB_FORM', label: t('common.websiteForm') },
                    { value: 'PHONE', label: t('enum.activity.type.CALL') },
                    { value: 'REFERRAL', label: t('common.referral') },
                    { value: 'EXHIBITION', label: t('common.tradeShow') },
                    { value: 'OTHER', label: t('common.other') },
                  ]}
                />
              </Form.Item>
            </>
          )}
          {selected === 'ACCOUNT' && (
            <>
              <Form.Item name="name" label={t('common.accountName')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="industry" label={t('common.industry')}>
                <Input />
              </Form.Item>
              <Form.Item name="phone" label={t('enum.activity.type.CALL')}>
                <Input />
              </Form.Item>
            </>
          )}
          {selected === 'OPPORTUNITY' && (
            <>
              <Form.Item name="name" label={t('common.dealName')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="accountId" label={t('nav.accounts')} rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('cmp.quickCreateButton.searchAndSelectAn')}
                  options={accountOptions}
                  loading={accountsQ.isLoading}
                />
              </Form.Item>
              <Form.Item name="amount" label={t('audit.field.amount')}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
              <Form.Item name="expectedCloseDate" label={t('common.expectedCloseDate')}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          {selected === 'CONTACT' && (
            <>
              <Form.Item name="accountId" label={t('common.account')} rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('cmp.quickCreateButton.searchAndSelectAn')}
                  options={accountOptions}
                  loading={accountsQ.isLoading}
                />
              </Form.Item>
              <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="title" label={t('common.jobTitle')}>
                <Input />
              </Form.Item>
              <Form.Item name="decisionRole" label={t('common.decisionRole')}>
                <Select
                  allowClear
                  options={[
                    { value: 'ECONOMIC', label: t('contacts.role.economic') },
                    { value: 'CHAMPION', label: t('contacts.role.champion') },
                    { value: 'TECH', label: t('common.technicalEvaluator') },
                    { value: 'USER', label: t('common.user') },
                    { value: 'OTHER', label: t('common.other') },
                  ]}
                />
              </Form.Item>
              <Form.Item name="mobile" label={t('common.mobile')}>
                <Input />
              </Form.Item>
              <Form.Item name="email" label={t('common.email')}>
                <Input />
              </Form.Item>
            </>
          )}
          {selected === 'ACTIVITY' && (
            <>
              <Form.Item name="subject" label={t('common.subject')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="type" label={t('common.type')} initialValue="CALL">
                <Select
                  options={[
                    { value: 'CALL', label: t('enum.activity.type.CALL') },
                    { value: 'VISIT', label: t('enum.activity.type.VISIT') },
                    { value: 'EMAIL', label: t('enum.activity.type.EMAIL') },
                    { value: 'TASK', label: t('enum.activity.type.TASK') },
                    { value: 'NOTE', label: t('enum.activity.type.NOTE') },
                  ]}
                />
              </Form.Item>
              <Form.Item name="entity" label={t('common.relatedRecord')}>
                <EntityPicker
                  value={
                    form.getFieldValue('entityId')
                      ? {
                          entityType: form.getFieldValue('entityType') ?? 'ACCOUNT',
                          entityId: form.getFieldValue('entityId'),
                        }
                      : null
                  }
                  onChange={(v) => {
                    form.setFieldValue('entityType', v?.entityType ?? 'ACCOUNT')
                    form.setFieldValue('entityId', v?.entityId ?? '')
                  }}
                />
              </Form.Item>
              <Form.Item name="dueAt" label={t('cmp.quickCreateButton.scheduledTime')}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  )
}
