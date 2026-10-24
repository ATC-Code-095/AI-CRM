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
  Tree,
  Typography,
} from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { BarChart, RadarChart } from '../../components/SimpleCharts'
import { t } from '../../i18n'

type Entity = {
  id: string
  code: string
  name: string
  shortName?: string
  parentId?: string | null
  type: 'GROUP' | 'SUBSIDIARY' | 'BRANCH'
  region?: string
  industry?: string
  status: 'ACTIVE' | 'INACTIVE'
}

/** 集团化管理：多法人主体 + 集团合并经营（对标 Multi-Org / 用友 NC） */
export default function GroupPage() {
  const nav = useNavigate()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['group-entities'],
    queryFn: () => api<{ items: Entity[] }>('/group/entities'),
    retry: false,
  })

  const treeQ = useQuery({
    queryKey: ['group-tree'],
    queryFn: () =>
      api<{
        items: (Entity & { children?: (Entity & { children?: unknown[] })[] })[]
      }>('/group/tree'),
    retry: false,
  })

  const budgetsQ = useQuery({
    queryKey: ['group-budgets'],
    queryFn: () =>
      api<{
        items: {
          id: string
          entityId: string
          year: string
          budgetAmount: string
          expenseAmount: string
          note?: string
        }[]
      }>('/group/budgets'),
    retry: false,
  })

  const rankQ = useQuery({
    queryKey: ['group-rank'],
    queryFn: () =>
      api<{
        items: {
          rank: number
          id: string
          code: string
          name: string
          contractAmount: string
          received: string
          receiveRate: string
        }[]
      }>('/group/rank'),
    retry: false,
  })

  const budExec = useQuery({
    queryKey: ['group-budget-exec'],
    queryFn: () =>
      api<{
        items: {
          entityName: string
          year: string
          budgetAmount: string
          expenseAmount: string
          rate: string
          status: string
        }[]
        totalBudget: string
        totalExpense: string
        totalRate: string
      }>('/group/budget-execution'),
    retry: false,
  })

  const crossDup = useQuery({
    queryKey: ['group-cross-dup'],
    queryFn: () =>
      api<{
        items: {
          name: string
          items: { id: string; entityName: string }[]
        }[]
        total: number
      }>('/group/cross-duplicates'),
    retry: false,
  })

  const monthly = useQuery({
    queryKey: ['group-monthly'],
    queryFn: () =>
      api<{
        month: string
        wonAmount: string
        wonCount: number
        contractAmount: string
        received: string
        budget: string
      }>('/group/monthly-report'),
    retry: false,
  })

  const trendQ = useQuery({
    queryKey: ['group-trend'],
    queryFn: () =>
      api<{
        items: {
          month: string
          wonAmount: string
          contractAmount: string
          received: string
        }[]
      }>('/group/trend'),
    retry: false,
  })

  const [allocAmount, setAllocAmount] = useState('')
  const [allocOpen, setAllocOpen] = useState(false)
  const [allocForm] = Form.useForm()

  const profitQ = useQuery({
    queryKey: ['group-profit'],
    queryFn: () =>
      api<{
        year: string
        revenue: string
        contractAmount: string
        costEstimate: string
        budgetExpense: string
        allocatedExpense: string
        profit: string
        margin: string
      }>('/group/profit'),
    retry: false,
  })

  const expHist = useQuery({
    queryKey: ['group-expense-history'],
    queryFn: () =>
      api<{
        items: {
          id: string
          totalAmount: string
          note?: string
          createdAt: string
          rows: { entityName: string; amount: string }[]
        }[]
      }>('/group/expense-history'),
    retry: false,
  })

  const profitByEnt = useQuery({
    queryKey: ['group-profit-by-entity'],
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          code: string
          revenue: string
          expense: string
          profit: string
          margin: string
        }[]
      }>('/group/profit-by-entity'),
    retry: false,
  })

  const compareQ = useQuery({
    queryKey: ['group-compare'],
    queryFn: () =>
      api<{
        items: {
          name: string
          revenueScore: number
          expenseScore: number
          profitScore: number
        }[]
      }>('/group/compare-metrics'),
    retry: false,
  })

  const autoMergeM = useMutation({
    mutationFn: () => api<{ merged: number }>('/group/auto-merge', { method: 'POST' }),
    onSuccess: (r) => {
      message.success(t('group.autoMergeCompleteMerged', { merged: r.merged }))
      void qc.invalidateQueries({ queryKey: ['group-cross-dup'] })
      void qc.invalidateQueries({ queryKey: ['group-overview'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const rulesQ = useQuery({
    queryKey: ['group-approval-rules'],
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          type: string
          threshold: string
          approvers: string
          active: boolean
        }[]
      }>('/group/approval-rules'),
    retry: false,
  })

  const [ruleOpen, setRuleOpen] = useState(false)
  const [ruleEditId, setRuleEditId] = useState<string | null>(null)
  const [ruleForm] = Form.useForm()
  const saveRuleM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/approval-rule', {
        method: 'POST',
        body: JSON.stringify({ ...v, id: ruleEditId ?? undefined }),
      }),
    onSuccess: () => {
      message.success(t('group.approvalRulesSaved'))
      setRuleOpen(false)
      setRuleEditId(null)
      ruleForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-approval-rules'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const subQ = useQuery({
    queryKey: ['group-brief-sub'],
    queryFn: () =>
      api<{ enabled: boolean; frequency: string; recipients: string[] }>(
        '/group/brief-subscribe',
      ),
    retry: false,
  })
  const saveSubM = useMutation({
    mutationFn: (enabled: boolean) =>
      api('/group/brief-subscribe', {
        method: 'POST',
        body: JSON.stringify({
          enabled,
          frequency: subQ.data?.frequency ?? 'weekly',
          recipients: subQ.data?.recipients ?? [],
        }),
      }),
    onSuccess: () => {
      message.success(t('common.subscriptionUpdated'))
      void qc.invalidateQueries({ queryKey: ['group-brief-sub'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const sendBriefM = useMutation({
    mutationFn: () => api<{ text: string }>('/group/send-brief', { method: 'POST' }),
    onSuccess: (r) => {
      void navigator.clipboard.writeText(r.text)
      message.success(t('group.briefGeneratedAndCopied'))
    },
    onError: (e: Error) => message.error(e.message),
  })

  const deliverBriefM = useMutation({
    mutationFn: () =>
      api<{ to: string; month: string }>('/group/deliver-brief', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (r) => {
      message.success(t('group.briefDeliveredTo', { to: r.to }))
      void qc.invalidateQueries({ queryKey: ['email-engagement'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const claimsQ = useQuery({
    queryKey: ['group-expense-claims'],
    queryFn: () =>
      api<{
        items: {
          id: string
          title: string
          category: string
          amount: string
          status: string
          entityId: string
        }[]
      }>('/group/expense-claims'),
    retry: false,
  })

  const [claimOpen, setClaimOpen] = useState(false)
  const [claimForm] = Form.useForm()
  const saveClaimM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/expense-claims', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('group.expenseReportSubmitted'))
      setClaimOpen(false)
      claimForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-expense-claims'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const decideClaimM = useMutation({
    mutationFn: (p: { id: string; action: 'APPROVED' | 'REJECTED' }) =>
      api(`/group/expense-claims/${p.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ action: p.action }),
      }),
    onSuccess: (_r, v) => {
      message.success(v.action === 'APPROVED' ? t('group.approvedAndChargedTo') : t('enum.quote.status.REJECTED'))
      void qc.invalidateQueries({ queryKey: ['group-expense-claims'] })
      void qc.invalidateQueries({ queryKey: ['group-budget-exec'] })
      void qc.invalidateQueries({ queryKey: ['group-expense-center'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const cockpitQ = useQuery({
    queryKey: ['group-cockpit'],
    queryFn: () =>
      api<{
        month: string
        wonAmount: string
        contractAmount: string
        received: string
        profit: string
        margin: string
        topEntity: string
        totalExpense: string
        budgetRate: string
      }>('/group/cockpit'),
    retry: false,
  })

  const annualQ = useQuery({
    queryKey: ['group-annual'],
    queryFn: () =>
      api<{
        year: string
        wonCount: number
        wonAmount: string
        contractCount: number
        contractAmount: string
        received: string
        profit: string
        margin: string
        top3: { rank: number; name: string; contractAmount: string }[]
      }>('/group/annual-report'),
    retry: false,
  })

  const decide2M = useMutation({
    mutationFn: (p: { id: string; action: 'APPROVED' | 'REJECTED' }) =>
      api(`/group/expense-claims/${p.id}/approve-level2`, {
        method: 'POST',
        body: JSON.stringify({ action: p.action }),
      }),
    onSuccess: () => {
      message.success(t('group.secondLevelApprovalComplete'))
      void qc.invalidateQueries({ queryKey: ['group-expense-claims'] })
      void qc.invalidateQueries({ queryKey: ['group-budget-exec'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const budgetAlertM = useMutation({
    mutationFn: () =>
      api<{ sent: number; users: number }>('/group/budget-alert', { method: 'POST' }),
    onSuccess: (r) => {
      message.success(t('group.pushedBudgetAlertsTo', { sent: r.sent, users: r.users }))
    },
    onError: (e: Error) => message.error(e.message),
  })

  const alertSchedQ = useQuery({
    queryKey: ['group-alert-sched'],
    queryFn: () =>
      api<{ enabled: boolean; cron: string }>('/group/alert-schedule'),
    retry: false,
  })
  const saveSchedM = useMutation({
    mutationFn: (enabled: boolean) =>
      api('/group/alert-schedule', {
        method: 'POST',
        body: JSON.stringify({ enabled, cron: alertSchedQ.data?.cron }),
      }),
    onSuccess: () => {
      message.success(t('group.alertScheduleUpdated'))
      void qc.invalidateQueries({ queryKey: ['group-alert-sched'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const financeQ = useQuery({
    queryKey: ['group-finance'],
    queryFn: () =>
      api<{
        year: string
        contractTotal: string
        receivedOnContract: string
        cashIn: string
        receivable: string
        overduePlanCount: number
        overduePlanAmount: string
        totalExpense: string
        profit: string
        margin: string
      }>('/group/consolidated-finance'),
    retry: false,
  })

  const [transferOpen, setTransferOpen] = useState(false)
  const [transferForm] = Form.useForm()
  const transferM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/fund-transfer', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('group.fundTransferRecorded'))
      setTransferOpen(false)
      transferForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-fund-transfers'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const transfersQ = useQuery({
    queryKey: ['group-fund-transfers'],
    queryFn: () =>
      api<{
        items: {
          id: string
          fromEntityId: string
          toEntityId: string
          amount: string
          note?: string
          status?: string
        }[]
      }>('/group/fund-transfers'),
    retry: false,
  })

  const cashTrendQ = useQuery({
    queryKey: ['group-cash-pool-trend'],
    queryFn: () =>
      api<{
        items: { month: string; transferAmount: string; count: number }[]
      }>('/group/cash-pool-trend'),
    retry: false,
  })

  const settlementsQ = useQuery({
    queryKey: ['group-settlements'],
    queryFn: () =>
      api<{
        items: {
          id: string
          settleNo: string
          title: string
          amount: string
          status: string
          fromEntityId: string
          toEntityId: string
          category: string
        }[]
      }>('/group/settlements'),
    retry: false,
  })
  const [settleOpen, setSettleOpen] = useState(false)
  const [settleForm] = Form.useForm()
  const createSettleM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/settlements', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('group.settlementCreated'))
      setSettleOpen(false)
      settleForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-settlements'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const settleStatusM = useMutation({
    mutationFn: (p: { id: string; status: string }) =>
      api(`/group/settlements/${p.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: p.status }),
      }),
    onSuccess: () => {
      message.success(t('group.settlementStatusUpdated'))
      void qc.invalidateQueries({ queryKey: ['group-settlements'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const [settleSel, setSettleSel] = useState<string[]>([])
  const batchSettleM = useMutation({
    mutationFn: (status: string) =>
      api<{ ok: number }>('/group/settlements/batch-status', {
        method: 'POST',
        body: JSON.stringify({ ids: settleSel, status }),
      }),
    onSuccess: (r) => {
      message.success(t('group.batchProcessed', { ok: r.ok }))
      setSettleSel([])
      void qc.invalidateQueries({ queryKey: ['group-settlements'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const [printSettle, setPrintSettle] = useState<{
    settleNo: string
    title: string
    amount: string
    category: string
    status: string
    fromName: string
    toName: string
  } | null>(null)
  const printSettleM = useMutation({
    mutationFn: (id: string) =>
      api<{
        item: { settleNo: string; title: string; amount: string; category: string; status: string }
        fromName: string
        toName: string
      }>(`/group/settlements/${id}/print`),
    onSuccess: (r) => {
      setPrintSettle({
        ...r.item,
        fromName: r.fromName,
        toName: r.toName,
      })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const cashPoolQ = useQuery({
    queryKey: ['group-cash-pool'],
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          transferIn: string
          transferOut: string
          net: string
        }[]
        totalNet: string
        profit: string
      }>('/group/cash-pool'),
    retry: false,
  })

  const decideTransferM = useMutation({
    mutationFn: (p: { id: string; action: 'APPROVED' | 'REJECTED' }) =>
      api(`/group/fund-transfers/${p.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ action: p.action }),
      }),
    onSuccess: () => {
      message.success(t('group.transferProcessed'))
      void qc.invalidateQueries({ queryKey: ['group-fund-transfers'] })
      void qc.invalidateQueries({ queryKey: ['group-cash-pool'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const expenseCenter = useQuery({
    queryKey: ['group-expense-center'],
    queryFn: () =>
      api<{
        budgetExpense: string
        allocatedExpense: string
        totalExpense: string
        allocCount: number
        byEntity: { entityName: string; amount: string }[]
      }>('/group/expense-center'),
    retry: false,
  })

  const [goalOpen, setGoalOpen] = useState(false)
  const [goalForm] = Form.useForm()
  const allocGoalM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/allocate-goal', {
        method: 'POST',
        body: JSON.stringify({
          totalAmount: String(v.totalAmount ?? 0),
          metric: v.metric,
          periodKey: v.periodKey,
        }),
      }),
    onSuccess: () => {
      message.success(t('group.goalsAllocatedToLegal'))
      setGoalOpen(false)
      goalForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-overview'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const allocM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/allocate-expense', {
        method: 'POST',
        body: JSON.stringify({ totalAmount: String(v.totalAmount ?? 0), note: v.note }),
      }),
    onSuccess: () => {
      message.success(t('group.expensesAllocatedByEntity'))
      setAllocOpen(false)
      allocForm.resetFields()
    },
    onError: (e: Error) => message.error(e.message),
  })

  const mergeAccM = useMutation({
    mutationFn: (p: { sourceId: string; targetId: string }) =>
      api('/group/merge-accounts', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => {
      message.success(t('group.crossEntityAccountsMerged'))
      void qc.invalidateQueries({ queryKey: ['group-cross-dup'] })
      void qc.invalidateQueries({ queryKey: ['group-overview'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const scopesQ = useQuery({
    queryKey: ['group-user-scopes'],
    queryFn: () => api<{ map: Record<string, string[]> }>('/group/user-scopes'),
    retry: false,
  })

  const [scopeUser, setScopeUser] = useState<string | null>(null)
  const [scopeEnts, setScopeEnts] = useState<string[]>([])
  const usersQ = useQuery({
    queryKey: ['users-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/users?pageSize=50'),
    retry: false,
  })

  const saveScopeM = useMutation({
    mutationFn: () =>
      api('/group/user-scopes', {
        method: 'POST',
        body: JSON.stringify({ userId: scopeUser, entityIds: scopeEnts }),
      }),
    onSuccess: () => {
      message.success(t('group.entityVisibilitySaved'))
      void qc.invalidateQueries({ queryKey: ['group-user-scopes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetForm] = Form.useForm()
  const [assignAcc, setAssignAcc] = useState<string | null>(null)
  const [assignEnt, setAssignEnt] = useState<string | null>(null)

  const accountsQ = useQuery({
    queryKey: ['accounts-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=50'),
    retry: false,
  })

  const entityMapQ = useQuery({
    queryKey: ['group-account-entities'],
    queryFn: () => api<{ map: Record<string, string> }>('/group/account-entities'),
    retry: false,
  })
  const entityMap = entityMapQ.data?.map ?? {}

  const assignM = useMutation({
    mutationFn: (p: { accountId: string; entityId: string | null }) =>
      api('/group/account-entities', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: () => {
      message.success(t('group.accountEntityUpdated'))
      void qc.invalidateQueries({ queryKey: ['group-account-entities'] })
      void qc.invalidateQueries({ queryKey: ['group-overview'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const saveBudgetM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/group/budgets', {
        method: 'POST',
        body: JSON.stringify({
          entityId: v.entityId,
          year: String(v.year ?? new Date().getFullYear()),
          budgetAmount: String(v.budgetAmount ?? 0),
          expenseAmount: String(v.expenseAmount ?? 0),
          note: v.note,
        }),
      }),
    onSuccess: () => {
      message.success(t('group.budgetSaved'))
      setBudgetOpen(false)
      budgetForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-budgets'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const overview = useQuery({
    queryKey: ['group-overview'],
    queryFn: () =>
      api<{
        entities: {
          id: string
          code: string
          name: string
          type: string
          accountCount: number
          wonAmount: string
          openAmount: string
          contractAmount: string
          received: string
        }[]
        total: {
          wonAmount: string
          openAmount: string
          contractAmount: string
          received: string
        }
      }>('/group/overview'),
    retry: false,
  })

  const saveM = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      if (editId) return api(`/group/entities/${editId}`, { method: 'PUT', body: JSON.stringify(v) })
      return api('/group/entities', { method: 'POST', body: JSON.stringify(v) })
    },
    onSuccess: () => {
      message.success(t('group.legalEntitySaved'))
      setOpen(false)
      setEditId(null)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['group-entities'] })
      void qc.invalidateQueries({ queryKey: ['group-overview'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const delM = useMutation({
    mutationFn: (id: string) => api(`/group/entities/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success(t('common.deleted'))
      void qc.invalidateQueries({ queryKey: ['group-entities'] })
      void qc.invalidateQueries({ queryKey: ['group-overview'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card size="small" className="crm-panel-fixed crm-panel-sm">
            <Statistic
              title={t('group.consolidatedProfit', { v: profitQ.data?.year ?? '' })}
              value={profitQ.data?.profit ?? '0'}
              valueStyle={{ color: Number(profitQ.data?.profit ?? 0) >= 0 ? '#0d9488' : '#e11d48' }}
            />
            <div style={{ fontSize: 12, color: '#646A73' }}>{t('group.margin', { v: profitQ.data?.margin ?? 0 })}</div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="crm-panel-fixed crm-panel-sm">
            <Statistic title={t('common.totalWon')} value={overview.data?.total.wonAmount ?? '0'} valueStyle={{ color: '#0d9488' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="crm-panel-fixed crm-panel-sm">
            <Statistic title={t('common.openDeals')} value={overview.data?.total.openAmount ?? '0'} valueStyle={{ color: '#2b5fd9' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="crm-panel-fixed crm-panel-sm">
            <Statistic title={t('common.contractAmount')} value={overview.data?.total.contractAmount ?? '0'} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" className="crm-panel-fixed crm-panel-sm">
            <Statistic title={t('common.collectedAmount')} value={overview.data?.total.received ?? '0'} valueStyle={{ color: '#0d9488' }} />
          </Card>
        </Col>
      </Row>
      <Tabs
        defaultActiveKey="overview"
        style={{ marginBottom: 12 }}
        items={[
          {
            key: 'overview',
            label: t('group.businessOverview'),
            children: (
              <>
      <Card
        size="small"
        className="crm-panel-fixed crm-block-lg"
        title={t('group.groupBusinessTrendLast')}
        style={{ marginBottom: 12 }}
        extra={
          <Button size="small" onClick={() => setAllocOpen(true)}>{t('group.expenseAllocation')}</Button>
        }
      >
        <BarChart
          items={(trendQ.data?.items ?? []).map((t) => ({
            label: t.month,
            value: Number(t.contractAmount),
          }))}
          color="#2b5fd9"
          height={140}
        />
        <Table
          style={{ marginTop: 12 }}
          rowKey="month"
          size="small"
          pagination={false}
          dataSource={trendQ.data?.items ?? []}
          columns={[
            { title: t('common.month'), dataIndex: 'month' },
            { title: t('enum.stage.WON'), dataIndex: 'wonAmount' },
            { title: t('common.contractAmount'), dataIndex: 'contractAmount' },
            { title: t('nav.payments'), dataIndex: 'received' },
          ]}
        />
      </Card>
      <Card
        size="small"
        className="crm-panel-fixed crm-panel-sm"
        title={t('group.monthlyBusinessBrief', { v: monthly.data?.month ?? '' })}
        style={{ marginBottom: 12 }}
      >
        <Space size="large" wrap>
          <Statistic title={t('group.wonThisMonth')} value={monthly.data?.wonAmount ?? '0'} valueStyle={{ color: '#0d9488' }} />
          <Statistic title={t('group.dealsWon')} value={monthly.data?.wonCount ?? 0} />
          <Statistic title={t('group.newContracts')} value={monthly.data?.contractAmount ?? '0'} />
          <Statistic title={t('group.collectedThisMonth')} value={monthly.data?.received ?? '0'} valueStyle={{ color: '#2b5fd9' }} />
          <Statistic title={t('group.annualBudget')} value={monthly.data?.budget ?? '0'} />
        </Space>
      </Card>
      <Card
        size="small"
        className="crm-panel-fixed crm-block-lg"
        title={t('group.groupCockpit', { v: cockpitQ.data?.month ?? '' })}
        style={{ marginBottom: 12 }}
      >
        <Space size="large" wrap>
          <Statistic title={t('group.wonThisMonth')} value={cockpitQ.data?.wonAmount ?? '0'} valueStyle={{ color: '#0d9488' }} />
          <Statistic title={t('group.newContracts')} value={cockpitQ.data?.contractAmount ?? '0'} />
          <Statistic title={t('nav.payments')} value={cockpitQ.data?.received ?? '0'} valueStyle={{ color: '#2b5fd9' }} />
          <Statistic
            title={t('group.profitThisYear')}
            value={cockpitQ.data?.profit ?? '0'}
            valueStyle={{ color: Number(cockpitQ.data?.profit ?? 0) >= 0 ? '#0d9488' : '#e11d48' }}
          />
          <Statistic title={t('group.profitMargin')} value={`${cockpitQ.data?.margin ?? 0}%`} />
          <Statistic title={t('group.topEntity')} value={cockpitQ.data?.topEntity ?? '-'} />
          <Statistic title={t('group.totalExpenses')} value={cockpitQ.data?.totalExpense ?? '0'} />
          <Statistic title={t('group.budgetExecution')} value={`${cockpitQ.data?.budgetRate ?? 0}%`} />
        </Space>
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px dashed #e2e8f0',
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 12, color: '#646A73' }}>
            <b style={{ color: '#1e293b' }}>{t('group.consolidatedFinancials')}</b>{t('group.contractsReceivedCashIn', { v: financeQ.data?.contractTotal ?? '0', v2: financeQ.data?.receivedOnContract ?? '0', v3: financeQ.data?.cashIn ?? '0', v4: financeQ.data?.receivable ?? '0', v5: financeQ.data?.overduePlanCount ?? 0 })}
          </span>
          <Button
            size="small"
            loading={saveSchedM.isPending}
            onClick={() => saveSchedM.mutate(!alertSchedQ.data?.enabled)}
          >{t('group.alertSchedule')}{alertSchedQ.data?.enabled ? t('group.on') : t('group.off')}
          </Button>
          <Button size="small" onClick={() => setTransferOpen(true)}>{t('group.fundTransfers')}</Button>
          <Link to="/group/screen">
            <Button size="small" type="primary">{t('group.cockpitScreen')}</Button>
          </Link>
          <Button
            size="small"
            onClick={() => {
              const f = financeQ.data
              const csv = [
                t('group.metricAmount'),
                t('group.contractTotal', { v: f?.contractTotal ?? 0 }),
                t('group.receivedOnContracts', { v: f?.receivedOnContract ?? 0 }),
                t('group.cashIn', { v: f?.cashIn ?? 0 }),
                t('group.receivables', { v: f?.receivable ?? 0 }),
                t('group.overduePlans', { v: f?.overduePlanAmount ?? 0 }),
                t('group.totalExpenses2', { v: f?.totalExpense ?? 0 }),
                t('group.profit', { v: f?.profit ?? 0 }),
              ].join('\n')
              const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'group-finance.csv'
              a.click()
              URL.revokeObjectURL(url)
              message.success(t('group.financialReportDownloaded'))
            }}
          >{t('group.downloadFinancials')}</Button>
        </div>
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px dashed #e2e8f0',
            fontSize: 12,
            color: '#646A73',
          }}
        >
          <b style={{ color: '#1e293b' }}>{annualQ.data?.year}{' '}{t('group.yearbook')}</b>{t('group.wonDealsContractsCollected', { v: annualQ.data?.wonCount ?? 0, v2: annualQ.data?.wonAmount ?? '0', v3: annualQ.data?.contractCount ?? 0, v4: annualQ.data?.contractAmount ?? '0', v5: annualQ.data?.received ?? '0', v6: (annualQ.data?.top3 ?? []).map((t) => t.name).join(' / ') || '-' })}
          <Button size="small" type="link" onClick={() => window.print()}>{t('group.exportYearbook')}</Button>
        </div>
      </Card>
      <Card
        size="small"
        className="crm-panel-fixed"
        title={t('group.groupConsolidatedOperations')}
        style={{ marginBottom: 12 }}
        extra={
          <Space>
            <Button size="small" onClick={() => setGoalOpen(true)}>{t('group.goalAllocation')}</Button>
            <Button size="small" onClick={() => window.print()}>{t('group.printBrief')}</Button>
            <Button
              size="small"
              loading={sendBriefM.isPending}
              onClick={() => sendBriefM.mutate()}
            >{t('group.sendBrief')}</Button>
            <Button
              size="small"
              type="primary"
              loading={deliverBriefM.isPending}
              onClick={() => deliverBriefM.mutate()}
            >{t('group.deliverByEmail')}</Button>
            <Button
              size="small"
              onClick={() => {
                const rows = profitByEnt.data?.items ?? []
                const csv = [
                  t('group.entityRevenueExpensesProfit'),
                  ...rows.map((r) => [r.name, r.revenue, r.expense, r.profit, r.margin].join(',')),
                ].join('\n')
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'group-profit-compare.csv'
                a.click()
                URL.revokeObjectURL(url)
                message.success(t('group.entityComparisonExported'))
              }}
            >{t('group.exportComparison')}</Button>
          <Button
            size="small"
            onClick={() => {
              const rows = overview.data?.entities ?? []
              const header = [t('common.code'), t('group.entity'), t('common.type'), t('group.accounts'), t('enum.stage.WON'), t('common.openDeals'), t('common.contractAmount'), t('nav.payments')]
              const body = rows.map((e: {
                code: string
                name: string
                type: string
                accountCount: number
                wonAmount: string
                openAmount: string
                contractAmount: string
                received: string
              }) =>
                [
                  e.code,
                  e.name,
                  e.type,
                  e.accountCount,
                  e.wonAmount,
                  e.openAmount,
                  e.contractAmount,
                  e.received,
                ].join(','),
              )
              const csv = [header.join(','), ...body].join('\n')
              const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'group-overview.csv'
              a.click()
              URL.revokeObjectURL(url)
              message.success(t('group.consolidatedReportExported'))
            }}
          >{t('common.exportCsv')}</Button>
          <Button
            size="small"
            type="primary"
            onClick={() => nav('/group/report')}
          >{t('group.consolidatedReportPdf')}</Button>
          </Space>
        }
      >
        <BarChart
          items={(overview.data?.entities ?? []).map((e: { name: string; contractAmount: string }) => ({
            label: e.name,
            value: Number(e.contractAmount),
          }))}
          color="#2b5fd9"
          height={120}
        />
        <Table
          style={{ marginTop: 12 }}
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={overview.data?.entities ?? []}
          columns={[
            { title: t('common.code'), dataIndex: 'code', width: 80 },
            { title: t('group.entity'), dataIndex: 'name' },
            {
              title: t('common.type'),
              dataIndex: 'type',
              width: 100,
              render: (v: string) => (
                <Tag color={v === 'GROUP' ? 'blue' : v === 'BRANCH' ? 'geekblue' : 'green'}>{v}</Tag>
              ),
            },
            { title: t('nav.accounts'), dataIndex: 'accountCount', width: 70 },
            { title: t('enum.stage.WON'), dataIndex: 'wonAmount' },
            { title: t('common.openDeals'), dataIndex: 'openAmount' },
            { title: t('nav.payments'), dataIndex: 'received' },
          ]}
        />
      </Card>
              </>
            ),
          },
          {
            key: 'ops',
            label: t('group.structureAnalysis'),
            children: (
              <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={8}>
          <Card size="small" className="crm-panel-fixed" title={t('group.entityHierarchy')}>
            {treeQ.data?.items?.length ? (
              <Tree
                defaultExpandAll
                showLine
                treeData={(function toTree(list: unknown[]): {
                  key: string
                  title: string
                  children?: ReturnType<typeof toTree>
                }[] {
                  return list.map((n) => {
                    const x = n as Entity & { children?: unknown[] }
                    return {
                      key: x.id,
                      title: `${x.name}（${x.code}）`,
                      children: x.children?.length ? toTree(x.children) : [],
                    }
                  })
                })(treeQ.data.items)}
              />
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('group.noEntitiesYetCreate')}</div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.annualBudgetExpenses')}
            extra={
              <Button size="small" type="primary" onClick={() => setBudgetOpen(true)}>{t('group.enterBudget')}</Button>
            }
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={budgetsQ.data?.items ?? []}
              columns={[
                {
                  title: t('group.entity'),
                  dataIndex: 'entityId',
                  render: (v: string) =>
                    listQ.data?.items?.find((x) => x.id === v)?.name ?? v,
                },
                { title: t('group.year'), dataIndex: 'year', width: 70 },
                { title: t('common.budget'), dataIndex: 'budgetAmount', width: 90 },
                { title: t('group.expenses'), dataIndex: 'expenseAmount', width: 90 },
                {
                  title: t('group.execution'),
                  render: (_: unknown, r: { budgetAmount: string; expenseAmount: string }) => {
                    const b = Number(r.budgetAmount)
                    return b > 0 ? `${((Number(r.expenseAmount) / b) * 100).toFixed(0)}%` : '-'
                  },
                },
              ]}
            />
            {!(budgetsQ.data?.items ?? []).length && (
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>{t('group.noBudgetRecords')}</div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" className="crm-panel-fixed" title={t('group.accountLegalEntity')}>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                showSearch
                allowClear
                style={{ flex: 1 }}
                placeholder={t('common.selectAccount')}
                options={(accountsQ.data?.items ?? []).map((a: { id: string; name: string }) => ({
                  value: a.id,
                  label: a.name,
                }))}
                value={assignAcc || undefined}
                onChange={(v: string) => setAssignAcc(v)}
              />
              <Select
                style={{ width: 140 }}
                placeholder={t('group.entity')}
                allowClear
                options={(listQ.data?.items ?? []).map((x: Entity) => ({
                  value: x.id,
                  label: x.name,
                }))}
                value={assignEnt || undefined}
                onChange={(v: string) => setAssignEnt(v)}
              />
              <Button
                type="primary"
                disabled={!assignAcc}
                loading={assignM.isPending}
                onClick={() =>
                  assignAcc &&
                  assignM.mutate({ accountId: assignAcc, entityId: assignEnt || null })
                }
              >{t('group.assign')}</Button>
            </Space.Compact>
            <div style={{ marginTop: 8, fontSize: 12, color: '#646A73' }}>{t('group.assignedAccounts', { length: Object.keys(entityMap ?? {}).length })}</div>
            <div style={{ marginTop: 8, maxHeight: 140, overflow: 'auto' }}>
              {Object.entries(entityMap ?? {})
                .slice(0, 8)
                .map(([accId, entId]) => (
                  <div
                    key={accId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    <span>
                      {accountsQ.data?.items?.find((a: { id: string }) => a.id === accId)?.name ??
                        accId}
                    </span>
                    <Tag>
                      {listQ.data?.items?.find((x) => x.id === entId)?.name ?? entId}
                    </Tag>
                  </div>
                ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" className="crm-panel-fixed" title={t('group.subsidiaryRanking')}>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={rankQ.data?.items ?? []}
              columns={[
                {
                  title: '#',
                  dataIndex: 'rank',
                  width: 48,
                  render: (v: number) => (
                    <Tag color={v === 1 ? 'gold' : v === 2 ? 'silver' : v === 3 ? 'orange' : 'default'}>
                      {v}
                    </Tag>
                  ),
                },
                { title: t('group.entity'), dataIndex: 'name' },
                { title: t('common.contractAmount'), dataIndex: 'contractAmount' },
                { title: t('group.collectionRate'), dataIndex: 'receiveRate' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.entityPermissionIsolation')}
            extra={
              <Button
                size="small"
                type="primary"
                disabled={!scopeUser}
                loading={saveScopeM.isPending}
                onClick={() => saveScopeM.mutate()}
              >{t('common.save')}</Button>
            }
          >
            <Space.Compact style={{ width: '100%' }}>
              <Select
                style={{ flex: 1 }}
                placeholder={t('common.selectUser')}
                allowClear
                options={(usersQ.data?.items ?? []).map((u: { id: string; name: string }) => ({
                  value: u.id,
                  label: u.name,
                }))}
                value={scopeUser || undefined}
                onChange={(v: string) => {
                  setScopeUser(v)
                  setScopeEnts(scopesQ.data?.map?.[v] ?? [])
                }}
              />
            </Space.Compact>
            <Select
              mode="multiple"
              style={{ width: '100%', marginTop: 8 }}
              placeholder={t('group.visibleLegalEntitiesEmpty')}
              allowClear
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
              value={scopeEnts}
              onChange={(v: string[]) => setScopeEnts(v)}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#646A73' }}>{t('group.usersConfigured', { length: Object.keys(scopesQ.data?.map ?? {}).length })}</div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" className="crm-panel-fixed" title={t('group.entityCapabilityRadar')}>
            <RadarChart
              axes={[t('group.revenue'), t('group.expenses'), t('group.profit2')]}
              items={(profitByEnt.data?.items ?? []).slice(0, 3).map((p, i) => {
                const m = compareQ.data?.items?.find((x) => x.name === p.name)
                return {
                  name: p.name,
                  scores: [m?.revenueScore ?? 0, m?.expenseScore ?? 0, m?.profitScore ?? 0],
                  color: i === 0 ? '#2b5fd9' : i === 1 ? '#0d9488' : '#d97706',
                }
              })}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(profitByEnt.data?.items ?? []).slice(0, 3).map((p, i) => (
                <span key={p.id} style={{ fontSize: 12, color: '#646A73' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: i === 0 ? '#2b5fd9' : i === 1 ? '#0d9488' : '#d97706',
                      marginRight: 4,
                    }}
                  />
                  {p.name}
                </span>
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.entityProfitComparison')}
            extra={<Tag color="blue">{profitByEnt.data?.items?.length ?? 0}</Tag>}
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={profitByEnt.data?.items ?? []}
              columns={[
                { title: t('group.entity'), dataIndex: 'name' },
                { title: t('group.revenue'), dataIndex: 'revenue' },
                { title: t('group.expenses'), dataIndex: 'expense' },
                {
                  title: t('group.profit2'),
                  dataIndex: 'profit',
                  render: (v: string) => (
                    <b style={{ color: Number(v) >= 0 ? '#0d9488' : '#e11d48' }}>{v}</b>
                  ),
                },
                {
                  title: t('group.profitMargin'),
                  dataIndex: 'margin',
                  render: (v: string) => (
                    <Tag color={Number(v) >= 20 ? 'green' : Number(v) >= 0 ? 'blue' : 'red'}>
                      {v}%
                    </Tag>
                  ),
                },
                {
                  title: t('common.overallScore'),
                  render: (_: unknown, r: { id: string }) => {
                    const m = compareQ.data?.items?.find((x) => x.name === profitByEnt.data?.items?.find((p) => p.id === r.id)?.name)
                    const score = m
                      ? Math.round((m.revenueScore + m.profitScore + (100 - m.expenseScore)) / 3)
                      : 0
                    return (
                      <Tag color={score >= 70 ? 'green' : score >= 40 ? 'blue' : 'default'}>
                        {score}
                      </Tag>
                    )
                  },
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.budgetExecutionAnalysis')}
            extra={
              <Space>
                <Tag>{budExec.data?.totalRate ?? 0}%</Tag>
                <Button
                  size="small"
                  loading={budgetAlertM.isPending}
                  onClick={() => budgetAlertM.mutate()}
                >{t('group.pushAlerts')}</Button>
              </Space>
            }
          >
            <Table<{
              entityName: string
              year: string
              budgetAmount: string
              expenseAmount: string
              rate: string
              status: string
            }>
              rowKey={(r) => `${r.entityName}-${r.year}`}
              size="small"
              pagination={false}
              dataSource={budExec.data?.items ?? []}
              columns={[
                { title: t('group.entity'), dataIndex: 'entityName' },
                { title: t('common.budget'), dataIndex: 'budgetAmount' },
                { title: t('group.expenses'), dataIndex: 'expenseAmount' },
                {
                  title: t('group.execution2'),
                  dataIndex: 'rate',
                  render: (v: string, r: { status: string }) => (
                    <Tag
                      color={
                        r.status === 'OVER'
                          ? 'red'
                          : r.status === 'WARN'
                            ? 'orange'
                            : r.status === 'EMPTY'
                              ? 'default'
                              : 'green'
                      }
                    >
                      {v}%
                    </Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.crossEntityAccountDedupe')}
            extra={
              <Space>
                <Tag color={crossDup.data?.total ? 'red' : 'green'}>{crossDup.data?.total ?? 0}</Tag>
                {!!crossDup.data?.total && (
                  <Button
                    size="small"
                    loading={autoMergeM.isPending}
                    onClick={() => autoMergeM.mutate()}
                  >{t('group.autoMerge')}</Button>
                )}
              </Space>
            }
          >
            {!(crossDup.data?.items ?? []).length && (
              <div style={{ color: '#16a34a', fontSize: 12 }}>{t('group.noSameNameAccounts')}</div>
            )}
            {(crossDup.data?.items ?? []).slice(0, 5).map((g) => (
              <div key={g.name} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{g.name}</span>
                  {g.items.length >= 2 && (
                    <Button
                      size="small"
                      type="link"
                      onClick={() =>
                        mergeAccM.mutate({
                          sourceId: g.items[g.items.length - 1].id,
                          targetId: g.items[0].id,
                        })
                      }
                    >{t('group.merge')}</Button>
                  )}
                </div>
                {g.items.map((it) => (
                  <div key={it.id} style={{ fontSize: 12, color: '#646A73' }}>
                    · {it.entityName}
                  </div>
                ))}
              </div>
            ))}
          </Card>
        </Col>
      </Row>
              </>
            ),
          },
          {
            key: 'finance',
            label: t('group.expensesFunds'),
            children: (
              <>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.expenseCenter')}
            extra={<Tag color="orange">{t('group.allocations', { v: expenseCenter.data?.allocCount ?? 0 })}</Tag>}
          >
            <Space size="large" wrap>
              <Statistic title={t('group.budgetedExpenses')} value={expenseCenter.data?.budgetExpense ?? '0'} />
              <Statistic
                title={t('group.allocatedExpenses')}
                value={expenseCenter.data?.allocatedExpense ?? '0'}
                valueStyle={{ color: '#d97706' }}
              />
              <Statistic
                title={t('common.total')}
                value={expenseCenter.data?.totalExpense ?? '0'}
                valueStyle={{ color: '#e11d48' }}
              />
            </Space>
            <Table
              style={{ marginTop: 12 }}
              rowKey="entityName"
              size="small"
              pagination={false}
              dataSource={expenseCenter.data?.byEntity ?? []}
              columns={[
                { title: t('group.entity'), dataIndex: 'entityName' },
                { title: t('group.allocatedAmount'), dataIndex: 'amount' },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.fundPoolBalance')}
            extra={<Tag color="blue">{t('group.net', { v: cashPoolQ.data?.totalNet ?? '0' })}</Tag>}
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={cashPoolQ.data?.items ?? []}
              columns={[
                { title: t('group.entity'), dataIndex: 'name' },
                { title: t('group.transferIn'), dataIndex: 'transferIn' },
                { title: t('group.transferOut'), dataIndex: 'transferOut' },
                {
                  title: t('group.net2'),
                  dataIndex: 'net',
                  render: (v: string) => (
                    <b style={{ color: Number(v) >= 0 ? '#0d9488' : '#e11d48' }}>{v}</b>
                  ),
                },
              ]}
            />
            <Table<{
              id: string
              fromName: string
              toName: string
              amount: string
              status?: string
            }>
              style={{ marginTop: 8 }}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 3 }}
              dataSource={(transfersQ.data?.items ?? []).map((t) => ({
                ...t,
                fromName:
                  listQ.data?.items?.find((x) => x.id === t.fromEntityId)?.name ?? t.fromEntityId,
                toName: listQ.data?.items?.find((x) => x.id === t.toEntityId)?.name ?? t.toEntityId,
              }))}
              columns={[
                {
                  title: t('group.transfer'),
                  render: (_: unknown, r: { fromName: string; toName: string; amount: string }) =>
                    `${r.fromName}→${r.toName} ${r.amount}`,
                },
                {
                  title: t('common.actions'),
                  width: 100,
                  render: (_: unknown, r: { id: string; status?: string }) =>
                    r.status === 'SUBMITTED' || !r.status ? (
                      <Space>
                        <Button
                          size="small"
                          onClick={() =>
                            decideTransferM.mutate({ id: r.id, action: 'APPROVED' })
                          }
                        >{t('common.confirm')}</Button>
                        <Button
                          size="small"
                          danger
                          onClick={() =>
                            decideTransferM.mutate({ id: r.id, action: 'REJECTED' })
                          }
                        >{t('common.reject')}</Button>
                      </Space>
                    ) : (
                      <Tag color={r.status === 'REJECTED' ? 'red' : 'green'}>{r.status}</Tag>
                    ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.crossEntitySettlements')}
            extra={
              <Space>
                {settleSel.length > 0 && (
                  <>
                    <Button
                      size="small"
                      loading={batchSettleM.isPending}
                      onClick={() => batchSettleM.mutate('SETTLED')}
                    >{t('group.settleSelected', { length: settleSel.length })}</Button>
                    <Button
                      size="small"
                      loading={batchSettleM.isPending}
                      onClick={() => batchSettleM.mutate('CONFIRMED')}
                    >{t('group.confirmSelected')}</Button>
                  </>
                )}
                <Button size="small" type="primary" onClick={() => setSettleOpen(true)}>{t('group.newSettlement')}</Button>
              </Space>
            }
          >
            <BarChart
              items={(cashTrendQ.data?.items ?? []).map((t) => ({
                label: t.month.slice(5),
                value: Number(t.transferAmount),
              }))}
              color="#0d9488"
              height={80}
            />
            <Table
              style={{ marginTop: 8 }}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 4 }}
              rowSelection={{
                selectedRowKeys: settleSel,
                onChange: (keys) => setSettleSel(keys.map(String)),
              }}
              dataSource={(settlementsQ.data?.items ?? []).map((s) => ({
                ...s,
                fromName:
                  listQ.data?.items?.find((x: Entity) => x.id === s.fromEntityId)?.name ??
                  s.fromEntityId,
                toName:
                  listQ.data?.items?.find((x: Entity) => x.id === s.toEntityId)?.name ?? s.toEntityId,
              }))}
              columns={[
                { title: t('common.no'), dataIndex: 'settleNo', width: 110 },
                { title: t('group.item'), dataIndex: 'title', ellipsis: true },
                { title: t('audit.field.amount'), dataIndex: 'amount', width: 80 },
                {
                  title: t('audit.field.status'),
                  dataIndex: 'status',
                  width: 70,
                  render: (v: string) => (
                    <Tag
                      color={v === 'SETTLED' ? 'green' : v === 'CONFIRMED' ? 'blue' : 'default'}
                    >
                      {v}
                    </Tag>
                  ),
                },
                {
                  title: t('common.actions'),
                  width: 110,
                  render: (_: unknown, r: { id: string; status: string }) => (
                    <Space>
                      {r.status === 'DRAFT' && (
                        <Button
                          size="small"
                          onClick={() =>
                            settleStatusM.mutate({ id: r.id, status: 'CONFIRMED' })
                          }
                        >{t('common.confirm')}</Button>
                      )}
                      {r.status === 'CONFIRMED' && (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => settleStatusM.mutate({ id: r.id, status: 'SETTLED' })}
                        >{t('group.settle')}</Button>
                      )}
                      <Button
                        size="small"
                        onClick={() => printSettleM.mutate(r.id)}
                      >{t('common.print')}</Button>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.expenseReports')}
            extra={
              <Button size="small" type="primary" onClick={() => setClaimOpen(true)}>{t('group.newExpenseReport')}</Button>
            }
          >
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 4 }}
              dataSource={claimsQ.data?.items ?? []}
              columns={[
                { title: t('group.item'), dataIndex: 'title' },
                {
                  title: t('common.type'),
                  dataIndex: 'category',
                  render: (v: string) => <Tag>{v}</Tag>,
                },
                { title: t('audit.field.amount'), dataIndex: 'amount', width: 90 },
                {
                  title: t('audit.field.status'),
                  dataIndex: 'status',
                  width: 80,
                  render: (v: string) => (
                    <Tag
                      color={
                        v === 'APPROVED' ? 'green' : v === 'REJECTED' ? 'red' : 'orange'
                      }
                    >
                      {v}
                    </Tag>
                  ),
                },
                {
                  title: t('common.actions'),
                  width: 120,
                  render: (
                    _: unknown,
                    r: { id: string; status: string; amount: string; level2At?: string },
                  ) =>
                    r.status === 'SUBMITTED' ? (
                      <Space>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => decideClaimM.mutate({ id: r.id, action: 'APPROVED' })}
                        >{t('common.approve2')}</Button>
                        <Button
                          size="small"
                          danger
                          onClick={() => decideClaimM.mutate({ id: r.id, action: 'REJECTED' })}
                        >{t('common.reject')}</Button>
                      </Space>
                    ) : r.status === 'APPROVED' && !r.level2At && Number(r.amount) >= 50000 ? (
                      <Button
                        size="small"
                        onClick={() => decide2M.mutate({ id: r.id, action: 'APPROVED' })}
                      >{t('group.level2')}</Button>
                    ) : null,
                },
              ]}
            />
            {!(claimsQ.data?.items ?? []).length && (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('group.noExpenseReports')}</div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.expenseAllocationHistory')}
            extra={<Tag>{expHist.data?.items?.length ?? 0}</Tag>}
          >
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 4 }}
              dataSource={expHist.data?.items ?? []}
              columns={[
                {
                  title: t('audit.field.total'),
                  dataIndex: 'totalAmount',
                  width: 90,
                  render: (v: string) => <b>{v}</b>,
                },
                {
                  title: t('common.notes'),
                  dataIndex: 'note',
                  render: (v: string) => v || '-',
                },
                {
                  title: t('group.entity'),
                  dataIndex: 'rows',
                  render: (rows: { entityName: string; amount: string }[]) =>
                    (rows ?? []).slice(0, 2).map((r) => `${r.entityName}:${r.amount}`).join(' '),
                },
              ]}
            />
            {!(expHist.data?.items ?? []).length && (
              <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('group.noAllocationRecords')}</div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card
            size="small"
            className="crm-panel-fixed"
            title={t('group.groupApprovalRules')}
            extra={
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  setRuleEditId(null)
                  ruleForm.resetFields()
                  ruleForm.setFieldsValue({ type: 'CONTRACT', active: true })
                  setRuleOpen(true)
                }}
              >{t('group.newRule')}</Button>
            }
          >
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={rulesQ.data?.items ?? []}
              onRow={(r) => ({
                onClick: () => {
                  setRuleEditId(String((r as { id: string }).id))
                  ruleForm.setFieldsValue(r)
                  setRuleOpen(true)
                },
                style: { cursor: 'pointer' },
              })}
              columns={[
                { title: t('group.rule'), dataIndex: 'name' },
                {
                  title: t('common.type'),
                  dataIndex: 'type',
                  render: (v: string) => (
                    <Tag>{v === 'CONTRACT' ? t('nav.contracts') : v === 'QUOTE' ? t('nav.quotes') : t('group.general')}</Tag>
                  ),
                },
                { title: t('group.threshold'), dataIndex: 'threshold', width: 80 },
                {
                  title: t('audit.field.status'),
                  dataIndex: 'active',
                  width: 70,
                  render: (v: boolean) => (
                    <Tag color={v ? 'green' : 'default'}>{v ? t('common.enabled2') : t('common.disable')}</Tag>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small" className="crm-panel-fixed" title={t('group.groupGovernanceNotes')}>
            <div style={{ fontSize: 12, color: '#646A73', lineHeight: 1.9 }}>
              <div>{t('group.hqGovernsPricingGoals')}</div>
              <div>{t('group.subsidiariesAccountIndependently')}</div>
              <div>{t('group.branchesShareMasterData')}</div>
              <div>{t('group.accountsCanBeAssigned')}</div>
              <div>{t('group.budgetAndExpenseExecution')}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Tag color="blue">Multi-Org</Tag>
              <Tag color="green">{t('group.consolidatedOps')}</Tag>
              <Tag color="orange">{t('group.budgetControl')}</Tag>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#646A73' }}>{t('group.businessBriefSubscription')}</span>
              <Button
                size="small"
                type={subQ.data?.enabled ? 'primary' : 'default'}
                loading={saveSubM.isPending}
                onClick={() => saveSubM.mutate(!subQ.data?.enabled)}
              >
                {subQ.data?.enabled ? t('common.enabled') : t('group.enable')}
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
              </>
            ),
          },
          {
            key: 'org',
            label: t('common.legalEntity'),
            children: (
              <>
      <ErpListShell
        program="mtgrp0001"
        title={t('common.legalEntity')}
        subtitle={t('group.groupMultiEntitySubsidiary')}
        onRefresh={() => {
          void qc.invalidateQueries({ queryKey: ['group-entities'] })
          void qc.invalidateQueries({ queryKey: ['group-overview'] })
        }}
        onCreate={() => {
          setEditId(null)
          form.resetFields()
          form.setFieldsValue({ type: 'SUBSIDIARY', status: 'ACTIVE' })
          setOpen(true)
        }}
        createLabel={t('group.newEntity')}
      >
        <ErpTable
          rowKey="id"
          storageKey="group-entities"
          dataSource={(listQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
          pageSize={10}
          onRowClick={(row: Record<string, unknown>) => {
            const r = row as unknown as Entity
            setEditId(r.id)
            form.setFieldsValue(r)
            setOpen(true)
          }}
          columns={[
            { title: t('common.code'), dataIndex: 'code', width: 100, filterType: 'text' },
            { title: t('audit.field.name'), dataIndex: 'name', width: 160, filterType: 'text' },
            {
              title: t('common.type'),
              dataIndex: 'type',
              width: 110,
              filterType: 'select',
              filterOptions: [
                { value: 'GROUP', label: t('nav.group') },
                { value: 'SUBSIDIARY', label: t('group.subsidiary') },
                { value: 'BRANCH', label: t('group.branch') },
              ],
              render: (v: unknown) => (
                <Tag color={v === 'GROUP' ? 'blue' : v === 'BRANCH' ? 'geekblue' : 'green'}>
                  {String(v)}
                </Tag>
              ),
            },
            { title: t('common.region'), dataIndex: 'region', width: 100, filterType: 'text' },
            { title: t('common.industry'), dataIndex: 'industry', width: 100, filterType: 'text' },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 90,
              render: (v: unknown) => (
                <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{String(v)}</Tag>
              ),
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 100,
              render: (_: unknown, r: unknown) => {
                const row = r as Entity
                return (
                  <Button size="small" danger onClick={() => delM.mutate(row.id)}>{t('common.delete')}</Button>
                )
              },
            },
          ]}
        />
      </ErpListShell>
              </>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>{t('group.groupStructureSupportsHq')}</Typography.Paragraph>

      <Modal
        title={editId ? t('group.editLegalEntity') : t('group.newLegalEntity')}
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
            <Input placeholder={t('group.eGHqSub01')} />
          </Form.Item>
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')}>
            <Select
              options={[
                { value: 'GROUP', label: t('group.groupHq') },
                { value: 'SUBSIDIARY', label: t('group.subsidiary') },
                { value: 'BRANCH', label: t('group.branch') },
              ]}
            />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="region" label={t('common.region')} style={{ flex: 1 }}>
              <Input placeholder={t('group.eGEastChina')} />
            </Form.Item>
            <Form.Item name="industry" label={t('common.industry')} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="parentId" label={t('group.parentEntity')}>
            <Select
              allowClear
              options={(listQ.data?.items ?? [])
                .filter((x: Entity) => x.id !== editId)
                .map((x: Entity) => ({ value: x.id, label: x.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('group.enterEntityBudget')}
        open={budgetOpen}
        onCancel={() => setBudgetOpen(false)}
        onOk={() => budgetForm.submit()}
        confirmLoading={saveBudgetM.isPending}
        width={440}
      >
        <Form form={budgetForm} layout="vertical" onFinish={(v) => saveBudgetM.mutate(v)}>
          <Form.Item name="entityId" label={t('common.legalEntity')} rules={[{ required: true }]}>
            <Select
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="year" label={t('group.year')} initialValue={String(new Date().getFullYear())}>
            <Input />
          </Form.Item>
          <Form.Item name="budgetAmount" label={t('group.budgetAmount')} rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item
            name="expenseAmount"
            label={t('group.openingExpensesIncurred')}
            initialValue="0"
            extra={t('group.appliesOnlyWhenCreating')}
          >
            <Input type="number" />
          </Form.Item>
          <Form.Item name="note" label={t('common.notes')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('group.settlementPrintPreview')}
        open={!!printSettle}
        onCancel={() => setPrintSettle(null)}
        footer={
          <Space>
            <Button onClick={() => setPrintSettle(null)}>{t('common.close')}</Button>
            <Button type="primary" onClick={() => window.print()}>{t('common.printPdf')}</Button>
          </Space>
        }
        width={520}
      >
        {printSettle && (
          <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{t('group.crossEntitySettlements')}</div>
              <div style={{ fontSize: 12, color: '#646A73' }}>{printSettle.settleNo}</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>{t('group.item2', { title: printSettle.title })}</div>
              <div>{t('group.category', { category: printSettle.category })}</div>
              <div>{t('group.payingEntityReceivingEntity', { fromName: printSettle.fromName, toName: printSettle.toName })}
              </div>
              <div>{t('group.amount')}<b>{printSettle.amount}</b>
              </div>
              <div>{t('group.status', { status: printSettle.status })}</div>
            </div>
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#646A73',
              }}
            >
              <span>{t('group.preparedBy')}</span>
              <span>{t('group.reviewedBy')}</span>
              <span>{t('common.date2')}</span>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        title={t('group.newCrossEntitySettlement')}
        open={settleOpen}
        onCancel={() => setSettleOpen(false)}
        onOk={() => settleForm.submit()}
        confirmLoading={createSettleM.isPending}
        width={460}
      >
        <Form form={settleForm} layout="vertical" onFinish={(v) => createSettleM.mutate(v)}>
          <Form.Item name="title" label={t('group.item')} rules={[{ required: true }]}>
            <Input placeholder={t('group.eGSharedR')} />
          </Form.Item>
          <Form.Item name="fromEntityId" label={t('group.payingEntity')} rules={[{ required: true }]}>
            <Select
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="toEntityId" label={t('group.receivingEntity')} rules={[{ required: true }]}>
            <Select
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="amount" label={t('audit.field.amount')} rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="category" label={t('common.category')} initialValue="服务费">
            <Select
              options={[
                { value: '服务费', label: t('group.serviceFee') },
                { value: '管理费', label: t('group.managementFee') },
                { value: '货款', label: t('group.goodsPayment') },
                { value: '其他', label: t('common.other') },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('group.crossEntityFundTransfer')}
        open={transferOpen}
        onCancel={() => setTransferOpen(false)}
        onOk={() => transferForm.submit()}
        confirmLoading={transferM.isPending}
        width={460}
      >
        <Form form={transferForm} layout="vertical" onFinish={(v) => transferM.mutate(v)}>
          <Form.Item name="fromEntityId" label={t('group.fromEntity')} rules={[{ required: true }]}>
            <Select
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="toEntityId" label={t('group.toEntity')} rules={[{ required: true }]}>
            <Select
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="amount" label={t('audit.field.amount')} rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="note" label={t('common.notes')}>
            <Input placeholder={t('group.eGGroupCash')} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('group.newExpenseReport2')}
        open={claimOpen}
        onCancel={() => setClaimOpen(false)}
        onOk={() => claimForm.submit()}
        confirmLoading={saveClaimM.isPending}
        width={440}
      >
        <Form form={claimForm} layout="vertical" onFinish={(v) => saveClaimM.mutate(v)}>
          <Form.Item name="title" label={t('group.item')} rules={[{ required: true }]}>
            <Input placeholder={t('group.eGGroupBrand')} />
          </Form.Item>
          <Form.Item name="entityId" label={t('group.owningEntity')} rules={[{ required: true }]}>
            <Select
              options={(listQ.data?.items ?? []).map((x: Entity) => ({
                value: x.id,
                label: x.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="category" label={t('common.type')} initialValue="市场">
            <Select
              options={[
                { value: '市场', label: t('group.marketing') },
                { value: '差旅', label: t('group.travel') },
                { value: '研发', label: t('group.rD') },
                { value: '其他', label: t('common.other') },
              ]}
            />
          </Form.Item>
          <Form.Item name="amount" label={t('audit.field.amount')} rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={ruleEditId ? t('group.editApprovalRule') : t('group.newApprovalRule')}
        open={ruleOpen}
        onCancel={() => {
          setRuleOpen(false)
          setRuleEditId(null)
        }}
        onOk={() => ruleForm.submit()}
        confirmLoading={saveRuleM.isPending}
        width={480}
      >
        <Form form={ruleForm} layout="vertical" onFinish={(v) => saveRuleM.mutate(v)}>
          <Form.Item name="name" label={t('group.ruleName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label={t('group.appliesTo')} initialValue="CONTRACT">
            <Select
              options={[
                { value: 'CONTRACT', label: t('nav.contracts') },
                { value: 'QUOTE', label: t('nav.quotes') },
                { value: 'ALL', label: t('group.general') },
              ]}
            />
          </Form.Item>
          <Form.Item name="threshold" label={t('group.threshold')} rules={[{ required: true }]}>
            <Input placeholder={t('group.amountOrDiscountRate')} />
          </Form.Item>
          <Form.Item name="approvers" label={t('group.approvers')} rules={[{ required: true }]}>
            <Input placeholder={t('group.eGHqFinance')} />
          </Form.Item>
          <Form.Item name="active" label={t('common.enabled2')} valuePropName="checked" initialValue={true}>
            <Select
              options={[
                { value: true, label: t('common.enabled2') },
                { value: false, label: t('common.disable') },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('group.crossEntityGoalAllocation')}
        open={goalOpen}
        onCancel={() => setGoalOpen(false)}
        onOk={() => goalForm.submit()}
        confirmLoading={allocGoalM.isPending}
        width={440}
      >
        <Form form={goalForm} layout="vertical" onFinish={(v) => allocGoalM.mutate(v)}>
          <Form.Item name="totalAmount" label={t('group.totalGoal')} rules={[{ required: true }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="metric" label={t('common.metric')} initialValue="WON_AMOUNT">
            <Select
              options={[
                { value: 'WON_AMOUNT', label: t('common.wonAmount') },
                { value: 'REVENUE', label: t('common.collectedAmount') },
                { value: 'NEW_OPP', label: t('common.newDeal2') },
              ]}
            />
          </Form.Item>
          <Form.Item name="periodKey" label={t('common.periodYyyyMm')}>
            <Input placeholder={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`} />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#646A73' }}>{t('group.splitEvenlyAcrossLegal')}</div>
        </Form>
      </Modal>
      <Modal
        title={t('group.sharedExpenseAllocation')}
        open={allocOpen}
        onCancel={() => setAllocOpen(false)}
        onOk={() => allocForm.submit()}
        confirmLoading={allocM.isPending}
        width={440}
      >
        <Form form={allocForm} layout="vertical" onFinish={(v) => allocM.mutate(v)}>
          <Form.Item name="totalAmount" label={t('group.totalExpense')} rules={[{ required: true }]}>
            <Input
              type="number"
              value={allocAmount}
              onChange={(e) => setAllocAmount(e.target.value)}
            />
          </Form.Item>
          <Form.Item name="note" label={t('common.notes')}>
            <Input placeholder={t('group.eGGroupBrand2')} />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#646A73' }}>{t('group.splitEvenlyByNumber')}</div>
        </Form>
      </Modal>
    </div>
  )
}
