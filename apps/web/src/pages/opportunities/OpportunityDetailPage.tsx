import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { DecisionChainChart } from '../../components/DecisionChainChart'
import { ActivityTimeline } from '../../components/ActivityTimeline'
import { NextBestActions } from '../../components/NextBestActions'
import { FunnelPlaybook } from '../../components/FunnelPlaybook'
import { MeetingMinutesBox } from '../../components/MeetingSuccess'
import { StarButton } from '../../components/StarButton'
import { t } from '../../i18n'

export default function OpportunityDetailPage() {
  const { id } = useParams()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [oppTab, setOppTab] = useState('overview')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUser, setShareUser] = useState('')
  const [memberUser, setMemberUser] = useState('')
  const [memberRole, setMemberRole] = useState('COLLABORATOR')
  const [pathStep, setPathStep] = useState(0)

  const { data } = useQuery({
    queryKey: ['opp-detail', id],
    queryFn: () =>
      api<{
        id: string
        name: string
        amount: string
        currency?: string
        winRate: number
        expectedCloseDate: string
        nextStep: string | null
        closeReason: string | null
        stage: { id: string; name: string; code: string; isClosing: boolean }
        account: { id: string; name: string }
        histories: { id: string; note: string | null; changedAt: string }[]
        quotes: { id: string; quoteNo: string; status: string; total: string }[]
        contracts: { id: string; contractNo: string; status: string; total: string }[]
        members?: { userId: string; name: string; email: string; role: string }[]
        contacts?: {
          id: string
          name: string
          title?: string | null
          decisionRole?: string | null
          isPrimary?: boolean
          mobile?: string | null
        }[]
      }>(`/opportunities/${id}`),
    enabled: !!id,
    retry: false,
  })

  const stagesQ = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => api<{ stages: { id: string; code: string; name: string }[] }[]>('/pipelines'),
    retry: false,
  })

  const usersQ = useQuery({
    queryKey: ['users-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/users/options'),
    retry: false,
  })

  const [gateError, setGateError] = useState<string | null>(null)

  const move = useMutation({
    mutationFn: (stageId: string) =>
      api(`/opportunities/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId, note: 'detail move' }),
      }),
    onSuccess: () => {
      message.success('OK')
      setGateError(null)
      void qc.invalidateQueries({ queryKey: ['opp-detail', id] })
    },
    onError: (e: Error) => {
      // 阶段门禁：保留错误在页面上，方便逐项补齐
      setGateError(e.message)
      message.error(e.message)
    },
  })

  const win = useMutation({
    mutationFn: () => api(`/opportunities/${id}/close-won`, { method: 'POST' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['opp-detail', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const lost = useMutation({
    mutationFn: () =>
      api(`/opportunities/${id}/close-lost`, {
        method: 'POST',
        body: JSON.stringify({ closeReason: lostReason }),
      }),
    onSuccess: () => {
      message.success('OK')
      setLostOpen(false)
      void qc.invalidateQueries({ queryKey: ['opp-detail', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const share = useMutation({
    mutationFn: () =>
      api(`/opportunities/${id}/share`, {
        method: 'POST',
        body: JSON.stringify({ userId: shareUser, role: 'VIEWER' }),
      }),
    onSuccess: () => {
      message.success(t('common.shared'))
      setShareOpen(false)
    },
    onError: (e: Error) => message.error(e.message),
  })

  const addMember = useMutation({
    mutationFn: () =>
      api(`/opportunities/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: memberUser, role: memberRole }),
      }),
    onSuccess: () => {
      message.success(t('opp.addedToTeam'))
      setMemberUser('')
      void qc.invalidateQueries({ queryKey: ['opp-detail', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/opportunities/${id}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success(t('opp.removed'))
      void qc.invalidateQueries({ queryKey: ['opp-detail', id] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (!data) return null
  const stages = stagesQ.data?.[0]?.stages ?? []

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {data.name} <Tag color="blue">{data.stage.name}</Tag>
        <StarButton type="OPPORTUNITY" id={data.id} name={data.name} />
      </Typography.Title>
      <Space style={{ marginBottom: 12 }} wrap>
        <Select
          style={{ width: 160 }}
          placeholder={t('opp.changeStage')}
          value={data.stage.id}
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(stageId) => {
            if (stageId !== data.stage.id) move.mutate(stageId)
          }}
        />
        {!data.stage.isClosing && (
          <>
            <Button type="primary" onClick={() => win.mutate()}>{t('enum.stage.WON')}</Button>
            <Button danger onClick={() => setLostOpen(true)}>{t('enum.stage.LOST')}</Button>
          </>
        )}
        <Button onClick={() => setShareOpen(true)}>{t('opp.share')}</Button>
        <Link to="/opportunities">{t('common.back')}</Link>
      </Space>
      {gateError && (
        <Alert
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 12, borderRadius: 10 }}
          message={t('opp.stageChangeFailedGate')}
          description={gateError}
          onClose={() => setGateError(null)}
          action={
            <Button size="small" onClick={() => message.info(t('opp.selectTheTargetStage'))}>{t('opp.howToFix')}</Button>
          }
        />
      )}
      <Tabs
        activeKey={oppTab}
        onChange={setOppTab}
        style={{ marginBottom: 12 }}
        items={[
          { key: 'overview', label: t('opp.dealOverview') },
          { key: 'battle', label: t('opp.battleSupport') },
          { key: 'team', label: t('opp.teamDocuments') },
        ]}
      />
      {oppTab === 'overview' && (
        <>
      <NextBestActions oppId={id!} accountId={data.account.id} />
      <SalesPathChecklist
        doneCount={pathStep}
        onChange={setPathStep}
        stages={stages}
        currentStageId={data.stage.id}
        onMove={(stageId) => {
          if (stageId !== data.stage.id) move.mutate(stageId)
        }}
      />
      <OpportunityScoreBox oppId={id!} />
      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions column={{ xs: 1, md: 3 }} size="small">
          <Descriptions.Item label={t('nav.accounts')}>
            <Link to={`/accounts/${data.account.id}`}>{data.account.name}</Link>
          </Descriptions.Item>
          <Descriptions.Item label={t('audit.field.amount')}>
            {data.amount}
            {data.currency ? ` ${data.currency}` : ''}
          </Descriptions.Item>
          <Descriptions.Item label={t('audit.field.winRate')}>{data.winRate}%</Descriptions.Item>
          <Descriptions.Item label={t('opp.expectedClose')}>
            {dayjs(data.expectedCloseDate).format('YYYY-MM-DD')}
          </Descriptions.Item>
          <Descriptions.Item label={t('account.nextAction')}>{data.nextStep ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('common.lossReason')}>{data.closeReason ?? '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <ActivityTimeline entityType="OPPORTUNITY" entityId={id!} title={t('common.interactionTimeline')} />
      <Card size="small" title={t('common.buyingDecisionChain')} style={{ marginBottom: 12 }}>
        <DecisionChainChart contacts={data.contacts ?? []} compact />
        <div style={{ marginTop: 6, fontSize: 12, color: '#646A73' }}>{t('opp.contactRolesAreMaintained')}</div>
      </Card>
        </>
      )}
      {oppTab === 'battle' && (
        <>
      <FunnelPlaybook accountId={data.account.id} currentStage={data.stage.name} currentStageCode={data.stage.code} />
      <BattleCard oppId={id!} />
      <SalesCoachBox oppId={id!} />
      <MeetingMinutesBox entityType="OPPORTUNITY" entityId={id!} />
        </>
      )}
      {oppTab === 'team' && (
        <>
      <Card size="small" title={t('opp.team')} style={{ marginBottom: 12 }}>
        <Space style={{ marginBottom: 8 }} wrap>
          <Select
            style={{ width: 180 }}
            placeholder={t('opp.selectMember')}
            value={memberUser || undefined}
            options={(usersQ.data?.items ?? []).map((u) => ({ value: u.id, label: u.name }))}
            onChange={setMemberUser}
          />
          <Select
            style={{ width: 140 }}
            value={memberRole}
            options={[
              { value: 'COLLABORATOR', label: t('opp.collaborator') },
              { value: 'INFLUENCER', label: t('opp.influencer') },
              { value: 'DECISION_MAKER', label: t('contacts.role.economic') },
            ]}
            onChange={setMemberRole}
          />
          <Button
            type="primary"
            size="small"
            disabled={!memberUser}
            loading={addMember.isPending}
            onClick={() => addMember.mutate()}
          >{t('opp.addToTeam')}</Button>
        </Space>
        <AutoFitTable
          rowKey="userId"
          size="small"
          pagination={false}
          dataSource={data.members ?? []}
          columns={[
            { title: t('common.name'), dataIndex: 'name' },
            { title: t('common.email'), dataIndex: 'email' },
            {
              title: t('common.role'),
              dataIndex: 'role',
              render: (v: string) => (
                <Tag color={v === 'DECISION_MAKER' ? 'gold' : v === 'INFLUENCER' ? 'blue' : 'green'}>
                  {v}
                </Tag>
              ),
            },
            {
              title: t('common.actions'),
              render: (_: unknown, m: { userId: string }) => (
                <Button size="small" danger onClick={() => removeMember.mutate(m.userId)}>{t('opp.remove')}</Button>
              ),
            },
          ]}
        />
      </Card>
      <Card size="small" title={t('opp.quotesContracts')}>
        <AutoFitTable
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={[
            ...data.quotes.map((q) => ({ ...q, kind: t('nav.quotes'), no: q.quoteNo })),
            ...data.contracts.map((c) => ({ ...c, kind: t('nav.contracts'), no: c.contractNo })),
          ]}
          columns={[
            { title: t('common.type'), dataIndex: 'kind' },
            { title: t('common.no'), dataIndex: 'no' },
            { title: t('audit.field.status'), dataIndex: 'status' },
            { title: t('audit.field.amount'), dataIndex: 'total' },
          ]}
        />
      </Card>
        </>
      )}
      <Modal
        title={t('common.lossReason')}
        open={lostOpen}
        onCancel={() => setLostOpen(false)}
        onOk={() => {
          if (!lostReason) {
            message.error(t('validation.required'))
            return
          }
          lost.mutate()
        }}
        confirmLoading={lost.isPending}
      >
        <Input.TextArea rows={3} value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
      </Modal>
      <Modal
        title={t('opp.shareDeal')}
        open={shareOpen}
        onCancel={() => setShareOpen(false)}
        onOk={() => share.mutate()}
        confirmLoading={share.isPending}
      >
        <Select
          style={{ width: '100%' }}
          placeholder={t('common.selectUser')}
          value={shareUser || undefined}
          options={(usersQ.data?.items ?? []).map((u) => ({ value: u.id, label: u.name }))}
          onChange={setShareUser}
        />
      </Modal>
    </div>
  )
}


/** 商机评分模型 */
function OpportunityScoreBox({ oppId }: { oppId: string }) {
  const scoreQ = useQuery({
    queryKey: ['opp-score', oppId],
    queryFn: () =>
      api<{
        total: number
        grade: string
        parts: { factor: string; score: number; max: number; note: string }[]
      }>(`/reports/opportunity-score/${oppId}`),
    enabled: !!oppId,
    retry: false,
  })
  const grade = scoreQ.data?.grade ?? '-'
  return (
    <Card
      size="small"
      title={t('opp.dealScore')}
      style={{ marginBottom: 12 }}
      extra={
        <Space>
          <Tag
            color={grade === 'A' ? 'green' : grade === 'B' ? 'blue' : grade === 'C' ? 'orange' : 'red'}
          >
            {t('opp.gradePts', { grade, v: scoreQ.data?.total ?? 0 })}</Tag>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(scoreQ.data?.parts ?? []).map((p) => (
          <div
            key={p.factor}
            style={{
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              padding: '6px 10px',
              minWidth: 110,
            }}
          >
            <div style={{ fontSize: 11, color: '#8b919a' }}>{p.factor}</div>
            <b>
              {p.score}
              <span style={{ color: '#8b919a', fontWeight: 400 }}>/{p.max}</span>
            </b>
            <div style={{ fontSize: 11, color: '#646A73' }}>{p.note}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** 销售陪练：阶段话术与行动建议 */
function SalesCoachBox({ oppId }: { oppId: string }) {
  const { message } = App.useApp()
  const coachQ = useQuery({
    queryKey: ['sales-coach', oppId],
    queryFn: () =>
      api<{
        tips: string[]
        scripts: string[]
      }>(`/reports/sales-coach/${oppId}`),
    enabled: !!oppId,
    retry: false,
  })
  return (
    <Card
      size="small"
      title={t('opp.salesCoaching')}
      style={{ marginBottom: 12 }}
      extra={
        <Button
          size="small"
          onClick={() => {
            const text = (coachQ.data?.scripts ?? []).join('\n')
            if (text) void navigator.clipboard.writeText(text)
            message.success(t('opp.talkTrackCopied'))
          }}
        >{t('opp.copyTalkTrack')}</Button>
      }
    >
      <div style={{ fontSize: 12 }}>
        <b>{t('opp.suggestedActions')}</b>
        <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
          {(coachQ.data?.tips ?? []).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
          {!coachQ.data?.tips?.length && <li>{t('opp.noSuggestions')}</li>}
        </ul>
        <b>{t('common.referenceTalkTracks')}</b>
        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
          {(coachQ.data?.scripts ?? []).map((s, i) => (
            <li key={i} style={{ color: '#646A73' }}>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

/** 销售作战室：竞品/干系人/赢率策略/风险/行动 */
function BattleCard({ oppId }: { oppId: string }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [form] = Form.useForm()
  const [newAction, setNewAction] = useState('')
  const bcQ = useQuery({
    queryKey: ['battlecard', oppId],
    queryFn: () =>
      api<{
        competitors?: string
        stakeholders?: string
        winThemes?: string
        risks?: string
        actions?: { text: string; done: boolean }[]
      }>(`/opportunities/${oppId}/battlecard`),
    enabled: !!oppId,
    retry: false,
  })

  const saveM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api(`/opportunities/${oppId}/battlecard`, {
        method: 'PUT',
        body: JSON.stringify(v),
      }),
    onSuccess: () => {
      message.success(t('opp.warRoomSaved'))
      void qc.invalidateQueries({ queryKey: ['battlecard', oppId] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const actions = bcQ.data?.actions ?? []
  const doneCount = actions.filter((a) => a.done).length

  return (
    <Card
      size="small"
      title={t('opp.battlecard')}
      style={{ marginBottom: 12 }}
      extra={
        <Space>
          <Tag color="geekblue">{t('opp.actions', { doneCount, length: actions.length })}
          </Tag>
          <Button size="small" type="primary" loading={saveM.isPending} onClick={() => form.submit()}>{t('common.save')}</Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        size="small"
        initialValues={{
          competitors: bcQ.data?.competitors ?? '',
          stakeholders: bcQ.data?.stakeholders ?? '',
          winThemes: bcQ.data?.winThemes ?? '',
          risks: bcQ.data?.risks ?? '',
        }}
        onFinish={(v) =>
          saveM.mutate({
            ...v,
            actions: bcQ.data?.actions ?? [],
          })
        }
      >
        <Form.Item name="competitors" label={t('opp.competitorsCounterStrategy')}>
          <Input.TextArea rows={2} placeholder={t('opp.competitorsStrengthsWeaknesses')} />
        </Form.Item>
        <Form.Item name="stakeholders" label={t('opp.keyStakeholders')}>
          <Input.TextArea rows={2} placeholder={t('opp.positionsOfDecisionMakers')} />
        </Form.Item>
        <Form.Item name="winThemes" label={t('opp.winStrategy')}>
          <Input.TextArea rows={2} placeholder={t('opp.valuePropositionDifferentiation')} />
        </Form.Item>
        <Form.Item name="risks" label={t('opp.risksMitigations')}>
          <Input.TextArea rows={2} placeholder={t('opp.budgetTimelineCompetitorsInternal')} />
        </Form.Item>
      </Form>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{t('opp.actionChecklist')}</div>
        {(actions ?? []).map((a, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={!!a.done}
              onChange={() => {
                const next = actions.map((x, idx) =>
                  idx === i ? { ...x, done: !x.done } : x,
                )
                saveM.mutate({
                  competitors: bcQ.data?.competitors ?? '',
                  stakeholders: bcQ.data?.stakeholders ?? '',
                  winThemes: bcQ.data?.winThemes ?? '',
                  risks: bcQ.data?.risks ?? '',
                  actions: next,
                })
              }}
            />
            <span
              style={{
                fontSize: 12,
                opacity: a.done ? 0.5 : 1,
                textDecoration: a.done ? 'line-through' : 'none',
              }}
            >
              {a.text}
            </span>
            <Button
              size="small"
              type="link"
              danger
              onClick={() => {
                const next = actions.filter((_, idx) => idx !== i)
                saveM.mutate({
                  competitors: bcQ.data?.competitors ?? '',
                  stakeholders: bcQ.data?.stakeholders ?? '',
                  winThemes: bcQ.data?.winThemes ?? '',
                  risks: bcQ.data?.risks ?? '',
                  actions: next,
                })
              }}
            >{t('common.delete')}</Button>
          </div>
        ))}
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="small"
            placeholder={t('opp.newActionItemPress')}
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            onPressEnter={() => {
              if (!newAction.trim()) return
              saveM.mutate({
                competitors: bcQ.data?.competitors ?? '',
                stakeholders: bcQ.data?.stakeholders ?? '',
                winThemes: bcQ.data?.winThemes ?? '',
                risks: bcQ.data?.risks ?? '',
                actions: [...actions, { text: newAction.trim(), done: false }],
              })
              setNewAction('')
            }}
          />
          <Button
            size="small"
            onClick={() => {
              if (!newAction.trim()) return
              saveM.mutate({
                competitors: bcQ.data?.competitors ?? '',
                stakeholders: bcQ.data?.stakeholders ?? '',
                winThemes: bcQ.data?.winThemes ?? '',
                risks: bcQ.data?.risks ?? '',
                actions: [...actions, { text: newAction.trim(), done: false }],
              })
              setNewAction('')
            }}
          >{t('common.add')}</Button>
        </Space.Compact>
      </div>
    </Card>
  )
}

/** 销售路径检查清单（阶段推进提醒，主流 CRM 销售路径） */
const PATH_STEPS = [
  t('opp.confirmDecisionChainAnd'),
  t('opp.completeDiscoveryNotes'),
  t('opp.solutionProductDemoDone'),
  t('opp.quoteSent'),
  t('opp.commercialTermsAgreed'),
  t('opp.contractSealed'),
]

function SalesPathChecklist({
  doneCount,
  onChange,
  stages,
  currentStageId,
  onMove,
}: {
  doneCount: number
  onChange: (n: number) => void
  stages?: { id: string; name: string }[]
  currentStageId?: string
  onMove?: (stageId: string) => void
}) {
  const stageIdx = Math.max(
    0,
    (stages ?? []).findIndex((s) => s.id === currentStageId),
  )
  return (
    <Card size="small" title={t('opp.salesPath')} style={{ marginBottom: 12 }}>
      {stages && stages.length > 0 && (
        <div className="sales-path-steps" style={{ marginBottom: 12, overflowX: 'auto' }}>
          <div style={{ display: 'flex', minWidth: '100%', alignItems: 'center', gap: 0 }}>
            {stages.map((s, i) => {
              const done = i < stageIdx
              const active = i === stageIdx
              return (
                <div
                  key={s.id}
                  onClick={() => onMove?.(s.id)}
                  style={{
                    flex: 1,
                    minWidth: 72,
                    textAlign: 'center',
                    cursor: onMove ? 'pointer' : 'default',
                    opacity: done || active ? 1 : 0.45,
                  }}
                >
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: done ? '#0d9488' : active ? '#0026ff' : '#e2e8f0',
                      marginBottom: 4,
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      color: active ? '#0026ff' : done ? '#0d9488' : '#64748b',
                    }}
                  >
                    {s.name}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
        {PATH_STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={i < doneCount}
              onChange={(e) => onChange(e.target.checked ? i + 1 : i)}
            />
            <span
              style={{
                opacity: i < doneCount ? 0.5 : 1,
                textDecoration: i < doneCount ? 'line-through' : 'none',
                fontSize: 12,
              }}
            >
              {i + 1}. {s}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
