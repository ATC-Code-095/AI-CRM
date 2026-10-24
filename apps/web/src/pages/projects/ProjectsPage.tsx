import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'antd'
import { useState } from 'react'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { BarChart } from '../../components/SimpleCharts'
import { t } from '../../i18n'

type Project = {
  id: string
  code: string
  name: string
  accountId?: string | null
  accountName?: string
  status: string
  budget?: string
  owner?: string
  startDate?: string
  endDate?: string
  description?: string
  milestones?: { text: string; done: boolean; due?: string }[]
}

const STATUS_COLOR: Record<string, string> = {
  PLANNING: 'default',
  BIDDING: 'blue',
  WON: 'green',
  DELIVERING: 'orange',
  CLOSED: 'default',
}

/** 项目制销售：报价/合同按项目归集 */
export default function ProjectsPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [tab, setTab] = useState('list')
  const urgeM = useMutation({
    mutationFn: () =>
      api('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'TASK',
          subject: t('projects.overBudgetReminder'),
          content: t('projects.projectBudgetExecutionIs', { v: detailQ.data?.project?.name ?? '' }),
          entityType: 'ACCOUNT',
          entityId: detailQ.data?.project?.accountId ?? '',
          status: 'PLANNED',
          dueAt: new Date().toISOString(),
        }),
      }),
    onSuccess: () => {
      message.success(t('projects.reminderTaskCreated'))
    },
    onError: (e: Error) => message.error(e.message),
  })
  const [detailId, setDetailId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ items: Project[] }>('/projects'),
    retry: false,
  })

  const detailQ = useQuery({
    queryKey: ['project-detail', detailId],
    enabled: !!detailId,
    queryFn: () =>
      api<{
        project: Project & {
          milestones?: { text: string; done: boolean; due?: string }[]
        }
        quotes: { id: string; quoteNo: string; subject: string; status: string; total: string }[]
        contracts: {
          id: string
          contractNo: string
          title: string
          status: string
          total: string
          receivedAmount: string
        }[]
        summary: {
          quoteCount: number
          quoteTotal: string
          contractCount: number
          contractTotal: string
          received: string
          budget?: string
          grossProfit?: string
          margin?: string
          receiveRate?: string
        }
      }>(`/projects/${detailId}`),
    retry: false,
  })

  const saveM = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      if (editId) return api(`/projects/${editId}`, { method: 'PUT', body: JSON.stringify(v) })
      return api('/projects', { method: 'POST', body: JSON.stringify(v) })
    },
    onSuccess: () => {
      message.success(t('projects.projectSaved'))
      setOpen(false)
      setEditId(null)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const delM = useMutation({
    mutationFn: (id: string) => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success(t('common.deleted'))
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtprj0001"
        title={t('projects.projects')}
        subtitle={t('projects.salesProjectBasedQuotes')}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['projects'] })}
        onCreate={() => {
          setEditId(null)
          form.resetFields()
          form.setFieldsValue({ status: 'PLANNING' })
          setOpen(true)
        }}
        createLabel={t('projects.newProject')}
      >
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'list',
              label: t('projects.projectList'),
              children: (
                <ErpTable
                  rowKey="id"
                  storageKey="projects"
                  dataSource={(listQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={10}
                  onRowClick={(row) => {
                    setDetailId(String(row.id))
                    setTab('detail')
                  }}
                  columns={[
                    { title: t('common.code'), dataIndex: 'code', width: 90, filterType: 'text' },
                    { title: t('projects.projectName'), dataIndex: 'name', width: 160, filterType: 'text' },
                    { title: t('nav.accounts'), dataIndex: 'accountName', width: 120, filterType: 'text' },
                    {
                      title: t('audit.field.status'),
                      dataIndex: 'status',
                      width: 100,
                      filterType: 'select',
                      filterOptions: Object.keys(STATUS_COLOR).map((s) => ({
                        value: s,
                        label: s,
                      })),
                      render: (v: unknown) => (
                        <Tag color={STATUS_COLOR[String(v)] ?? 'default'}>{String(v)}</Tag>
                      ),
                    },
                    { title: t('common.budget'), dataIndex: 'budget', width: 100, filterType: 'number' },
                    { title: t('audit.field.ownerId'), dataIndex: 'owner', width: 100 },
                    { title: t('projects.start'), dataIndex: 'startDate', width: 100 },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      width: 120,
                      render: (_: unknown, r: unknown) => {
                        const p = r as Project
                        return (
                          <Space>
                            <Button
                              size="small"
                              onClick={() => {
                                setEditId(p.id)
                                form.setFieldsValue(p)
                                setOpen(true)
                              }}
                            >{t('common.edit')}</Button>
                            <Button size="small" danger onClick={() => delM.mutate(p.id)}>{t('common.del')}</Button>
                          </Space>
                        )
                      },
                    },
                  ]}
                />
              ),
            },
            {
              key: 'calendar',
              label: t('projects.projectCalendar'),
              children: (
                <div>
                  <div style={{ fontSize: 12, color: '#646A73', marginBottom: 8 }}>{t('projects.projectSpansByStart')}</div>
                  {(listQ.data?.items ?? []).map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        padding: '8px 0',
                        borderBottom: '1px dashed #eef2f7',
                      }}
                    >
                      <div style={{ width: 110, fontSize: 12, color: '#646A73' }}>
                        {p.startDate ?? '—'}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: 16,
                          background: '#f1f5f9',
                          borderRadius: 8,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(12, ((p.milestones ?? []).filter((m) => m.done).length / Math.max(1, (p.milestones ?? []).length)) * 100))}%`,
                            height: '100%',
                            background:
                              p.status === 'WON' || p.status === 'DELIVERING'
                                ? 'linear-gradient(90deg,#0d9488,#5eead4)'
                                : 'linear-gradient(90deg,#2b5fd9,#60a5fa)',
                          }}
                        />
                      </div>
                      <div style={{ width: 110, fontSize: 12, color: '#646A73' }}>
                        {p.endDate ?? '—'}
                      </div>
                      <Tag>{p.name}</Tag>
                    </div>
                  ))}
                  {!(listQ.data?.items ?? []).length && (
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('projects.noProjects')}</div>
                  )}
                </div>
              ),
            },
            {
              key: 'detail',
              label: t('projects.projectQuotesContracts'),
              children: detailId ? (
                <div>
                  <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                    <Col xs={12} md={6}>
                      <Card size="small" className="crm-panel-fixed crm-panel-sm">
                        <Statistic
                          title={t('projects.quoteTotal')}
                          value={detailQ.data?.summary.quoteTotal ?? '0'}
                        />
                      </Card>
                    </Col>
                    <Col xs={12} md={6}>
                      <Card size="small" className="crm-panel-fixed crm-panel-sm">
                        <Statistic
                          title={t('projects.contractTotal')}
                          value={detailQ.data?.summary.contractTotal ?? '0'}
                          valueStyle={{ color: '#0d9488' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={12} md={6}>
                      <Card size="small" className="crm-panel-fixed crm-panel-sm">
                        <Statistic
                          title={t('common.received')}
                          value={detailQ.data?.summary.received ?? '0'}
                          valueStyle={{ color: '#2b5fd9' }}
                        />
                      </Card>
                    </Col>
                    <Col xs={12} md={6}>
                      <Card size="small" className="crm-panel-fixed crm-panel-sm">
                        <Statistic
                          title={t('projects.grossProfitMargin', { v: detailQ.data?.summary.margin ?? 0 })}
                          value={detailQ.data?.summary.grossProfit ?? '0'}
                          valueStyle={{
                            color:
                              Number(detailQ.data?.summary.grossProfit ?? 0) >= 0
                                ? '#0d9488'
                                : '#e11d48',
                          }}
                        />
                        <div style={{ fontSize: 12, color: '#646A73' }}>{t('projects.budgetCollectionRate', { v: detailQ.data?.summary.budget ?? '0', v2: ' ', v3: detailQ.data?.summary.receiveRate ?? 0 })}</div>
                      </Card>
                    </Col>
                  </Row>
                  <Card size="small" title={t('projects.projectStructureQuotesContracts')} style={{ marginBottom: 12 }}>
                    <BarChart
                      items={[
                        { label: t('nav.quotes'), value: Number(detailQ.data?.summary.quoteTotal ?? 0) },
                        { label: t('nav.contracts'), value: Number(detailQ.data?.summary.contractTotal ?? 0) },
                        { label: t('nav.payments'), value: Number(detailQ.data?.summary.received ?? 0) },
                        {
                          label: t('projects.grossProfit'),
                          value: Math.max(0, Number(detailQ.data?.summary.grossProfit ?? 0)),
                        },
                      ]}
                      color="#2b5fd9"
                      height={100}
                    />
                  </Card>
                  <Card
                    size="small"
                    title={t('projects.budgetVarianceAlert')}
                    style={{ marginBottom: 12 }}
                    extra={
                      (() => {
                        const s = detailQ.data?.summary
                        const budget = Number(s?.budget ?? 0)
                        const expense = Number(s?.contractTotal ?? 0)
                        const rate = budget > 0 ? (expense / budget) * 100 : 0
                        return (
                          <Tag color={rate > 100 ? 'red' : rate > 80 ? 'orange' : 'green'}>{t('projects.executed', { v: rate.toFixed(0) })}</Tag>
                        )
                      })()
                    }
                  >
                    {(() => {
                      const s = detailQ.data?.summary
                      const budget = Number(s?.budget ?? 0)
                      const spent = Number(s?.contractTotal ?? 0)
                      const gap = budget - spent
                      return (
                        <div style={{ fontSize: 12, color: '#646A73', lineHeight: 1.9 }}>
                          <div>{t('common.budget')}{' '}<b>{budget.toFixed(2)}</b>{' '}{t('projects.incurredContracts')}{' '}<b>{spent.toFixed(2)}</b>
                          </div>
                          <div>
                            {gap >= 0 ? (
                              <span style={{ color: '#0d9488' }}>{t('projects.remainingExecutionRate', { v: gap.toFixed(2), v2: budget ? ((spent / budget) * 100).toFixed(1) : 0 })}</span>
                            ) : (
                              <span style={{ color: '#e11d48' }}>{t('projects.overBudgetByPlease', { v: Math.abs(gap).toFixed(2) })}</span>
                            )}
                          </div>
                          {budget > 0 && spent / budget > 0.8 && (
                            <div style={{ color: '#d97706', marginTop: 4 }}>{t('projects.budgetExecutionAbove80')}<Button
                                size="small"
                                style={{ marginLeft: 8 }}
                                loading={urgeM.isPending}
                                onClick={() => urgeM.mutate()}
                              >{t('projects.autoRemind')}</Button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </Card>
                  <Card size="small" title={t('projects.projectHealth')} style={{ marginBottom: 12 }}>
                    {(() => {
                      const s = detailQ.data?.summary
                      const margin = Number(s?.margin ?? 0)
                      const receive = Number(s?.receiveRate ?? 0)
                      const score = Math.round(
                        Math.max(0, Math.min(100, (margin + receive) / 2)),
                      )
                      return (
                        <Space size="large" wrap>
                          <div>
                            <div style={{ fontSize: 12, color: '#646A73' }}>{t('common.overallScore')}</div>
                            <div
                              style={{
                                fontSize: 28,
                                fontWeight: 700,
                                color: score >= 70 ? '#0d9488' : score >= 40 ? '#d97706' : '#e11d48',
                              }}
                            >
                              {score}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#646A73', lineHeight: 2 }}>
                            <div>{t('projects.grossMargin')}{' '}<b>{s?.margin ?? 0}%</b>
                            </div>
                            <div>{t('common.collectionRate')}{' '}<b>{s?.receiveRate ?? 0}%</b>
                            </div>
                            <div>{t('common.budget')}{' '}<b>{s?.budget ?? '0'}</b>
                            </div>
                          </div>
                        </Space>
                      )
                    })()}
                  </Card>
                  <Card size="small" title={t('projects.projectProgressGantt')} style={{ marginBottom: 12 }}>
                    {(() => {
                      const ms = detailQ.data?.project.milestones ?? []
                      const done = ms.filter((m) => m.done).length
                      const pct = ms.length ? Math.round((done / ms.length) * 100) : 0
                      const p = detailQ.data?.project
                      return (
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 12,
                              marginBottom: 6,
                            }}
                          >
                            <span>
                              {p?.startDate ?? '—'} → {p?.endDate ?? '—'}
                            </span>
                            <b>
                              {done}/{ms.length} · {pct}%
                            </b>
                          </div>
                          <div
                            style={{
                              height: 18,
                              background: '#f1f5f9',
                              borderRadius: 9,
                              overflow: 'hidden',
                              display: 'flex',
                            }}
                          >
                            {(ms.length ? ms : [{ text: t('common.notStarted'), done: false }]).map((m, i) => (
                              <div
                                key={i}
                                title={m.text}
                                style={{
                                  flex: 1,
                                  background: m.done
                                    ? 'linear-gradient(90deg,#0d9488,#5eead4)'
                                    : '#e2e8f0',
                                  borderRight: '1px solid #fff',
                                }}
                              />
                            ))}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{t('projects.greenDoneGrayTodo')}</div>
                        </div>
                      )
                    })()}
                  </Card>
                  <Card
                    size="small"
                    title={t('projects.projectMilestones')}
                    style={{ marginBottom: 12 }}
                    extra={
                      <Space>
                        <Input
                          size="small"
                          placeholder={t('projects.newMilestone')}
                          style={{ width: 140 }}
                          onPressEnter={(e) => {
                            const text = (e.target as HTMLInputElement).value.trim()
                            if (!text) return
                            const ms = [
                              ...(detailQ.data?.project.milestones ?? []),
                              { text, done: false },
                            ]
                            void api(`/projects/${detailId}/milestones`, {
                              method: 'PUT',
                              body: JSON.stringify({ milestones: ms }),
                            }).then(() => {
                              message.success(t('projects.milestoneAdded'))
                              void qc.invalidateQueries({ queryKey: ['project-detail', detailId] })
                            })
                          }}
                        />
                        <Tag>{t('projects.done', { v: ' ', length: (detailQ.data?.project.milestones ?? []).filter((m) => m.done).length, length2: (detailQ.data?.project.milestones ?? []).length })}
                        </Tag>
                      </Space>
                    }
                  >
                    {(detailQ.data?.project.milestones ?? []).map((m, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 0',
                          borderBottom: '1px dashed #eef2f7',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={m.done}
                          onChange={() => {
                            const ms = (detailQ.data?.project.milestones ?? []).map((x, j) =>
                              j === i ? { ...x, done: !x.done } : x,
                            )
                            void api(`/projects/${detailId}/milestones`, {
                              method: 'PUT',
                              body: JSON.stringify({ milestones: ms }),
                            }).then(() =>
                              qc.invalidateQueries({ queryKey: ['project-detail', detailId] }),
                            )
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            textDecoration: m.done ? 'line-through' : 'none',
                            opacity: m.done ? 0.55 : 1,
                            fontSize: 13,
                          }}
                        >
                          {m.text}
                        </span>
                        {m.due && <Tag>{m.due}</Tag>}
                      </div>
                    ))}
                    {!(detailQ.data?.project.milestones ?? []).length && (
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('projects.noMilestonesTypeAnd')}</div>
                    )}
                  </Card>
                  <Card size="small" title={t('nav.quotes')} style={{ marginBottom: 12 }}>
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={detailQ.data?.quotes ?? []}
                      columns={[
                        { title: t('common.no'), dataIndex: 'quoteNo' },
                        { title: t('common.subject'), dataIndex: 'subject' },
                        { title: t('audit.field.status'), dataIndex: 'status' },
                        { title: t('audit.field.amount'), dataIndex: 'total' },
                      ]}
                    />
                  </Card>
                  <Card size="small" title={t('nav.contracts')}>
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      dataSource={detailQ.data?.contracts ?? []}
                      columns={[
                        { title: t('audit.field.contractNo'), dataIndex: 'contractNo' },
                        { title: t('audit.field.title'), dataIndex: 'title' },
                        { title: t('audit.field.status'), dataIndex: 'status' },
                        { title: t('audit.field.amount'), dataIndex: 'total' },
                        { title: t('audit.field.receivedAmount'), dataIndex: 'receivedAmount' },
                      ]}
                    />
                  </Card>
                </div>
              ) : (
                <div style={{ color: '#94a3b8', padding: 24 }}>{t('projects.selectAProjectIn')}</div>
              ),
            },
          ]}
        />
      </ErpListShell>
      <Modal
        title={editId ? t('projects.editProject') : t('projects.newProject')}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditId(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveM.isPending}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveM.mutate(v)}>
          <Form.Item name="code" label={t('common.code')} rules={[{ required: true }]}>
            <Input placeholder={t('projects.eGP2026001')} />
          </Form.Item>
          <Form.Item name="name" label={t('projects.projectName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountName" label={t('nav.accounts')}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label={t('audit.field.status')}>
            <Select
              options={Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="budget" label={t('common.budget')} style={{ flex: 1 }}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="startDate" label={t('projects.start')} style={{ flex: 1 }}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="endDate" label={t('projects.end')} style={{ flex: 1 }}>
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
          </Space>
          <Form.Item name="description" label={t('common.notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
