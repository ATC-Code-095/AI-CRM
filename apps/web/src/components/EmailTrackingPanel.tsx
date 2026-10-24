import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Form, Input, Modal, Progress, Row, Select, Statistic, Tag } from 'antd'
import { AutoFitTable } from '../components/AutoFitTable'
import { useState } from 'react'
import dayjs from 'dayjs'
import { api } from '../api/client'
import { t } from '../i18n'

/** 邮件触达跟踪：发送 + 打开率/点击率（对标 HubSpot Email Tracking） */
export function EmailTrackingPanel() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  const eng = useQuery({
    queryKey: ['email-engagement'],
    queryFn: () =>
      api<{
        total: number
        opened: number
        clicked: number
        openRate: string
        clickRate: string
        recent: {
          id: string
          to: string
          subject: string
          sentAt: string
          openCount: number
          clickCount: number
          status: string
        }[]
      }>('/email-engagement'),
    retry: false,
  })

  const sendM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/email-sends', {
        method: 'POST',
        body: JSON.stringify({
          to: v.to,
          toName: v.toName,
          subject: v.subject,
          body: v.body,
          entityType: v.entityType || 'LEAD',
          entityId: v.entityId || '',
        }),
      }),
    onSuccess: () => {
      message.success(t('cmp.emailTrackingPanel.sentWithOpenClick'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['email-engagement'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Card
      size="small"
      title={t('cmp.emailTrackingPanel.emailTracking')}
      style={{ marginBottom: 12 }}
      extra={
        <Button size="small" type="primary" onClick={() => setOpen(true)}>{t('cmp.emailTrackingPanel.sendEmail')}</Button>
      }
    >
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <Statistic title={t('enum.quote.status.SENT')} value={eng.data?.total ?? 0} />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title={t('common.opens')} value={eng.data?.opened ?? 0} valueStyle={{ color: '#2563eb' }} />
          <Progress percent={Number(eng.data?.openRate ?? 0)} size="small" showInfo />
        </Col>
        <Col xs={12} sm={6}>
          <Statistic title={t('cmp.emailTrackingPanel.clicks')} value={eng.data?.clicked ?? 0} valueStyle={{ color: '#16a34a' }} />
          <Progress percent={Number(eng.data?.clickRate ?? 0)} size="small" strokeColor="#16a34a" showInfo />
        </Col>
        <Col xs={12} sm={6}>
          <div style={{ fontSize: 12, color: '#646A73', marginTop: 8 }}>{t('cmp.emailTrackingPanel.trackingOpenPixelClick')}</div>
          <Tag color="blue">{t('cmp.emailTrackingPanel.autoInjected')}</Tag>
        </Col>
      </Row>
      <AutoFitTable
        style={{ marginTop: 12 }}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 5 }}
        dataSource={eng.data?.recent ?? []}
        columns={[
          {
            title: t('cmp.emailTrackingPanel.recipient'),
            dataIndex: 'to',
            width: 140,
            render: (v: string) => String(v ?? '-'),
          },
          { title: t('common.subject'), dataIndex: 'subject', ellipsis: true },
          {
            title: t('cmp.emailTrackingPanel.sentAt'),
            dataIndex: 'sentAt',
            width: 130,
            render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm') : '-'),
          },
          {
            title: t('common.opens'),
            dataIndex: 'openCount',
            width: 70,
            render: (v: number) => (
              <Tag color={(v ?? 0) > 0 ? 'blue' : 'default'}>{v ?? 0}</Tag>
            ),
          },
          {
            title: t('cmp.emailTrackingPanel.clicks'),
            dataIndex: 'clickCount',
            width: 70,
            render: (v: number) => (
              <Tag color={(v ?? 0) > 0 ? 'green' : 'default'}>{v ?? 0}</Tag>
            ),
          },
          {
            title: t('audit.field.status'),
            dataIndex: 'status',
            width: 90,
            render: (v: string) => (
              <Tag
                color={
                  v === 'CLICKED' ? 'green' : v === 'OPENED' ? 'blue' : v === 'BOUNCED' ? 'red' : 'default'
                }
              >
                {v}
              </Tag>
            ),
          },
        ]}
      />
      <Modal
        title={t('cmp.emailTrackingPanel.sendTrackedEmail')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={sendM.isPending}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={(v) => sendM.mutate(v)}>
          <Form.Item name="to" label={t('cmp.emailTrackingPanel.recipientEmail')} rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="client@example.com" />
          </Form.Item>
          <Form.Item name="toName" label={t('cmp.emailTrackingPanel.recipient')}>
            <Input placeholder={t('cmp.emailTrackingPanel.mrZhang')} />
          </Form.Item>
          <Form.Item name="subject" label={t('common.subject')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="body" label={t('cmp.emailTrackingPanel.bodyHtmlSupportedLinks')} rules={[{ required: true }]}>
            <Input.TextArea rows={5} placeholder={t('cmp.emailTrackingPanel.clickTheProposalFor')} />
          </Form.Item>
          <Form.Item name="entityType" label={t('cmp.emailTrackingPanel.relatedType')} initialValue="LEAD">
            <Select
              options={[
                { value: 'LEAD', label: t('nav.leads') },
                { value: 'ACCOUNT', label: t('nav.accounts') },
                { value: 'OPPORTUNITY', label: t('nav.opportunities') },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
