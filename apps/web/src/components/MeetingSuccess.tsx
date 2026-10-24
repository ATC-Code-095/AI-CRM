import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, DatePicker, Form, Input, List, Modal, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

interface Meeting {
  id: string
  title: string
  heldAt: string
  attendees: string
  agenda: string
  decisions: string
  actions: string
  actionList?: { text: string; owner: string; due: string; done: boolean }[]
  createdBy: string
}

/** 销售会议纪要：议题 / 决议 / 行动项 */
export function MeetingMinutesBox({
  entityType,
  entityId,
}: {
  entityType: string
  entityId: string
}) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['meetings', entityType, entityId],
    queryFn: () =>
      api<{ items: Meeting[]; total: number }>(
        `/meetings?entityType=${entityType}&entityId=${entityId}`,
      ),
    retry: false,
  })

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          ...v,
          entityType,
          entityId,
          heldAt: v.heldAt ? dayjs(v.heldAt as string).toISOString() : undefined,
        }),
      }),
    onSuccess: () => {
      message.success(t('cmp.meetingSuccess.minutesSaved'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['meetings', entityType, entityId] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Card
      size="small"
      title={t('cmp.meetingSuccess.meetingMinutes')}
      style={{ marginBottom: 12 }}
      extra={
        <Button size="small" type="primary" onClick={() => setOpen(true)}>{t('cmp.meetingSuccess.newMinutes')}</Button>
      }
    >
      <List
        size="small"
        dataSource={listQ.data?.items ?? []}
        locale={{ emptyText: t('cmp.meetingSuccess.noMeetingMinutes') }}
        renderItem={(m: Meeting) => (
          <List.Item
            actions={[
              <Button
                key="del"
                size="small"
                danger
                onClick={() => {
                  void api(`/meetings/${m.id}`, { method: 'DELETE' }).then(() =>
                    qc.invalidateQueries({ queryKey: ['meetings', entityType, entityId] }),
                  )
                }}
              >{t('common.delete')}</Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <b>{m.title}</b>
                  <Tag>{(m.heldAt ?? '').slice(0, 10)}</Tag>
                  <span style={{ color: '#8b919a', fontSize: 12 }}>{m.createdBy}</span>
                </Space>
              }
              description={
                <div style={{ fontSize: 12 }}>
                  {m.attendees ? <div>{t('cmp.meetingSuccess.attendees', { attendees: m.attendees })}</div> : null}
                  {m.agenda ? <div>{t('cmp.meetingSuccess.agenda', { agenda: m.agenda })}</div> : null}
                  {m.decisions ? <div>{t('cmp.meetingSuccess.decisions', { decisions: m.decisions })}</div> : null}
                  {m.actions || m.actionList?.length ? (
                    <div>
                      <Tag color="orange">{t('common.actions2')}</Tag>
                      {(m.actionList ?? []).map((a, i) => (
                        <div key={i} style={{ marginLeft: 8 }}>
                          <Tag color={a.done ? 'green' : 'default'}>{a.done ? t('common.done') : t('nav.todos')}</Tag>
                          {a.text}
                          <Button
                            size="small"
                            type="link"
                            onClick={() => {
                              void api('/meeting-actions/toggle', {
                                method: 'POST',
                                body: JSON.stringify({ meetingId: m.id, index: i }),
                              }).then(() =>
                                qc.invalidateQueries({ queryKey: ['meetings', entityType, entityId] }),
                              )
                            }}
                          >{t('common.toggle')}</Button>
                        </div>
                      ))}
                      {!m.actionList?.length && m.actions}
                    </div>
                  ) : null}
                </div>
              }
            />
          </List.Item>
        )}
      />

      <Modal
        title={t('cmp.meetingSuccess.newMeetingMinutes')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createM.mutate(v)}>
          <Form.Item name="title" label={t('cmp.meetingSuccess.meetingSubject')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="heldAt" label={t('cmp.meetingSuccess.meetingTime')} initialValue={dayjs()}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="attendees" label={t('cmp.meetingSuccess.attendees2')}>
            <Input placeholder={t('common.commaSeparated')} />
          </Form.Item>
          <Form.Item name="agenda" label={t('cmp.meetingSuccess.agenda2')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="decisions" label={t('cmp.meetingSuccess.decisions2')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="actions" label={t('cmp.meetingSuccess.actionItems')}>
            <Input.TextArea rows={2} placeholder={t('cmp.meetingSuccess.whoWhatWhen')} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

/** 客户成功计划：目标 / 里程碑 / 采纳度 */
export function SuccessPlanBox({ accountId }: { accountId: string }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const [editing, setEditing] = useState(false)

  const q = useQuery({
    queryKey: ['success-plan', accountId],
    queryFn: () =>
      api<{
        goals: string
        milestones: { text: string; done: boolean }[]
        adoption: number
        champion: string
        risks: string
        nextReview: string
      }>(`/accounts/${accountId}/success-plan`),
    enabled: !!accountId,
    retry: false,
  })

  const saveM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api(`/accounts/${accountId}/success-plan`, {
        method: 'PUT',
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      message.success(t('cmp.meetingSuccess.successPlanSaved'))
      setEditing(false)
      void qc.invalidateQueries({ queryKey: ['success-plan', accountId] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Card
      size="small"
      title={t('cmp.meetingSuccess.customerSuccessPlan')}
      style={{ marginBottom: 12 }}
      extra={
        editing ? (
          <Space>
            <Button size="small" type="primary" loading={saveM.isPending} onClick={() => form.submit()}>{t('common.save')}</Button>
            <Button size="small" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          </Space>
        ) : (
          <Button
            size="small"
            onClick={() => {
              form.setFieldsValue({
                goals: q.data?.goals ?? '',
                champion: q.data?.champion ?? '',
                risks: q.data?.risks ?? '',
                nextReview: q.data?.nextReview ?? '',
                adoption: q.data?.adoption ?? 0,
                milestonesText: (q.data?.milestones ?? [])
                  .map((m) => `${m.done ? '[x]' : '[ ]'} ${m.text}`)
                  .join('\n'),
              })
              setEditing(true)
            }}
          >{t('common.edit')}</Button>
        )
      }
    >
      {editing ? (
        <Form
          form={form}
          layout="vertical"
          size="small"
          onFinish={(v) =>
            saveM.mutate({
              goals: v.goals,
              champion: v.champion,
              risks: v.risks,
              nextReview: v.nextReview,
              adoption: Number(v.adoption ?? 0),
              milestones: String(v.milestonesText ?? '')
                .split('\n')
                .map((line: string) => line.trim())
                .filter(Boolean)
                .map((line: string) => ({
                  done: line.startsWith('[x]') || line.startsWith('[X]'),
                  text: line.replace(/^\[[ xX]\]\s*/, ''),
                })),
            })
          }
        >
          <Form.Item name="goals" label={t('cmp.meetingSuccess.successGoals')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="champion" label={t('cmp.meetingSuccess.internalChampions')}>
            <Input />
          </Form.Item>
          <Form.Item name="adoption" label={t('cmp.meetingSuccess.productAdoption0100')}>
            <Input type="number" min={0} max={100} />
          </Form.Item>
          <Form.Item name="milestonesText" label={t('cmp.meetingSuccess.milestonesOnePerLine')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="risks" label={t('common.atRisk2')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="nextReview" label={t('cmp.meetingSuccess.nextReviewDate')}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
        </Form>
      ) : (
        <div style={{ fontSize: 12 }}>
          <div>
            <b>{t('cmp.meetingSuccess.goal')}</b>
            {q.data?.goals || t('cmp.meetingSuccess.notSet')}
          </div>
          <div>
            <b>{t('cmp.meetingSuccess.champions')}</b>
            {t('cmp.meetingSuccess.adoption', { v: q.data?.champion || '-', v2: q.data?.adoption ?? 0 })}</div>
          <div>
            <b>{t('cmp.meetingSuccess.milestones')}</b>
            {(q.data?.milestones ?? []).length
              ? (q.data!.milestones ?? []).map((m: { text: string; done: boolean }, i: number) => (
                  <div key={i}>
                    <Tag color={m.done ? 'green' : 'default'}>{m.done ? t('common.done') : t('common.inProgress')}</Tag>
                    {m.text}
                  </div>
                ))
              : t('cmp.meetingSuccess.notSet2')}
          </div>
          <div>
            <b>{t('common.risk')}</b>
            {q.data?.risks || '-'}
          </div>
          <div>
            <b>{t('cmp.meetingSuccess.nextReview')}</b>
            {q.data?.nextReview || '-'}
          </div>
        </div>
      )}
    </Card>
  )
}
