import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ShareAltOutlined,
  ThunderboltOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { useSharedPref, useUserPref } from '../../hooks/useUserPref'
import { t } from '../../i18n'

interface CadenceStep {
  id: string
  dayOffset: number
  type: 'CALL' | 'VISIT' | 'EMAIL' | 'TASK' | 'NOTE'
  subject: string
  content?: string
}

interface Cadence {
  id: string
  name: string
  desc?: string
  steps: CadenceStep[]
  createdAt: string
  shared?: boolean
}

const TYPE_LABEL: Record<string, string> = {
  CALL: t('enum.activity.type.CALL'),
  VISIT: t('enum.activity.type.VISIT'),
  EMAIL: t('enum.activity.type.EMAIL'),
  TASK: t('enum.activity.type.TASK'),
  NOTE: t('enum.activity.type.NOTE'),
}


const PLANS_KEY = 'cadence.plans'
const SHARED_KEY = 'shared.cadence.plans'

function blankStep(dayOffset = 0): CadenceStep {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dayOffset,
    type: 'CALL',
    subject: '',
    content: '',
  }
}

/**
 * 跟进计划（Cadence）——对标 Outreach / Salesloft 序列、纷享销客「跟进计划」
 * 计划存用户偏好（可共享给团队），启动后按「第 N 天」批量生成跟进活动。
 */
