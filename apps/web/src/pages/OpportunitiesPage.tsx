import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Tag,
  DatePicker,
} from 'antd'
import { AutoFitTable } from '../components/AutoFitTable'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { exportPdf, exportWord } from '../utils/docExport'
import { ErpTable } from '../components/ErpTable'
import { ErpListShell } from '../components/ErpListShell'
import { ForecastBoard } from '../components/ForecastBoard'
import { PipelineBoard, type BoardColumnData } from '../components/PipelineBoard'
import { useQuickCreate } from '../utils/quickCreate'
import { MobileCardList } from '../components/MobileCardList'
import { useIsMobile } from '../hooks/useIsMobile'
import { useUrlState } from '../hooks/useUrlState'
import { CurrencySelect } from '../components/CurrencySelect'

interface Stage {
  id: string
  code: string
  name: string
  winRate: number
  isClosing: boolean
}

interface Opp {
  id: string
  name: string
  amount: string
  winRate: number
  expectedCloseDate: string
  account?: { id: string; name: string }
  owner?: { id: string; name: string }
  stage: Stage
}

interface BoardColumn {
  stage: Stage
  cards: Opp[]
  count: number
  amount: string
}

export default function OpportunitiesPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const isMobile = useIsMobile()
  // 视图 / 负责人 / 关键词写入 URL，便于分享与回退（docs/06 §5.7）
  const [viewParam, setViewParam] = useUrlState('view', 'board')
  const [ownerId, setOwnerIdParam] = useUrlState('ownerId')
  const [kw, setKw] = useUrlState('q')
  const view = (viewParam === 'list' ? 'list' : 'board') as 'board' | 'list'
  const setView = (v: 'board' | 'list') => setViewParam(v)
  const setOwnerId = (v?: string) => setOwnerIdParam(v ?? '')
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])

  const boardQ = useQuery({
    queryKey: ['opp-board', ownerId ?? 'all'],
    queryFn: () =>
      api<{ columns: BoardColumn[] }>(
        `/boards/pipeline${ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : ''}`,
      ),
    enabled: view === 'board',
  })

  const usersQ = useQuery({
    queryKey: ['users-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/users/options'),
    retry: false,
  })

  /** 关键词过滤（名称 / 客户 / 负责人），看板与列表共用 */
  const boardColumns = useMemo(() => {
    const key = kw.trim().toLowerCase()
    const cols = boardQ.data?.columns ?? []
    if (!key) return cols
    return cols.map((c) => ({
      ...c,
      cards: c.cards.filter((o) =>
        [o.name, o.account?.name, o.owner?.name].filter(Boolean).some((v) =>
          String(v).toLowerCase().includes(key),
        ),
      ),
    }))
  }, [boardQ.data, kw])

  const pipelineTotal = (boardQ.data?.columns ?? []).reduce(
    (sum, c) => sum + Number(c.amount || 0),
    0,
  )

  const boardTotal = boardColumns.reduce((n, c) => n + c.cards.length, 0)
  const boardAmount = boardColumns
    .reduce((sum, c) => sum + Number(c.amount || 0), 0)
    .toFixed(2)

  const listQ = useQuery({
    queryKey: ['opp-list'],
    queryFn: () => api<{ items: Opp[]; total: number }>('/opportunities?pageSize=50'),
    enabled: view === 'list',
  })

  const forecastQ = useQuery({
    queryKey: ['opp-forecast'],
    queryFn: () =>
      api<{ items: { stage: string; count: number; amount: string; weightedAmount: string }[]; totals: { count: number; amount: string; weightedAmount: string } }>(
        '/opportunities/forecast',
      ),
  })

  const commitsQ = useQuery({
    queryKey: ['forecast-commits'],
    queryFn: () =>
      api<{
        month: string
        items: { userId: string; userName: string; commitAmount: string; bestAmount: string; worstAmount: string; note: string }[]
        totals: { commitAmount: string; bestAmount: string; worstAmount: string }
      }>('/opportunities/forecast-commits'),
    retry: false,
  })

  const openCreate = async () => {
    const acc = await api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=50')
    setAccounts(acc.items ?? [])
    setOpen(true)
  }

  useQuickCreate('opportunity', () => void openCreate())

  const createMut = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api('/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          expectedCloseDate: values.expectedCloseDate
            ? dayjs(values.expectedCloseDate as string).format('YYYY-MM-DD')
            : dayjs().add(30, 'day').format('YYYY-MM-DD'),
          amount: String(values.amount ?? 0),
        }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['opp-board'] })
      void qc.invalidateQueries({ queryKey: ['opp-list'] })
      void qc.invalidateQueries({ queryKey: ['opp-forecast'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const moveStage = useMutation({
    mutationFn: (payload: { id: string; stageId: string }) =>
      api(`/opportunities/${payload.id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId: payload.stageId, note: 'board move' }),
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['opp-board'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const closeLost = useMutation({
    mutationFn: (id: string) =>
      api(`/opportunities/${id}/close-lost`, {
        method: 'POST',
        body: JSON.stringify({ closeReason: t('enum.stage.LOST') }),
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['opp-board'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const closeWon = useMutation({
    mutationFn: (id: string) => api(`/opportunities/${id}/close-won`, { method: 'POST' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['opp-board'] })
      void qc.invalidateQueries({ queryKey: ['opp-forecast'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const batchStageM = useMutation({
    mutationFn: (p: { ids: string[]; stageId: string }) =>
      api<{ ok: number; failed: number }>('/opportunities/batch-stage', {
        method: 'POST',
        body: JSON.stringify({ ...p, note: t('opp.batchChangeStage') }),
      }),
    onSuccess: (r) => {
      message.success(t('opp.changedStageForDeals', { ok: r.ok, v: r.failed ? t('opp.failed', { failed: r.failed }) : '' }))
      void qc.invalidateQueries({ queryKey: ['opp-board'] })
      void qc.invalidateQueries({ queryKey: ['opp-list'] })
      void qc.invalidateQueries({ queryKey: ['opp-forecast'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtopp0001"
        title={t('opp.deals')}
        subtitle={t('opp.salesPipelineForecast')}
        onRefresh={() => window.location.reload()}
      >
      <div className="crm-grid crm-cols-3 crm-h-sm">
        <Card className="crm-kpi">
          <Statistic title={t('common.deals2')} value={forecastQ.data?.totals.count ?? 0} />
        </Card>
        <Card className="crm-kpi crm-kpi-purple">
          <Statistic title={t('audit.field.amount')} value={forecastQ.data?.totals.amount ?? '0'} />
        </Card>
        <Card className="crm-kpi crm-kpi-gold">
          <Statistic title={t('common.weightedForecast')} value={forecastQ.data?.totals.weightedAmount ?? '0'} />
        </Card>
      </div>

      <ForecastBoard />

      <Card size="small" title={t('opp.forecastSubmissionThisMonth')} className="crm-panel-fixed" style={{ marginBottom: 16 }}>
        <Form
          layout="inline"
          onFinish={(v) => {
            void api('/opportunities/forecast-commit', {
              method: 'POST',
              body: JSON.stringify({
                commitAmount: String(v.commitAmount ?? 0),
                bestAmount: String(v.bestAmount ?? 0),
                worstAmount: String(v.worstAmount ?? 0),
                note: v.note,
              }),
            })
              .then(() => {
                message.success(t('opp.forecastSubmitted'))
                void qc.invalidateQueries({ queryKey: ['forecast-commits'] })
              })
              .catch((e: Error) => message.error(e.message))
          }}
        >
          <Form.Item name="commitAmount" label="Commit">
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="bestAmount" label="Best">
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="worstAmount" label="Worst">
            <InputNumber min={0} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="note" label={t('common.notes')}>
            <Input style={{ width: 180 }} placeholder={t('opp.keyDealsRisks')} />
          </Form.Item>
          <Button type="primary" htmlType="submit">{t('opp.submitForecast')}</Button>
        </Form>
        {commitsQ.data?.items?.length ? (
          <AutoFitTable
            style={{ marginTop: 12 }}
            rowKey="userId"
            size="small"
            pagination={false}
            dataSource={commitsQ.data.items}
            columns={[
              { title: t('common.sales'), dataIndex: 'userName' },
              { title: 'Commit', dataIndex: 'commitAmount' },
              { title: 'Best', dataIndex: 'bestAmount' },
              { title: 'Worst', dataIndex: 'worstAmount' },
              { title: t('common.notes'), dataIndex: 'note' },
            ]}
          />
        ) : null}
        {commitsQ.data?.totals && (
          <Space style={{ marginTop: 8 }}>
            <Tag>{t('opp.commitTotal', { commitAmount: commitsQ.data.totals.commitAmount })}</Tag>
            <Tag color="green">Best {commitsQ.data.totals.bestAmount}</Tag>
            <Tag color="orange">Worst {commitsQ.data.totals.worstAmount}</Tag>
          </Space>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Tag color={commitsQ.data?.items?.length ? 'blue' : 'default'}>{t('opp.submitted', { v: commitsQ.data?.items?.length ?? 0 })}</Tag>
          <Tag>{t('opp.commitCoverage', { v: ' ', v2: pipelineTotal
              ? `${((Number(commitsQ.data?.totals?.commitAmount ?? 0) / pipelineTotal) * 100).toFixed(0)}%`
              : '-' })}
          </Tag>
          <span className="crm-muted">{t('opp.definitionsCommitMustClose')}</span>
        </div>
      </Card>

      <Space style={{ marginBottom: 12, width: '100%' }} wrap>
        <Button type="primary" onClick={() => void openCreate()}>
          {t('common.create')}
        </Button>
        <span className="crm-muted">{t('audit.field.ownerId')}</span>
        <Select
          allowClear
          placeholder={t('opp.allOwners')}
          style={{ width: 160 }}
          value={ownerId}
          onChange={setOwnerId}
          showSearch
          optionFilterProp="label"
          options={(usersQ.data?.items ?? []).map((u) => ({ value: u.id, label: u.name }))}
        />
        {view === 'board' && (
          <>
            <Input
              allowClear
              placeholder={t('opp.searchDealsAccountsOwners')}
              style={{ width: 220 }}
              value={kw}
              onChange={(e) => setKw(e.target.value)}
            />
            <Tag color="blue">
              {t('opp.text', { boardTotal, boardAmount })}
            </Tag>
          </>
        )}
        <Button onClick={() => setView(view === 'board' ? 'list' : 'board')}>
          {view === 'board' ? t('opp.listView') : t('opp.boardView')}
        </Button>
      </Space>

      {view === 'board' ? (
        <PipelineBoard
          columns={boardColumns as unknown as BoardColumnData[]}
          onMove={(id, stageId) => moveStage.mutate({ id, stageId })}
          onWon={(id) => closeWon.mutate(id)}
          onLost={(id) => closeLost.mutate(id)}
        />
      ) : (
        isMobile ? (
          <MobileCardList
            loading={listQ.isLoading}
            items={(listQ.data?.items ?? []).map((o) => ({
              id: o.id,
              title: o.name,
              to: `/opportunities/${o.id}`,
              tags: <Tag>{o.stage?.name ?? '-'}</Tag>,
              subtitle: o.account?.name ?? '-',
              amount: o.amount,
              fields: [
                { label: t('audit.field.winRate'), value: `${o.winRate ?? 0}%` },
                { label: t('audit.field.ownerId'), value: o.owner?.name ?? '-' },
                { label: t('opp.expectedClose'), value: o.expectedCloseDate ? String(o.expectedCloseDate).slice(0, 10) : '-' },
              ],
            }))}
          />
        ) : (
        <ErpTable
          rowKey="id"
          storageKey="opps"
          loading={listQ.isLoading}
          dataSource={(listQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
          pageSize={15}
          onRowClick={(row) => nav(`/opportunities/${String(row.id)}`)}
          batchBar={(ids, rows, clear) => (
            <Space wrap>
              <Select
                style={{ width: 180 }}
                size="small"
                placeholder={t('opp.moveSelectedToStage')}
                options={(boardQ.data?.columns ?? []).map((x) => ({
                  value: x.stage.id,
                  label: x.stage.name,
                }))}
                onChange={(stageId: string) => {
                  batchStageM.mutate({ ids, stageId })
                  clear()
                }}
                allowClear
              />
              <Button
                size="small"
                onClick={() => {
                  for (const r of rows as unknown as {
                    name: string
                    amount: string
                    account?: { name?: string }
                    stage?: { name?: string }
                  }[]) {
                    exportWord({
                      title: t('common.deal', { name: r.name }),
                      meta: { name: r.name, category: r.stage?.name ?? '' },
                      terms: [
                        t('opp.dealName', { name: r.name }),
                        t('opp.account', { v: r.account?.name ?? '—' }),
                        t('common.stage', { v: r.stage?.name ?? '—' }),
                        t('opp.amount', { amount: r.amount }),
                      ].join('\n'),
                      filename: t('opp.deal', { name: r.name }),
                    })
                  }
                }}
              >{t('common.batchExportWord')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const r of rows as unknown as {
                    name: string
                    amount: string
                    account?: { name?: string }
                    stage?: { name?: string }
                  }[]) {
                    exportPdf({
                      title: t('common.deal', { name: r.name }),
                      meta: { name: r.name, category: r.stage?.name ?? '' },
                      terms: [
                        t('opp.dealName', { name: r.name }),
                        t('opp.account', { v: r.account?.name ?? '—' }),
                        t('common.stage', { v: r.stage?.name ?? '—' }),
                        t('opp.amount', { amount: r.amount }),
                      ].join('\n'),
                    })
                  }
                }}
              >{t('common.batchExportPdf')}</Button>
              <Button size="small" onClick={clear}>{t('common.clearSelection')}</Button>
            </Space>
          )}
          columns={[
            {
              title: t('nav.opportunities'),
              dataIndex: 'name',
              width: 180,
              filterType: 'text',
              sorter: true,
              render: (v, r) => (
                <Link to={`/opportunities/${String((r as unknown as Opp).id)}`}>{String(v)}</Link>
              ),
            },
            {
              title: t('nav.accounts'),
              dataIndex: 'account',
              width: 120,
              filterType: 'text',
              render: (v) => {
                const acc = v as { name?: string } | undefined
                return acc?.name ?? '-'
              },
            },
            {
              title: t('audit.field.stage'),
              dataIndex: 'stage',
              width: 100,
              filterType: 'text',
              render: (v) => {
                const st = v as { name?: string } | undefined
                return <Tag>{st?.name ?? '-'}</Tag>
              },
            },
            {
              title: t('audit.field.ownerId'),
              dataIndex: 'owner',
              width: 100,
              filterType: 'text',
              render: (v) => {
                const o = v as { name?: string } | undefined
                return o?.name ?? '-'
              },
            },
            { title: t('audit.field.amount'), dataIndex: 'amount', width: 100, filterType: 'number' },
            { title: t('common.winRate2'), dataIndex: 'winRate', width: 80, filterType: 'number' },
            {
              title: t('opp.expectedClose'),
              dataIndex: 'expectedCloseDate',
              width: 110,
              filterType: 'text',
              render: (v: unknown) => (v ? dayjs(String(v)).format('YYYY-MM-DD') : '-'),
            },
          ]}
        />
        )
      )}

      <Modal
        title={t('common.create')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMut.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => createMut.mutate(v)}
          initialValues={{ amount: 0, winRate: 10 }}
        >
          <Form.Item name="name" label={t('common.dealName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountId" label={t('nav.accounts')} rules={[{ required: true }]}>
            <Select options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="amount" label={t('audit.field.amount')}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="currency" label={t('currency.currency')}>
            <CurrencySelect />
          </Form.Item>
          <Form.Item name="expectedCloseDate" label={t('common.expectedCloseDate')} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="nextStep" label={t('account.nextAction')}>
            <Input />
          </Form.Item>
          <Form.Item name="source" label={t('common.source')}>
            <Select
              allowClear
              options={[
                { value: 'WEB_FORM', label: t('common.websiteForm') },
                { value: 'PHONE', label: t('enum.activity.type.CALL') },
                { value: 'REFERRAL', label: t('common.referral') },
                { value: 'EXHIBITION', label: t('common.tradeShow') },
                { value: 'COLD_CALL', label: t('opp.coldCall') },
                { value: 'ADS', label: t('opp.advertising') },
                { value: 'PARTNER', label: t('enablement.partners') },
                { value: 'OTHER', label: t('common.other') },
              ]}
            />
          </Form.Item>
          <Form.Item name="competitor" label={t('opp.mainCompetitors')}>
            <Input placeholder={t('opp.eGSalesforceNeocrm')} />
          </Form.Item>
        </Form>
      </Modal>
      </ErpListShell>
    </div>
  )
}
