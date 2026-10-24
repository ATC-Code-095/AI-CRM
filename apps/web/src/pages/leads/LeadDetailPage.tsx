import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Collapse,
  Form,
  Input,
  List,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { CustomFieldsBox } from '../../components/CustomFieldsBox'
import { StarButton } from '../../components/StarButton'

interface Lead {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  status: string
  source: string
  score: number
  remark: string | null
  nextFollowAt: string | null
}

interface Activity {
  id: string
  type: string
  subject: string
  status: string
  content: string | null
  createdAt: string
}

export default function LeadDetailPage() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [noteOpen, setNoteOpen] = useState(false)
  const [form] = Form.useForm()

  const detail = useQuery({
    queryKey: ['lead', id],
    queryFn: () => api<Lead>(`/leads/${id}`),
    enabled: !!id,
  })
  const acts = useQuery({
    queryKey: ['lead-acts', id],
    queryFn: () => api<Activity[]>(`/leads/${id}/activities`),
    enabled: !!id,
  })

  const noteM = useMutation({
    mutationFn: (v: { subject: string; content?: string }) =>
      api(`/leads/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: 'NOTE', ...v }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setNoteOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['lead-acts', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const convertM = useMutation({
    mutationFn: () =>
      api(`/leads/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'create_account', createOpportunity: false }),
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['lead', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const closeM = useMutation({
    mutationFn: () =>
      api(`/leads/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ reason: t('leads.noIntentForNow') }),
      }),
    onSuccess: () => {
      message.success(t('enum.lead.status.CLOSED_LOST'))
      void qc.invalidateQueries({ queryKey: ['lead', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (!detail.data) return null
  const lead = detail.data

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {lead.name} <Tag>{t(`enum.lead.status.${lead.status}`)}</Tag>
        <StarButton type="LEAD" id={lead.id} name={lead.name} />
      </Typography.Title>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => setNoteOpen(true)}>{t('leads.quickFollowUp')}</Button>
        <Button disabled={lead.status === 'CONVERTED'} onClick={() => convertM.mutate()}>{t('common.convert')}</Button>
        <Button
          danger
          disabled={lead.status === 'CONVERTED' || lead.status === 'CLOSED_LOST'}
          onClick={() => closeM.mutate()}
        >{t('common.close')}</Button>
        <Link to="/leads">{t('common.back')}</Link>
      </Space>
      <Collapse
        items={[
          {
            key: '1',
            label: t('common.basicInfo'),
            children: (
              <div>
                <div>{t('leads.contact2', { v: lead.contactName ?? '-' })}</div>
                <div>{t('common.phone', { v: lead.phone ?? '-' })}</div>
                <div>{t('common.email2', { v: lead.email ?? '-' })}</div>
                <div>{t('leads.source2', { source: lead.source })}</div>
                <div>{t('leads.score', { score: lead.score })}</div>
                <div>{t('leads.remark', { v: lead.remark ?? '-' })}</div>
              </div>
            ),
          },
        ]}
      />
      <CustomFieldsBox
        entityType="LEAD"
        entityId={lead.id}
        customValues={(lead as unknown as { customValues?: Record<string, unknown> }).customValues ?? null}
      />
      <Typography.Title level={5} style={{ marginTop: 16 }}>{t('leads.followUpRecords')}</Typography.Title>
      <List
        dataSource={acts.data ?? []}
        renderItem={(a) => (
          <List.Item>
            <List.Item.Meta
              title={
                <>
                  <Tag>{a.type}</Tag> {a.subject}
                </>
              }
              description={a.content}
            />
          </List.Item>
        )}
      />
      <Modal
        title={t('leads.quickFollowUp')}
        open={noteOpen}
        onCancel={() => setNoteOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={noteM.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => noteM.mutate(v)}>
          <Form.Item name="subject" label={t('common.subject')} rules={[{ required: true }]}>
            <Input placeholder={t('leads.phoneCallVisit')} />
          </Form.Item>
          <Form.Item name="content" label={t('common.content')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