export default function CadencePage() {
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const { value: plans, ready } = useUserPref<Cadence[]>(PLANS_KEY, [])
  const { items: sharedItems } = useSharedPref<Cadence[]>(SHARED_KEY)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<Cadence | null>(null)
  const [form] = Form.useForm()
  const [steps, setSteps] = useState<CadenceStep[]>([blankStep(0)])
  const [shareIt, setShareIt] = useState(false)

  const [runPlan, setRunPlan] = useState<Cadence | null>(null)
  const [targetType, setTargetType] = useState<'LEAD' | 'ACCOUNT'>('LEAD')
  const [targetIds, setTargetIds] = useState<string[]>([])

  const leadsQ = useQuery({
    queryKey: ['cadence-leads'],
    queryFn: () => api<{ items: { id: string; name: string; status: string }[] }>('/leads?pageSize=100'),
    enabled: !!runPlan && targetType === 'LEAD',
    retry: false,
  })
  const accountsQ = useQuery({
    queryKey: ['cadence-accounts'],
    queryFn: () =>
      api<{ items: { id: string; name: string; level: string }[] }>('/accounts?pageSize=100'),
    enabled: !!runPlan && targetType === 'ACCOUNT',
    retry: false,
  })

  const savePref = useMutation({
    mutationFn: (p: { key: string; value: unknown }) =>
      api('/preferences', { method: 'PUT', body: JSON.stringify(p) }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['pref', v.key] })
      void qc.invalidateQueries({ queryKey: ['pref-shared', SHARED_KEY] })
    },
  })

  const openEditor = (plan?: Cadence) => {
    setEditing(plan ?? null)
    form.setFieldsValue({ name: plan?.name ?? '', desc: plan?.desc ?? '' })
    setSteps(plan?.steps?.length ? plan.steps : [blankStep(0)])
    setShareIt(false)
    setEditOpen(true)
  }

  const savePlan = () => {
    form
      .validateFields()
      .then((v) => {
        const clean = steps
          .filter((s) => s.subject.trim())
          .map((s, i) => ({ ...s, subject: s.subject.trim(), dayOffset: Number(s.dayOffset) || 0, order: i }))
        if (!clean.length) {
          message.warning(t('cadence.enterASubjectFor'))
          return
        }
        const plan: Cadence = {
          id: editing?.id ?? `c-${Date.now()}`,
          name: String(v.name).trim(),
          desc: v.desc ? String(v.desc) : undefined,
          steps: clean,
          createdAt: editing?.createdAt ?? new Date().toISOString(),
          shared: shareIt,
        }
        const next = [...plans.filter((p) => p.id !== plan.id), plan]
        savePref.mutate({ key: PLANS_KEY, value: next })
        if (shareIt) savePref.mutate({ key: SHARED_KEY, value: [plan] })
        message.success(shareIt ? t('cadence.cadenceSavedAndShared') : t('cadence.cadenceSaved'))
        setEditOpen(false)
      })
      .catch(() => undefined)
  }

  const removePlan = (plan: Cadence) => {
    modal.confirm({
      title: t('cadence.deleteCadence'),
      content: t('cadence.deleteFollowUpsAlready', { name: plan.name }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        savePref.mutate({ key: PLANS_KEY, value: plans.filter((p) => p.id !== plan.id) })
        message.success(t('common.deleted'))
      },
    })
  }

  const toggleShare = (plan: Cadence) => {
    const on = !plan.shared
    const next = plans.map((p) => (p.id === plan.id ? { ...p, shared: on } : p))
    savePref.mutate({ key: PLANS_KEY, value: next })
    if (on) savePref.mutate({ key: SHARED_KEY, value: [{ ...plan, shared: true }] })
    message.success(on ? t('common.sharedWithTeam') : t('cadence.unshared'))
  }

  const targets = targetType === 'LEAD' ? (leadsQ.data?.items ?? []) : (accountsQ.data?.items ?? [])
  const willCreate = (runPlan?.steps.length ?? 0) * targetIds.length

  const startPlan = useMutation({
    mutationFn: async () => {
      if (!runPlan || !targetIds.length) throw new Error(t('cadence.pleaseSelectACadence'))
      const now = Date.now()
      const items = targetIds.flatMap((entityId) =>
        runPlan.steps.map((s) => ({
          type: s.type,
          subject: `[${runPlan.name}] ${s.subject}`,
          content: s.content ?? '',
          entityType: targetType,
          entityId,
          dueAt: new Date(now + s.dayOffset * 86400000).toISOString(),
        })),
      )
      return api<{ created: number }>('/activities/batch', {
        method: 'POST',
        body: JSON.stringify({ items }),
      })
    },
    onSuccess: (r) => {
      message.success(t('cadence.generatedFollowUpsFrom', { created: r.created }))
      setRunPlan(null)
      setTargetIds([])
      void qc.invalidateQueries({ queryKey: ['calendar-activities'] })
      void qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const sharedPlans = sharedItems.filter((i) => !i.mine).flatMap((i) => i.value ?? [])
  const mySharedCount = plans.filter((p) => p.shared).length

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('cadence.cadences')}</Typography.Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, borderRadius: 10 }}
        message={t('cadence.planCallVisitEmail')}
        description={t('cadence.cadencesAreSavedIn')}
      />

      <div className="crm-grid crm-cols-2 crm-h-md">
        <Card
          size="small"
          title={t('cadence.myCadences', { v: plans.length ? `(${plans.length})` : '' })}
          extra={
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>{t('cadence.newCadence')}</Button>
          }
        >
          {!ready ? (
            <div className="crm-muted">{t('common.loading')}</div>
          ) : plans.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cadence.noCadencesYetTry')}>
              <Button size="small" type="primary" onClick={() => openEditor()}>{t('cadence.newCadence')}</Button>
            </Empty>
          ) : (
            plans.map((p) => (
              <div className="crm-cadence-row" key={p.id}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={6} wrap>
                    <b>{p.name}</b>
                    <Tag bordered={false}>{t('cadence.steps', { length: p.steps.length })}</Tag>
                    {p.shared ? (
                      <Tag icon={<ShareAltOutlined />} color="blue" bordered={false}>{t('cadence.teamVisible')}</Tag>
                    ) : null}
                  </Space>
                  <div className="crm-muted" style={{ marginTop: 4, fontSize: 12 }}>
                    {p.desc ? `${p.desc} · ` : ''}
                    {p.steps
                      .slice(0, 4)
                      .map((s) => `D+${s.dayOffset} ${TYPE_LABEL[s.type] ?? s.type}`)
                      .join(' → ')}
                    {p.steps.length > 4 ? ' → …' : ''}
                  </div>
                </div>
                <Space size={2}>
                  <Tooltip title={t('cadence.launchCadence')}>
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={() => {
                        setRunPlan(p)
                        setTargetIds([])
                      }}
                    />
                  </Tooltip>
                  <Tooltip title={p.shared ? t('cadence.unshare') : t('cadence.shareWithTeam')}>
                    <Button
                      size="small"
                      type="text"
                      icon={<ShareAltOutlined />}
                      onClick={() => toggleShare(p)}
                    />
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEditor(p)} />
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removePlan(p)}
                    />
                  </Tooltip>
                </Space>
              </div>
            ))
          )}
        </Card>

        <Card
          size="small"
          title={t('cadence.teamSharedCadences')}
          extra={<Tag color="blue">{sharedPlans.length}</Tag>}
          className="crm-cadence-shared"
        >
          {mySharedCount > 0 && (
            <div className="crm-muted" style={{ marginBottom: 8, fontSize: 12 }}>{t('cadence.youHaveSharedCadences', { mySharedCount })}</div>
          )}
          {sharedPlans.length === 0 ? (
            <div className="crm-muted">
              {mySharedCount > 0
                ? t('cadence.noCadencesSharedBy')
                : t('cadence.noSharedCadencesAfter')}
            </div>
          ) : (
            sharedPlans.map((p) => (
              <div className="crm-cadence-row" key={p.id}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Space size={6} wrap>
                    <b>{p.name}</b>
                    <Tag bordered={false}>{t('cadence.steps', { length: p.steps.length })}</Tag>
                  </Space>
                  <div className="crm-muted" style={{ marginTop: 4, fontSize: 12 }}>
                    {p.steps
                      .slice(0, 4)
                      .map((s) => `D+${s.dayOffset} ${TYPE_LABEL[s.type] ?? s.type}`)
                      .join(' → ')}
                  </div>
                </div>
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => {
                    setRunPlan(p)
                    setTargetIds([])
                  }}
                >{t('cadence.launch')}</Button>
              </div>
            ))
          )}
        </Card>
      </div>

      <Modal
        title={editing ? t('cadence.editCadence', { name: editing.name }) : t('cadence.newCadence2')}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={savePlan}
        confirmLoading={savePref.isPending}
        width={720}
        okText={t('common.save')}
      >
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex', gap: 12 }} align="start">
            <Form.Item name="name" label={t('cadence.cadenceName')} rules={[{ required: true }]} style={{ width: 260 }}>
              <Input placeholder={t('cadence.eGNewLead')} />
            </Form.Item>
            <Form.Item name="desc" label={t('common.notes')} style={{ flex: 1 }}>
              <Input placeholder={t('cadence.useCaseOptional')} />
            </Form.Item>
          </Space>
        </Form>
        <div className="crm-cadence-steps-head">
          <b>{t('cadence.steps2')}</b>
          <span className="crm-muted">{t('cadence.dayNIsThe')}</span>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setSteps((prev) => [...prev, blankStep((prev.at(-1)?.dayOffset ?? 0) + 3)])}
          >{t('cadence.addStep')}</Button>
        </div>
        <div className="crm-cadence-steps">
          {steps.map((s, i) => (
            <div className="crm-cadence-step" key={s.id}>
              <span className="crm-cadence-day">
                <span className="crm-cadence-day-prefix">D+</span>
                <InputNumber
                  size="small"
                  min={0}
                  max={180}
                  value={s.dayOffset}
                  onChange={(v) =>
                    setSteps((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, dayOffset: Number(v ?? 0) } : x)),
                    )
                  }
                  style={{ width: 76 }}
                />
              </span>
              <Select
                size="small"
                style={{ width: 100 }}
                value={s.type}
                onChange={(v) => setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, type: v } : x)))}
                options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
              <Input
                size="small"
                placeholder={t('cadence.subjectEGCall')}
                value={s.subject}
                onChange={(e) =>
                  setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))
                }
              />
              <Input
                size="small"
                placeholder={t('cadence.talkTrackNoteOptional')}
                value={s.content}
                onChange={(e) =>
                  setSteps((prev) => prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                }
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
              />
            </div>
          ))}
        </div>
        <Checkbox
          style={{ marginTop: 12 }}
          checked={shareIt}
          onChange={(e) => setShareIt(e.target.checked)}
        >{t('cadence.shareWithTeamColleagues')}</Checkbox>
      </Modal>

      <Modal
        title={t('cadence.launchCadence2', { v: runPlan?.name ?? '' })}
        open={!!runPlan}
        onCancel={() => setRunPlan(null)}
        onOk={() => startPlan.mutate()}
        confirmLoading={startPlan.isPending}
        okText={willCreate ? t('cadence.createFollowUps', { willCreate }) : t('common.createFollowUp')}
        okButtonProps={{ disabled: !targetIds.length }}
        width={760}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            size="small"
            value={targetType}
            onChange={(v) => {
              setTargetType(v)
              setTargetIds([])
            }}
            style={{ width: 120 }}
            options={[
              { value: 'LEAD', label: t('nav.leads') },
              { value: 'ACCOUNT', label: t('nav.accounts') },
            ]}
          />
          <Tag icon={<ThunderboltOutlined />} color="blue">
            {t('cadence.stepsTarget', { v: runPlan?.steps.length ?? 0 })}</Tag>
          <Tag icon={<UserSwitchOutlined />}>{t('cadence.selected', { length: targetIds.length })}</Tag>
          <span className="crm-muted">{t('cadence.followUpsWillBe', { willCreate })}</span>
        </Space>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 6 }}
          loading={leadsQ.isLoading || accountsQ.isLoading}
          dataSource={targets as unknown as Record<string, unknown>[]}
          rowSelection={{
            selectedRowKeys: targetIds,
            onChange: (keys) => setTargetIds(keys as string[]),
          }}
          columns={[
            { title: targetType === 'LEAD' ? t('nav.leads') : t('nav.accounts'), dataIndex: 'name' },
            {
              title: targetType === 'LEAD' ? t('audit.field.status') : t('common.level'),
              render: (_: unknown, r: Record<string, unknown>) =>
                String(r.status ?? r.level ?? '-'),
            },
            {
              title: t('cadence.existingFollowUps'),
              render: (_: unknown, r: Record<string, unknown>) => (
                <span className="crm-muted">
                  {String(r.nextFollowAt ?? '-').slice(0, 10)}
                </span>
              ),
            },
          ]}
        />
        <div className="crm-muted" style={{ marginTop: 8 }}>{t('cadence.cadenceStepsCreatePlanned')}{' '}<Link to="/calendar">{t('common.calendar')}</Link>{' '}{t('cadence.text')}</div>
      </Modal>

      <Card size="small" title={t('cadence.tips')} style={{ marginTop: 16 }} className="crm-panel-fixed crm-panel-sm">
        <ul className="crm-ai-list">
          <li>{t('cadence.newLeadD0')}</li>
          <li>{t('cadence.afterQuoteD0')}</li>
          <li>{t('cadence.renewalStart60Days')}</li>
        </ul>
        <div className="crm-muted" style={{ marginTop: 8 }}>
          <CalendarOutlined />{' '}{t('cadence.afterLaunchingWorkThrough')}</div>
      </Card>
    </div>
  )
}
