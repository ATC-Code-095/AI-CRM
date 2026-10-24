import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography, Popconfirm, Statistic } from 'antd'
import { useUrlState } from '../hooks/useUrlState'
import dayjs from 'dayjs'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api, apiUrl } from '../api/client'
import { ErpListShell } from '../components/ErpListShell'
import { RichTextEditor } from '../components/RichTextEditor'
import { EntityFilterSelect } from '../components/EntityFilterSelect'
import { useEntityScope } from '../hooks/useEntityScope'
import { ErpTable } from '../components/ErpTable'
import { exportPdf, exportWord } from '../utils/docExport'
import { t } from '../i18n'
import { CurrencySelect } from '../components/CurrencySelect'

async function uploadTemplateFile(entityId: string, file: File) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('entityType', 'TEMPLATE')
  fd.append('entityId', entityId)
  fd.append('fileName', file.name)
  const res = await fetch(apiUrl('/api/v1/files'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
    body: fd,
  })
  const body = await res.json()
  if (body.code !== 0) throw new Error(body.message || t('common.uploadFailed'))
  const fileUrl = body.data?.id ? `/api/v1/files/${body.data.id}` : ''
  await api(`/contract-templates/${entityId}/file`, {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, fileUrl, fileType: file.type || 'doc' }),
  })
  // 上传后自动解析 Word/Excel → 写入模板正文（与原文档排版一致）
  if (fileUrl) {
    try {
      const parsed = await api<{ html: string; lowQuality?: boolean }>(
        `/files/${fileUrl.split('/').pop()}/render-html`,
      )
      if (parsed.html && !parsed.lowQuality && parsed.html.length > 80) {
        await api(`/contract-templates/${entityId}/content`, {
          method: 'PUT',
          body: JSON.stringify({ content: parsed.html }),
        })
      }
    } catch {
      /* 解析失败则保留文件，打印时再兜底 */
    }
  }
  return fileUrl
}

interface Contract {
  id: string
  contractNo: string
  title: string
  status: string
  total: string
  receivedAmount: string
  account?: { name: string }
}

interface Payment {
  id: string
  paymentNo: string
  amount: string
  status: string
  paidAt: string
  contract?: { contractNo: string }
  paymentPlanId: string | null
}

export default function ContractsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [editId, setEditId] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm] = Form.useForm()

  const uploadFile = async (file: File, entityId: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('entityType', 'CONTRACT')
    fd.append('entityId', entityId)
    fd.append('fileName', file.name)
    const res = await fetch(apiUrl('/api/v1/files'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
      body: fd,
    })
    const body = await res.json()
    if (body.code === 0) {
      message.success(t('contracts.attachmentUploaded'))
      void qc.invalidateQueries({ queryKey: ['contract-files', entityId] })
    } else message.error(body.message || t('common.uploadFailed'))
    return body.code === 0
  }

  const [lineRows, setLineRows] = useState<
    { id?: string; productId: string; name: string; qty: string; unitPrice: string; amount: string }[]
  >([])

  const linesQ = useQuery({
    queryKey: ['contract-lines', editId],
    enabled: !!editId && editOpen,
    queryFn: () =>
      api<{
        lines: {
          id: string
          productId: string
          name: string
          qty: string
          unitPrice: string
          discountRate: string
          amount: string
        }[]
      }>(`/contracts/${editId}`),
    retry: false,
  })

  useEffect(() => {
    if (linesQ.data?.lines) {
      setLineRows(
        linesQ.data.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          name: l.name,
          qty: String(l.qty),
          unitPrice: String(l.unitPrice),
          amount: String(l.amount),
        })),
      )
    }
  }, [linesQ.data])

  const saveLinesM = useMutation({
    mutationFn: () =>
      api(`/contracts/${editId}/lines`, {
        method: 'PUT',
        body: JSON.stringify({
          lines: lineRows.map((l) => ({
            productId: l.productId || 'unknown',
            name: l.name,
            qty: l.qty,
            unitPrice: l.unitPrice,
            discountRate: '0',
            amount: l.amount,
          })),
        }),
      }),
    onSuccess: () => {
      message.success(t('contracts.contractLineItemsSaved'))
      void qc.invalidateQueries({ queryKey: ['contract-lines', editId] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const filesQ = useQuery({
    queryKey: ['contract-files', editId],
    enabled: !!editId && editOpen,
    queryFn: async () => {
      const rows = await api<
        { id: string; fileName: string; mimeType: string; size: number; createdAt: string }[]
      >(`/files/entity/CONTRACT/${editId}`)
      return { items: Array.isArray(rows) ? rows : (rows as { items?: typeof rows }).items ?? [] }
    },
    retry: false,
  })

  const batchDelM = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: number; failed: number }>('/contracts/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (r) => {
      message.success(t('contracts.deletedDraftContracts', { ok: r.ok, v: r.failed ? t('contracts.skippedNonDrafts', { failed: r.failed }) : '' }))
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const batchSignM = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: number; failed: number }>('/contracts/batch-request-sign', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (r) => {
      message.success(t('contracts.startedESignFor', { ok: r.ok }))
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const [planContractId, setPlanContractId] = useState<string | null>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planRows, setPlanRows] = useState<
    { seq: number; dueDate: string; amount: string }[]
  >([])

  const plansQ = useQuery({
    queryKey: ['payment-plans'],
    queryFn: () =>
      api<{
        items: {
          id: string
          seq: number
          dueDate: string
          amount: string
          receivedAmount: string
          status: string
          remark?: string
          contractNo?: string
          contractTitle?: string
          isOverdue: boolean
          dueDays: number
        }[]
        total: number
      }>('/payment-plans'),
    retry: false,
    refetchInterval: 60_000,
  })

  const nudgeM = useMutation({
    mutationFn: (id: string) =>
      api(`/payment-plans/${id}/nudge`, { method: 'POST', body: JSON.stringify({ note: t('contracts.dunningFromList') }) }),
    onSuccess: () => {
      message.success(t('contracts.dunningStartedAndOwner'))
      void qc.invalidateQueries({ queryKey: ['payment-plans'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const savePlansM = useMutation({
    mutationFn: () =>
      api(`/contracts/${planContractId}/plans`, {
        method: 'PUT',
        body: JSON.stringify({
          plans: planRows.map((r, i) => ({ seq: i + 1, dueDate: r.dueDate, amount: r.amount })),
        }),
      }),
    onSuccess: () => {
      message.success(t('contracts.paymentPlanSaved'))
      setPlanOpen(false)
      void qc.invalidateQueries({ queryKey: ['payment-plans'] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const [invOpen, setInvOpen] = useState(false)
  const [invForm, setInvForm] = useState({ contractId: '', invoiceNo: '', amount: '' })
  const [coOpen, setCoOpen] = useState(false)
  const [coForm, setCoForm] = useState({ contractId: '', title: '', reason: '', amountDelta: '' })

  const invQ = useQuery({
    queryKey: ['invoices'],
    queryFn: () =>
      api<{
        items: {
          id: string
          contractNo: string
          invoiceNo: string
          amount: string
          type: string
          status: string
          remark: string
          createdAt: string
        }[]
      }>('/invoices'),
    retry: false,
  })
  const reconQ = useQuery({
    queryKey: ['invoice-reconcile'],
    queryFn: () =>
      api<{
        summary: {
          totalContracts: number
          issueCount: number
          riskCount: number
          warnCount: number
          contractTotal: string
          invoicedAmount: string
          receivedAmount: string
          gap: string
        }
        items: {
          contractId: string
          contractNo: string
          title: string
          accountName: string
          status: string
          contractTotal: string
          invoicedAmount: string
          receivedAmount: string
          pendingInvoice: string
          pendingPayment: string
          invoicePayGap: string
          invoiceCount: number
          flags: string[]
          level: 'OK' | 'WARN' | 'RISK'
        }[]
        total: number
      }>('/invoices/reconcile'),
    retry: false,
  })
  const coQ = useQuery({
    queryKey: ['change-orders'],
    queryFn: () =>
      api<{
        items: {
          id: string
          contractNo: string
          title: string
          reason: string
          amountDelta: string
          status: string
          createdBy: string
          createdAt: string
        }[]
      }>('/change-orders'),
    retry: false,
  })
  const createInvM = useMutation({
    mutationFn: () =>
      api('/invoices', { method: 'POST', body: JSON.stringify(invForm) }),
    onSuccess: () => {
      message.success(t('contracts.invoiceRegistered'))
      setInvOpen(false)
      void qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const createCoM = useMutation({
    mutationFn: () =>
      api('/change-orders', { method: 'POST', body: JSON.stringify(coForm) }),
    onSuccess: () => {
      message.success(t('contracts.changeOrderCreated'))
      setCoOpen(false)
      void qc.invalidateQueries({ queryKey: ['change-orders'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const decideCoM = useMutation({
    mutationFn: (p: { id: string; action: 'APPROVE' | 'REJECT' }) =>
      api(`/change-orders/${p.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ action: p.action }),
      }),
    onSuccess: () => {
      message.success(t('common.processed'))
      void qc.invalidateQueries({ queryKey: ['change-orders'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const listQ = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api<{ items: Contract[]; total: number }>('/contracts?pageSize=50'),
  })
  const ent = useEntityScope()
  const [entFilter, setEntFilter] = useState<string | null>(null)

  const payListQ = useQuery({
    queryKey: ['payments'],
    queryFn: () =>
      api<{
        items: {
          id: string
          paymentNo: string
          amount: string
          status: string
          paidAt: string
          contract?: { contractNo: string }
          paymentPlanId: string | null
        }[]
      }>('/payments?pageSize=50'),
  })

  const effectiveM = useMutation({
    mutationFn: (id: string) => api<{ status: string }>(`/contracts/${id}/effective`, { method: 'POST' }),
    onSuccess: (r) => {
      // 合同额达到审批阈值时进入审批，不会立即生效
      message.success(r?.status === 'APPROVING' ? t('contracts.contractAmountReachedThe') : t('contracts.contractIsNowActive'))
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const printContract = (id: string) => window.open(`/contracts/${id}/print`, '_blank')

  const terminateM = useMutation({
    mutationFn: (id: string) =>
      api(`/contracts/${id}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ reason: t('contracts.businessTerminated') }),
      }),
    onSuccess: () => {
      message.success(t('enum.contract.status.TERMINATED'))
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const confirmM = useMutation({
    mutationFn: (id: string) => api(`/payments/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['payments'] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const reconcileM = useMutation({
    mutationFn: (id: string) => api(`/payments/${id}/reconcile`, { method: 'POST' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['payments'] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const [tab, setTab] = useState('contracts')
  const [tplOpen, setTplOpen] = useState(false)
  const [editTplOpen, setEditTplOpen] = useState(false)
  const [editTplId, setEditTplId] = useState<string | null>(null)
  const [editTplHtml, setEditTplHtml] = useState('')
  const [tplHistory, setTplHistory] = useState<{ content: string; at: string }[]>([])
  const [diffWith, setDiffWith] = useState<string | null>(null)
  const [tplForm] = Form.useForm()
  const tplQ = useQuery({
    queryKey: ['contract-templates'],
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          category: string
          terms: string
          defaultDuration: string
          defaultPayment: string
        }[]
      }>('/contract-templates'),
    retry: false,
  })
  const saveTplM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/contract-templates', { method: 'POST', body: JSON.stringify({ ...v, templateId: v.templateId ?? editForm.getFieldValue('templateId') }) }),
    onSuccess: () => {
      message.success(t('contracts.contractTemplateSaved'))
      setTplOpen(false)
      tplForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['contract-templates'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const delTplM = useMutation({
    mutationFn: (id: string) => api(`/contract-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success(t('common.deleted'))
      void qc.invalidateQueries({ queryKey: ['contract-templates'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        style={{ marginBottom: 0 }}
        items={[
          {
            key: 'contracts',
            label: t('contracts.contracts'),
            children: (
              <ErpListShell
        program="mtctr0001"
        title={t('nav.contracts')}
        subtitle={t('contracts.fulfilmentContracts')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['contracts'] })}
        onCreate={() => {
          setEditId(null)
          editForm.resetFields()
          setEditOpen(true)
        }}
        createLabel={t('contracts.newContract')}
        extraActions={<EntityFilterSelect value={entFilter} onChange={setEntFilter} />}
      >
        <ErpTable
          rowKey="id"
          storageKey="contracts"
          batchBar={(ids, rows, clear) => (
            <Space wrap size={8}>
              <span style={{ color: '#64748b' }}>{t('common.selected', { length: ids.length })}</span>
              <Button
                size="small"
                onClick={() => batchSignM.mutate(ids)}
              >{t('contracts.batchStartSigning')}</Button>
              <Button
                size="small"
                onClick={() => {
                  const header = [t('audit.field.contractNo'), t('audit.field.title'), t('nav.accounts'), t('audit.field.total'), t('audit.field.status')]
                  const csv = [
                    header.join(','),
                    ...(rows as unknown as { contractNo: string; title: string; account?: { name?: string }; total: string; status: string }[]).map((r) =>
                      [r.contractNo, r.title, r.account?.name ?? '', r.total, r.status]
                        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                        .join(','),
                    ),
                  ].join('\n')
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `contracts-selected_${Date.now()}.csv`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >{t('common.exportSelected')}</Button>
              <Popconfirm
                title={t('contracts.deleteSelectedDraftContracts', { length: ids.length })}
                onConfirm={() => {
                  batchDelM.mutate(ids)
                  clear()
                }}
              >
                <Button size="small" danger>{t('common.batchDeleteDrafts')}</Button>
              </Popconfirm>
              <Button
                size="small"
                onClick={() => {
                  for (const r of rows as unknown as {
                    contractNo: string
                    title: string
                    total: string
                    terms?: string
                    lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
                  }[]) {
                    exportWord({
                      title: t('contracts.salesContract', { contractNo: r.contractNo }),
                      meta: { name: r.title },
                      terms: r.terms ?? '',
                      lines: (r.lines ?? []).map((l) => ({
                        name: l.name,
                        qty: l.qty,
                        unitPrice: l.unitPrice,
                        amount: l.amount,
                      })),
                      filename: t('contracts.contract', { contractNo: r.contractNo }),
                    })
                  }
                }}
              >{t('common.batchExportWord')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const r of rows as unknown as {
                    contractNo: string
                    title: string
                    total: string
                    terms?: string
                    lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
                  }[]) {
                    exportPdf({
                      title: t('contracts.salesContract', { contractNo: r.contractNo }),
                      meta: { name: r.title },
                      terms: r.terms ?? '',
                      lines: (r.lines ?? []).map((l) => ({
                        name: l.name,
                        qty: l.qty,
                        unitPrice: l.unitPrice,
                        amount: l.amount,
                      })),
                    })
                  }
                }}
              >{t('common.batchExportPdf')}</Button>
              <Button size="small" type="text" onClick={clear}>{t('common.clearSelection')}</Button>
            </Space>
          )}
          onRowClick={(row) => {
            const r = row as unknown as Record<string, unknown>
            setEditId(String(r.id))
            editForm.setFieldsValue({
              title: r.title,
              terms: (r as { terms?: string }).terms ?? '',
            })
            setEditOpen(true)
          }}
          loading={listQ.isLoading}
          dataSource={ent
            .filterByEntity(
              (listQ.data?.items ?? []).filter(
                (r) =>
                  !q ||
                  r.contractNo.toLowerCase().includes(q.toLowerCase()) ||
                  r.title.toLowerCase().includes(q.toLowerCase()),
              ) as unknown as { id: string; accountId?: string }[],
              entFilter,
            ) as unknown as Record<string, unknown>[]}
          pageSize={10}
          columns={[
            { title: t('audit.field.contractNo'), dataIndex: 'contractNo', width: 140, filterType: 'text', sorter: true },
            { title: t('audit.field.title'), dataIndex: 'title', width: 180, filterType: 'text' },
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
            { title: t('audit.field.total'), dataIndex: 'total', width: 100, filterType: 'number' },
            { title: t('audit.field.receivedAmount'), dataIndex: 'receivedAmount', width: 100, filterType: 'number' },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 100,
              filterType: 'select',
              filterOptions: ['DRAFT', 'EFFECTIVE', 'FINISHED', 'TERMINATED'].map((s) => ({
                value: s,
                label: s,
              })),
              render: (v) => (
                <Tag color={String(v) === 'EFFECTIVE' ? 'green' : String(v) === 'DRAFT' ? 'default' : 'blue'}>
                  {String(v)}
                </Tag>
              ),
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 260,
              render: (_v, row) => {
                const r = row as unknown as Contract
                return (
                  <Space>
                    {(r.status === 'DRAFT' || r.status === 'REJECTED') && (
                      <Button size="small" onClick={(e) => { e.stopPropagation(); effectiveM.mutate(r.id) }}>
                        {r.status === 'REJECTED' ? t('quotes.resubmit') : t('contracts.activate')}
                      </Button>
                    )}
                    {r.status === 'DRAFT' && (
                      <Button
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          void api(`/contracts/${r.id}/request-sign`, { method: 'POST' })
                            .then(() => {
                              message.success(t('contracts.eSignStarted'))
                              void qc.invalidateQueries({ queryKey: ['contracts'] })
                            })
                            .catch((err: Error) => message.error(err.message))
                        }}
                      >{t('contracts.eSign')}</Button>
                    )}
                    {r.status === 'EFFECTIVE' && (
                      <Button size="small" danger onClick={(e) => { e.stopPropagation(); terminateM.mutate(r.id) }}>{t('common.terminate')}</Button>
                    )}
                    <Button size="small" onClick={(e) => { e.stopPropagation(); printContract(r.id) }}>{t('common.print')}</Button>
                    <Button size="small" onClick={(e) => { e.stopPropagation(); nav(`/contracts/${r.id}/sign`) }}>{t('contracts.sign')}</Button>
                  </Space>
                )
              },
            },
          ]}
        />
              </ErpListShell>
            ),
          },
          {
            key: 'payments',
            label: t('contracts.paymentRecords'),
            children: (
      <ErpTable
        rowKey="id"
        storageKey="payments"
        loading={payListQ.isLoading}
        dataSource={(payListQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
        pageSize={10}
        columns={[
          { title: t('contracts.paymentNo'), dataIndex: 'paymentNo', width: 130, filterType: 'text' },
          {
            title: t('nav.contracts'),
            dataIndex: 'contract',
            width: 130,
            render: (_: unknown, row) => {
              const r = row as unknown as Payment
              return r.contract?.contractNo ?? '-'
            },
          },
          { title: t('audit.field.amount'), dataIndex: 'amount', width: 100, filterType: 'number' },
          {
            title: t('common.date'),
            dataIndex: 'paidAt',
            width: 110,
            filterType: 'text',
            render: (v: unknown) => (v ? String(v).slice(0, 10) : '-'),
          },
          {
            title: t('audit.field.status'),
            dataIndex: 'status',
            width: 100,
            filterType: 'select',
            filterOptions: ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'RECONCILED'].map((s) => ({ value: s, label: s })),
            render: (s) => <Tag>{String(s)}</Tag>,
          },
          {
            title: t('common.actions'),
            dataIndex: '__op',
            render: (_: unknown, row) => {
              const r = row as unknown as Payment
              return (
              <Space>
                {(r.status === 'DRAFT' || r.status === 'SUBMITTED') && (
                  <Button size="small" onClick={() => confirmM.mutate(r.id)}>{t('common.confirm')}</Button>
                )}
                {r.status === 'CONFIRMED' && r.paymentPlanId && (
                  <Button size="small" onClick={() => reconcileM.mutate(r.id)}>{t('contracts.reconcile')}</Button>
                )}
              </Space>
              )
            },
          },
        ]}
      />
            ),
          },
          {
            key: 'plans',
            label: t('contracts.paymentPlan'),
            children: (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      setPlanRows([{ seq: 1, dueDate: dayjs().add(30, 'day').format('YYYY-MM-DD'), amount: '0' }])
                      setPlanContractId(null)
                      setPlanOpen(true)
                    }}
                  >{t('contracts.configurePaymentPlan')}</Button>
                  <Button
                    size="small"
                    onClick={() => void qc.invalidateQueries({ queryKey: ['payment-plans'] })}
                  >{t('common.refresh')}</Button>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.overdueItemsAppearIn')}</Typography.Text>
                </Space>
                <ErpTable
                  rowKey="id"
                  storageKey="payment-plans"
                  loading={plansQ.isLoading}
                  dataSource={(plansQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={10}
                  columns={[
                    {
                      title: t('common.dueDate'),
                      dataIndex: 'dueDate',
                      width: 110,
                      render: (v: unknown, r: Record<string, unknown>) => {
                        const rr = r as { isOverdue?: boolean; dueDays?: number }
                        return (
                          <Space>
                            <span>{String(v).slice(0, 10)}</span>
                            {rr.isOverdue ? <Tag color="red">{t('contracts.overdue')}{rr.dueDays}{t('contracts.days')}</Tag> : null}
                          </Space>
                        )
                      },
                    },
                    {
                      title: t('nav.contracts'),
                      dataIndex: 'contractNo',
                      width: 130,
                      render: (v: unknown, r: Record<string, unknown>) =>
                        `${v ?? '-'} ${(r as { contractTitle?: string }).contractTitle ?? ''}`.slice(0, 20),
                    },
                    { title: t('contracts.installment'), dataIndex: 'seq', width: 60 },
                    { title: t('common.plannedAmount'), dataIndex: 'amount', width: 100 },
                    { title: t('audit.field.receivedAmount'), dataIndex: 'receivedAmount', width: 90 },
                    {
                      title: t('audit.field.status'),
                      dataIndex: 'status',
                      width: 90,
                      render: (v: unknown, r: Record<string, unknown>) => {
                        const rr = r as { isOverdue?: boolean }
                        return rr.isOverdue ? (
                          <Tag color="red">{String(v)}</Tag>
                        ) : (
                          <Tag>{String(v)}</Tag>
                        )
                      },
                    },
                    {
                      title: t('enum.activity.type.NOTE'),
                      dataIndex: 'remark',
                      width: 140,
                      render: (v: unknown) => {
                        const text = String(v ?? '')
                        if (!text) return '-'
                        const changes = text
                          .split(' | ')
                          .filter((x) => x.includes('变更单'))
                        return changes.length ? (
                          <span style={{ color: '#2b5fd9' }}>
                            {changes[changes.length - 1].slice(0, 30)}
                          </span>
                        ) : (
                          <span style={{ color: '#8b919a', fontSize: 12 }}>{text.slice(0, 30)}</span>
                        )
                      },
                    },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      width: 140,
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              const rr = r as unknown as {
                                contractId?: string
                                dueDate?: string
                                amount?: string
                              }
                              setPlanContractId(String(rr.contractId ?? ''))
                              setPlanRows([
                                {
                                  seq: 1,
                                  dueDate: String(rr.dueDate ?? '').slice(0, 10),
                                  amount: String(rr.amount ?? '0'),
                                },
                              ])
                              setPlanOpen(true)
                            }}
                          >{t('common.edit')}</Button>
                          <Button size="small" onClick={() => nudgeM.mutate(String(r.id))}>{t('contracts.dun')}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'finance',
            label: t('contracts.invoicesChanges'),
            children: (
              <div>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                      setInvForm({
                        contractId: String((listQ.data?.items ?? [])[0]?.id ?? ''),
                        invoiceNo: `INV-${Date.now()}`,
                        amount: '',
                      })
                      setInvOpen(true)
                    }}
                  >{t('contracts.registerInvoice')}</Button>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{t('contracts.totalInvoiced')}<b style={{ color: '#0d9488' }}>
                      {(invQ.data?.items ?? [])
                        .reduce((s, x) => s + Number((x as { amount?: string }).amount || 0), 0)
                        .toFixed(2)}
                    </b>{t('contracts.invoices', { v: invQ.data?.items?.length ?? 0 })}</span>
                  <Button
                    size="small"
                    onClick={() => {
                      // 发票批量导出
                      for (const inv of (invQ.data?.items ?? []) as unknown as {
                        invoiceNo: string
                        contractNo: string
                        amount: string
                        type: string
                        createdAt: string
                      }[]) {
                        exportWord({
                          title: t('contracts.invoice', { invoiceNo: inv.invoiceNo }),
                          meta: { name: inv.contractNo, category: inv.type },
                          terms: [
                            t('contracts.invoiceNo', { invoiceNo: inv.invoiceNo }),
                            t('contracts.contract2', { contractNo: inv.contractNo }),
                            t('contracts.invoiceType', { type: inv.type }),
                            t('contracts.totalInclTax', { amount: inv.amount }),
                            t('contracts.invoiceDate', { v: String(inv.createdAt).slice(0, 10) }),
                          ].join('\n'),
                          filename: t('contracts.invoice2', { invoiceNo: inv.invoiceNo }),
                        })
                      }
                    }}
                  >{t('contracts.batchExportInvoices')}</Button>
                  <Button
                    size="small"
                    onClick={() => {
                      for (const inv of (invQ.data?.items ?? []) as unknown as {
                        invoiceNo: string
                        contractNo: string
                        amount: string
                        type: string
                        createdAt: string
                      }[]) {
                        exportPdf({
                          title: t('contracts.invoice', { invoiceNo: inv.invoiceNo }),
                          meta: { name: inv.contractNo, category: inv.type },
                          terms: [
                            t('contracts.invoiceNo', { invoiceNo: inv.invoiceNo }),
                            t('contracts.contract2', { contractNo: inv.contractNo }),
                            t('contracts.invoiceType', { type: inv.type }),
                            t('contracts.totalInclTax', { amount: inv.amount }),
                            t('contracts.invoiceDate', { v: String(inv.createdAt).slice(0, 10) }),
                          ].join('\n'),
                        })
                      }
                    }}
                  >{t('contracts.batchExportInvoicesPdf')}</Button>
                  <Button
                    size="small"
                    onClick={() => {
                      // 发票对账报表
                      const byContract = new Map<string, { contractNo: string; total: number; invoiced: number }>()
                      for (const c of (listQ.data?.items ?? []) as unknown as {
                        id: string
                        contractNo: string
                        total: string
                      }[]) {
                        byContract.set(c.id, {
                          contractNo: c.contractNo,
                          total: Number(c.total),
                          invoiced: 0,
                        })
                      }
                      for (const inv of (invQ.data?.items ?? []) as unknown as {
                        contractId?: string
                        amount: string
                      }[]) {
                        const key = String(inv.contractId ?? '')
                        const row = byContract.get(key)
                        if (row) row.invoiced += Number(inv.amount || 0)
                      }
                      const rows = [...byContract.values()].filter((r) => r.invoiced > 0 || r.total > 0)
                      const html = t('contracts.invoiceReconciliationReportContract', { v: rows
                            .map(
                              (r) =>
                                `<tr><td style="border:1px solid #94a3b8;padding:6px">${r.contractNo}</td><td style="border:1px solid #94a3b8;padding:6px">${r.total.toFixed(2)}</td><td style="border:1px solid #94a3b8;padding:6px">${r.invoiced.toFixed(2)}</td><td style="border:1px solid #94a3b8;padding:6px">${(r.total - r.invoiced).toFixed(2)}</td></tr>`,
                            )
                            .join('') })
                      const w = window.open('', '_blank')
                      if (!w) return
                      w.document.write(html)
                      w.document.close()
                      w.print()
                    }}
                  >{t('contracts.reconciliationReport')}</Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setCoForm({
                        contractId: String((listQ.data?.items ?? [])[0]?.id ?? ''),
                        title: '',
                        reason: '',
                        amountDelta: '0',
                      })
                      setCoOpen(true)
                    }}
                  >{t('contracts.newChangeOrder')}</Button>
                </Space>
                <Card size="small" title={t('contracts.threeWayReconciliationContract')} style={{ marginBottom: 12 }}>
                  <Space size="large" wrap style={{ marginBottom: 12 }}>
                    <Statistic title={t('common.contractTotal')} value={Number(reconQ.data?.summary.contractTotal ?? 0)} precision={2} />
                    <Statistic title={t('contracts.invoiced')} value={Number(reconQ.data?.summary.invoicedAmount ?? 0)} precision={2} valueStyle={{ color: '#2b5fd9' }} />
                    <Statistic title={t('common.received')} value={Number(reconQ.data?.summary.receivedAmount ?? 0)} precision={2} valueStyle={{ color: '#0d9488' }} />
                    <Statistic
                      title={t('contracts.invoicedReceived')}
                      value={Number(reconQ.data?.summary.gap ?? 0)}
                      precision={2}
                      valueStyle={{ color: Math.abs(Number(reconQ.data?.summary.gap ?? 0)) > 0.01 ? '#d97706' : undefined }}
                    />
                    <div>
                      <div style={{ fontSize: 12, color: '#8b919a' }}>{t('contracts.exceptions')}</div>
                      <Space>
                        <Tag color="red">{t('common.atRisk', { v: reconQ.data?.summary.riskCount ?? 0 })}</Tag>
                        <Tag color="orange">{t('contracts.warnings', { v: reconQ.data?.summary.warnCount ?? 0 })}</Tag>
                        <Tag color="green">{t('contracts.normal', { v: Math.max(0, (reconQ.data?.summary.totalContracts ?? 0) - (reconQ.data?.summary.issueCount ?? 0)) })}</Tag>
                      </Space>
                    </div>
                  </Space>
                  <div style={{ marginBottom: 8 }}>
                    <Button
                      size="small"
                      onClick={() => {
                        void fetch(apiUrl('/api/v1/invoices/reconcile?export=csv'), {
                          headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
                        })
                          .then((r) => r.blob())
                          .then((blob) => {
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = t('contracts.invoiceReconciliationCsv')
                            a.click()
                            URL.revokeObjectURL(url)
                          })
                      }}
                    >{t('contracts.exportReconciliationCsv')}</Button>
                  </div>
                  <Table
                    rowKey="contractId"
                    size="small"
                    loading={reconQ.isLoading}
                    pagination={{ pageSize: 8 }}
                    dataSource={(reconQ.data?.items ?? []).filter((r) => r.flags.length > 0).concat(
                      (reconQ.data?.items ?? []).filter((r) => r.flags.length === 0).slice(0, 5),
                    )}
                    columns={[
                      {
                        title: t('common.level'),
                        dataIndex: 'level',
                        width: 80,
                        render: (v: string) => (
                          <Tag color={v === 'RISK' ? 'red' : v === 'WARN' ? 'orange' : 'green'}>
                            {v === 'RISK' ? t('common.atRisk2') : v === 'WARN' ? t('common.warnings') : t('common.normal')}
                          </Tag>
                        ),
                      },
                      { title: t('audit.field.contractNo'), dataIndex: 'contractNo', width: 130 },
                      { title: t('nav.accounts'), dataIndex: 'accountName', width: 140 },
                      {
                        title: t('common.contractAmount'),
                        dataIndex: 'contractTotal',
                        width: 110,
                        align: 'right' as const,
                      },
                      {
                        title: t('contracts.invoiced'),
                        dataIndex: 'invoicedAmount',
                        width: 110,
                        align: 'right' as const,
                      },
                      {
                        title: t('common.received'),
                        dataIndex: 'receivedAmount',
                        width: 110,
                        align: 'right' as const,
                      },
                      {
                        title: t('contracts.toInvoice'),
                        dataIndex: 'pendingInvoice',
                        width: 110,
                        align: 'right' as const,
                        render: (v: string) => (
                          <span style={{ color: Number(v) > 0.01 ? '#d97706' : '#64748b' }}>{v}</span>
                        ),
                      },
                      {
                        title: t('common.difference'),
                        dataIndex: 'invoicePayGap',
                        width: 110,
                        align: 'right' as const,
                        render: (v: string) => (
                          <b style={{ color: Math.abs(Number(v)) > 0.01 ? '#d97706' : '#64748b' }}>{v}</b>
                        ),
                      },
                      {
                        title: t('contracts.flag'),
                        dataIndex: 'flags',
                        render: (flags: string[]) => {
                          const map: Record<string, { t: string; c: string }> = {
                            OVER_INVOICED: { t: t('contracts.overInvoiced'), c: 'red' },
                            OVER_RECEIVED: { t: t('contracts.overReceived'), c: 'red' },
                            NO_INVOICE: { t: t('contracts.receivedNotInvoiced'), c: 'volcano' },
                            INVOICE_AHEAD: { t: t('contracts.invoicedAhead'), c: 'orange' },
                            PAY_AHEAD: { t: t('contracts.paidAhead'), c: 'blue' },
                            CLOSED_UNDER_INVOICE: { t: t('contracts.finishedNotFullyInvoiced'), c: 'orange' },
                          }
                          return (
                            <Space size={4} wrap>
                              {(flags ?? []).map((f) => (
                                <Tag key={f} color={map[f]?.c ?? 'default'}>
                                  {map[f]?.t ?? f}
                                </Tag>
                              ))}
                              {!flags?.length && <Tag color="green">{t('contracts.matched')}</Tag>}
                            </Space>
                          )
                        },
                      },
                    ]}
                  />
                </Card>
                <ErpTable
                  rowKey="id"
                  storageKey="invoices"
                  loading={invQ.isLoading}
                  dataSource={(invQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={8}
                  columns={[
                    { title: t('contracts.invoiceNo2'), dataIndex: 'invoiceNo', width: 140, filterType: 'text' },
                    { title: t('nav.contracts'), dataIndex: 'contractNo', width: 130 },
                    { title: t('audit.field.amount'), dataIndex: 'amount', width: 100, filterType: 'number' },
                    { title: t('common.type'), dataIndex: 'type', width: 110 },
                    {
                      title: t('audit.field.status'),
                      dataIndex: 'status',
                      width: 90,
                      render: (v: unknown) => <Tag color="green">{String(v)}</Tag>,
                    },
                    {
                      title: t('contracts.invoicedAt'),
                      dataIndex: 'createdAt',
                      width: 110,
                      render: (v: unknown) => String(v ?? '').slice(0, 10),
                    },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      width: 180,
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Space>
                          {String(r.status) === 'ISSUED' ? (
                            <Popconfirm
                              title={t('contracts.voidThisInvoice')}
                              onConfirm={() => {
                                void api(`/invoices/${String(r.id)}/status`, {
                                  method: 'POST',
                                  body: JSON.stringify({ status: 'VOID', remark: t('contracts.void') }),
                                }).then(() => {
                                  message.success(t('contracts.invoiceVoided'))
                                  void qc.invalidateQueries({ queryKey: ['invoices'] })
                                })
                              }}
                            >
                              <Button size="small" danger>{t('contracts.void')}</Button>
                            </Popconfirm>
                          ) : null}
                          {String(r.status) === 'ISSUED' ? (
                            <Button
                              size="small"
                              onClick={() => {
                                void api(`/invoices/${String(r.id)}/status`, {
                                  method: 'POST',
                                  body: JSON.stringify({ status: 'REVERSED', remark: t('contracts.reverse') }),
                                }).then(() => {
                                  message.success(t('contracts.invoiceReversed'))
                                  void qc.invalidateQueries({ queryKey: ['invoices'] })
                                })
                              }}
                            >{t('contracts.reverse')}</Button>
                          ) : null}
                          <Button
                            size="small"
                            onClick={() => {
                            const rr = r as unknown as {
                              invoiceNo: string
                              contractNo: string
                              amount: string
                              type: string
                              createdAt: string
                            }
                            const html = t('contracts.vATI', { invoiceNo: rr.invoiceNo, v: String(rr.createdAt).slice(0, 10), contractNo: rr.contractNo, type: rr.type, amount: rr.amount })
                            const w = window.open('', '_blank')
                            if (!w) return
                            w.document.write(html)
                            w.document.close()
                            w.print()
                          }}
                        >{t('common.print')}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
                <div style={{ margin: '16px 0 8px', fontWeight: 600 }}>{t('contracts.contractChangeOrder')}</div>
                <ErpTable
                  rowKey="id"
                  storageKey="change-orders"
                  loading={coQ.isLoading}
                  dataSource={(coQ.data?.items ?? []) as unknown as Record<string, unknown>[]}
                  pageSize={8}
                  columns={[
                    { title: t('audit.field.title'), dataIndex: 'title', width: 160, filterType: 'text' },
                    { title: t('nav.contracts'), dataIndex: 'contractNo', width: 120 },
                    { title: t('common.reason'), dataIndex: 'reason', width: 160 },
                    {
                      title: t('contracts.amountChange'),
                      dataIndex: 'amountDelta',
                      width: 100,
                      render: (v: unknown) => String(v ?? '0'),
                    },
                    {
                      title: t('audit.field.status'),
                      dataIndex: 'status',
                      width: 90,
                      render: (v: unknown) => {
                        const st = String(v)
                        return (
                          <Tag
                            color={
                              st === 'APPROVED' ? 'green' : st === 'REJECTED' ? 'red' : 'orange'
                            }
                          >
                            {st}
                          </Tag>
                        )
                      },
                    },
                    {
                      title: t('common.actions'),
                      dataIndex: '__op',
                      width: 180,
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Space>
                          {String(r.status) === 'PENDING' ? (
                            <>
                              <Button
                                size="small"
                                onClick={() => decideCoM.mutate({ id: String(r.id), action: 'APPROVE' })}
                              >{t('common.approve')}</Button>
                              <Button
                                size="small"
                                danger
                                onClick={() => decideCoM.mutate({ id: String(r.id), action: 'REJECT' })}
                              >{t('common.reject')}</Button>
                            </>
                          ) : null}
                          <Button
                            size="small"
                            onClick={() => {
                              const rr = r as unknown as {
                                title: string
                                reason: string
                                contractNo: string
                                amountDelta: string
                                status: string
                                createdBy: string
                                createdAt: string
                              }
                              const html = t('contracts.contractChangeOrderContract', { contractNo: rr.contractNo, title: rr.title, reason: rr.reason, amountDelta: rr.amountDelta, status: rr.status, createdBy: rr.createdBy, v: String(rr.createdAt).slice(0, 10) })
                              const w = window.open('', '_blank')
                              if (!w) return
                              w.document.write(html)
                              w.document.close()
                              w.print()
                            }}
                          >{t('common.print')}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
          {
            key: 'templates',
            label: t('contracts.contractTemplates'),
            children: (
              <div>
                <Space style={{ marginBottom: 12 }}>
                  <Button type="primary" size="small" onClick={() => setTplOpen(true)}>{t('contracts.newContractTemplate')}</Button>
                  <Button
                    size="small"
                    onClick={() => {
                      const items = tplQ.data?.items ?? []
                      if (!items.length) {
                        message.info(t('contracts.aContractTemplateWill'))
                      }
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.doc,.docx,.xls,.xlsx,.csv'
                      input.onchange = async () => {
                        const f = input.files?.[0]
                        if (!f) return
                        try {
                          let tplId = items[0]?.id
                          if (!tplId) {
                            const created = await api<{ id: string }>('/contract-templates', {
                              method: 'POST',
                              body: JSON.stringify({ name: f.name.replace(/\.[^.]+$/, ''), terms: '' }),
                            })
                            tplId = created.id
                            void qc.invalidateQueries({ queryKey: ['contract-templates'] })
                          }
                          await uploadTemplateFile(String(tplId), f)
                          message.success(t('common.formatFileUploaded', { name: f.name }))
                          void qc.invalidateQueries({ queryKey: ['contract-templates'] })
                        } catch (e) {
                          message.error(e instanceof Error ? e.message : t('common.uploadFailed'))
                        }
                      }
                      input.click()
                    }}
                  >{t('common.uploadWordExcel')}</Button>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.usageCreateAContract')}</Typography.Text>
                </Space>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={tplQ.data?.items ?? []}
                  pagination={{ pageSize: 8 }}
                  columns={[
                    {
                      title: t('audit.field.name'),
                      dataIndex: 'name',
                      render: (v: string, r: Record<string, unknown>) => {
                        const rr = r as { published?: boolean; approveStatus?: string }
                        return (
                          <Space>
                            <span>{v}</span>
                            {rr.published && <Tag color="green">{t('common.published')}</Tag>}
                            {rr.approveStatus === 'PENDING' && <Tag color="orange">{t('enum.quote.status.SUBMITTED')}</Tag>}
                            {rr.approveStatus === 'APPROVED' && <Tag color="blue">{t('common.approved')}</Tag>}
                            {rr.approveStatus === 'REJECTED' && <Tag color="red">{t('enum.quote.status.REJECTED')}</Tag>}
                          </Space>
                        )
                      },
                    },
                    { title: t('common.category'), dataIndex: 'category', width: 90 },
                    { title: t('contracts.defaultTermMonths'), dataIndex: 'defaultDuration', width: 110 },
                    { title: t('contracts.paymentTerms'), dataIndex: 'defaultPayment', width: 100 },
                    {
                      title: t('contracts.termsSummary'),
                      dataIndex: 'terms',
                      render: (v: string) => (
                        <span style={{ color: '#8b919a', fontSize: 12 }}>
                          {String(v ?? '').slice(0, 40)}
                        </span>
                      ),
                    },
                    {
                      title: t('common.formatFile'),
                      width: 140,
                      render: (_: unknown, r: Record<string, unknown>) => {
                        const f = r.file as { fileName?: string; fileUrl?: string } | undefined
                        return f?.fileUrl ? (
                          <a href={apiUrl(f.fileUrl)} target="_blank" rel="noreferrer">
                            {f.fileName ?? 'Word/Excel'}
                          </a>
                        ) : (
                          <Tag color="default">{t('contracts.notUploaded')}</Tag>
                        )
                      },
                    },
                    {
                      title: t('common.actions'),
                      width: 220,
                      render: (_: unknown, r: Record<string, unknown>) => (
                        <Space>
                          <Button
                            size="small"
                            onClick={() => {
                              setEditId(null)
                              tplForm.setFieldsValue(r)
                              setTplOpen(true)
                              message.info(t('contracts.templateLoadedPleaseConfirm'))
                            }}
                          >{t('contracts.applyEdit')}</Button>
                          {(r as { approveStatus?: string }).approveStatus !== 'APPROVED' && (
                            <Button
                              size="small"
                              onClick={() => {
                                void api(`/contract-templates/${String(r.id)}/approve`, {
                                  method: 'POST',
                                  body: JSON.stringify({ action: 'SUBMIT' }),
                                })
                                  .then(() => {
                                    message.success(t('contracts.templateSubmittedForApproval'))
                                    void qc.invalidateQueries({ queryKey: ['contract-templates'] })
                                  })
                                  .catch((e: Error) => message.error(e.message))
                              }}
                            >{t('common.submitForApproval')}</Button>
                          )}
                          {(r as { approveStatus?: string }).approveStatus === 'PENDING' && (
                            <>
                              <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                  void api(`/contract-templates/${String(r.id)}/approve`, {
                                    method: 'POST',
                                    body: JSON.stringify({ action: 'APPROVE', note: t('common.approved2') }),
                                  })
                                    .then(() => {
                                      message.success(t('contracts.templateApprovedAndPublished'))
                                      void qc.invalidateQueries({ queryKey: ['contract-templates'] })
                                    })
                                    .catch((e: Error) => message.error(e.message))
                                }}
                              >{t('common.approve')}</Button>
                              <Button
                                size="small"
                                danger
                                onClick={() => {
                                  void api(`/contract-templates/${String(r.id)}/approve`, {
                                    method: 'POST',
                                    body: JSON.stringify({ action: 'REJECT', note: t('common.pleaseReviseAndResubmit') }),
                                  })
                                    .then(() => {
                                      message.success(t('contracts.templateRejected'))
                                      void qc.invalidateQueries({ queryKey: ['contract-templates'] })
                                    })
                                    .catch((e: Error) => message.error(e.message))
                                }}
                              >{t('common.reject')}</Button>
                            </>
                          )}
                          <Button
                            size="small"
                            onClick={() => {
                              const published = !(r as { published?: boolean }).published
                              void api(`/contract-templates/${String(r.id)}/publish`, {
                                method: 'POST',
                                body: JSON.stringify({ published }),
                              })
                                .then(() => {
                                  message.success(published ? t('common.templatePublished') : t('common.unpublished'))
                                  void qc.invalidateQueries({ queryKey: ['contract-templates'] })
                                })
                                .catch((e: Error) => message.error(e.message))
                            }}
                          >
                            {(r as { published?: boolean }).published ? t('common.unpublish') : t('common.publish')}
                          </Button>
                          <Button
                            size="small"
                            onClick={async () => {
                              setEditTplId(String(r.id))
                              try {
                                const c = await api<{ content: string; fileUrl?: string; hasFile?: boolean }>(
                                  `/contract-templates/${String(r.id)}/content`,
                                )
                                if (c.content) {
                                  setEditTplHtml(c.content)
                                  setEditTplOpen(true)
                                } else if (c.fileUrl) {
                                  // 无已保存正文时从文件解析
                                  const fileId = String(c.fileUrl).split('/').pop()
                                  const parsed = await api<{ html: string }>(`/files/${fileId}/render-html`)
                                  setEditTplHtml(parsed.html)
                                  setEditTplOpen(true)
                                } else {
                                  setEditTplHtml(String(r.terms ?? ''))
                                  setEditTplOpen(true)
                                }
                              } catch (e) {
                                message.error(e instanceof Error ? e.message : t('common.loadFailed'))
                              }
                            }}
                          >{t('common.editBody')}</Button>
                          <Button
                            size="small"
                            onClick={() =>
                              exportWord({
                                title: t('contracts.contractTemplate', { v: String(r.name ?? '') }),
                                meta: {
                                  name: String(r.name ?? ''),
                                  category: String(r.category ?? ''),
                                  duration: String(r.defaultDuration ?? ''),
                                  payment: String(r.defaultPayment ?? ''),
                                },
                                terms: String(r.terms ?? ''),
                                filename: t('contracts.contracttemplate', { v: String(r.name ?? 'tpl') }),
                              })
                            }
                          >
                            Word
                          </Button>
                          <Button
                            size="small"
                            onClick={() =>
                              exportPdf({
                                title: t('contracts.contractTemplate', { v: String(r.name ?? '') }),
                                meta: {
                                  name: String(r.name ?? ''),
                                  category: String(r.category ?? ''),
                                  duration: String(r.defaultDuration ?? ''),
                                  payment: String(r.defaultPayment ?? ''),
                                },
                                terms: String(r.terms ?? ''),
                              })
                            }
                          >
                            PDF
                          </Button>
                          <Button size="small" danger onClick={() => delTplM.mutate(String(r.id))}>{t('common.delete')}</Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
      <Modal
        title={t('contracts.newContractTemplate')}
        open={tplOpen}
        onCancel={() => setTplOpen(false)}
        onOk={() => tplForm.submit()}
        confirmLoading={saveTplM.isPending}
        width={560}
      >
        <Form form={tplForm} layout="vertical" onFinish={(v) => saveTplM.mutate(v)}>
          <Form.Item name="name" label={t('common.templateName')} rules={[{ required: true }]}>
            <Input placeholder={t('contracts.eGStandardSaas')} />
          </Form.Item>
          <Form.Item name="category" label={t('common.category')} initialValue="标准">
            <Select
              options={[
                { value: '标准', label: t('contracts.standard') },
                { value: '渠道', label: t('contracts.channel') },
                { value: '定制', label: t('contracts.custom') },
              ]}
            />
          </Form.Item>
          <Form.Item name="defaultDuration" label={t('contracts.defaultTermMonths2')} initialValue="12">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="defaultPayment" label={t('contracts.defaultPaymentTerms')} initialValue="年付">
            <Select
              options={[
                { value: '年付', label: t('contracts.annual') },
                { value: '季付', label: t('contracts.quarterly') },
                { value: '月付', label: t('contracts.monthly') },
                { value: '一次性', label: t('contracts.oneTime') },
              ]}
            />
          </Form.Item>
          <Form.Item name="terms" label={t('contracts.standardTerms')}>
            <Input.TextArea rows={5} placeholder={t('contracts.paymentServicePeriodBreach')} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('contracts.editContract')}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => {
          const v = editForm.getFieldsValue()
          const req = editId
            ? api(`/contracts/${editId}`, { method: 'PATCH', body: JSON.stringify(v) })
            : api('/contracts', {
                method: 'POST',
                body: JSON.stringify({
                  title: v.title,
                  accountId: v.accountId || '',
                  currency: v.currency || undefined,
                  terms: v.terms,
                  templateId: v.templateId ?? editForm.getFieldValue('templateId'),
                }),
              })
          void req
            .then(() => {
              message.success(editId ? t('contracts.contractUpdated') : t('contracts.contractCreated'))
              setEditOpen(false)
              void qc.invalidateQueries({ queryKey: ['contracts'] })
            })
            .catch((e: Error) => message.error(e.message))
        }}
        width={480}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label={t('contracts.applyContractTemplate')}>
            <Select
              allowClear
              placeholder={t('contracts.selectATemplateTo')}
              options={(tplQ.data?.items ?? []).map((tpl) => ({
                value: tpl.id,
                label: `${tpl.name}${(tpl as { file?: unknown }).file ? t('common.withFormatFile') : ''}`,
              }))}
              onChange={(v: string) => {
                const tpl = tplQ.data?.items.find((x) => x.id === v)
                if (!tpl) return
                editForm.setFieldsValue({
                  terms: tpl.terms,
                })
                editForm.setFieldValue('templateId', v)
                const f = (tpl as { file?: { fileName?: string; fileUrl?: string } }).file
                if (f?.fileUrl) {
                  message.info(t('common.templateAppliedWithFormat', { v: f.fileName ?? '' }))
                  message.success(t('contracts.appliedAndOpenedFormat', { name: tpl.name }))
                } else {
                  message.success(t('contracts.appliedTerms', { name: tpl.name }))
                }
              }}
            />
          </Form.Item>
          <Form.Item name="title" label={t('audit.field.title')} rules={[{ required: true, message: t('contracts.pleaseEnterAContract') }]}>
            <Input />
          </Form.Item>
          {!editId && (
            <Form.Item
              name="accountId"
              label={t('nav.accounts')}
              rules={[{ required: true, message: t('contracts.pleaseSelectAnAccount') }]}
            >
              <Select
                placeholder={t('common.selectAccount')}
                options={(listQ.data?.items ?? [])
                  .map((c) => (c as { account?: { id: string; name: string } }).account)
                  .filter(Boolean)
                  .map((a) => ({ value: a!.id, label: a!.name }))}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          )}
          {!editId && (
            <Form.Item name="currency" label={t('currency.currency')}>
              <CurrencySelect />
            </Form.Item>
          )}
          <Form.Item name="templateId" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="terms" label={t('common.terms')}>
            <Input.TextArea rows={6} placeholder={t('contracts.standardTermsAreFilled')} />
          </Form.Item>
        </Form>
        {editId ? (
          <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('common.lineItems')}<Button
                size="small"
                style={{ marginLeft: 12 }}
                onClick={() =>
                  setLineRows([
                    ...lineRows,
                    { productId: '', name: '', qty: '1', unitPrice: '0', amount: '0' },
                  ])
                }
              >{t('common.addLine')}</Button>
              <Button
                size="small"
                type="primary"
                ghost
                style={{ marginLeft: 8 }}
                loading={saveLinesM.isPending}
                onClick={() => saveLinesM.mutate()}
              >{t('contracts.saveLineItems')}</Button>
            </div>
            {lineRows.map((l, i) => (
              <Space key={i} style={{ display: 'flex', marginBottom: 6 }} wrap>
                <Input
                  style={{ width: 160 }}
                  placeholder={t('audit.field.name')}
                  value={l.name}
                  onChange={(e) => {
                    const next = [...lineRows]
                    next[i] = { ...l, name: e.target.value }
                    setLineRows(next)
                  }}
                />
                <Input
                  style={{ width: 70 }}
                  placeholder={t('common.qty')}
                  value={l.qty}
                  onChange={(e) => {
                    const next = [...lineRows]
                    next[i] = { ...l, qty: e.target.value }
                    setLineRows(next)
                  }}
                />
                <Input
                  style={{ width: 90 }}
                  placeholder={t('common.unitPrice')}
                  value={l.unitPrice}
                  onChange={(e) => {
                    const next = [...lineRows]
                    const unitPrice = e.target.value
                    const amount = (Number(l.qty || 0) * Number(unitPrice || 0)).toFixed(2)
                    next[i] = { ...l, unitPrice, amount }
                    setLineRows(next)
                  }}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {l.amount}
                </Typography.Text>
                <Button
                  size="small"
                  danger
                  onClick={() => setLineRows(lineRows.filter((_, j) => j !== i))}
                >{t('common.del')}</Button>
              </Space>
            ))}
            {!lineRows.length ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.noLineItemsClick')}</Typography.Text>
            ) : null}
          </div>
        ) : null}
        {editId ? (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('contracts.contractAttachments')}<Button
                size="small"
                type="primary"
                ghost
                style={{ marginLeft: 12 }}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.multiple = true
                  input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.csv'
                  input.onchange = async () => {
                    for (const f of Array.from(input.files ?? [])) {
                      await uploadFile(f, editId)
                    }
                  }
                  input.click()
                }}
              >{t('common.uploadAttachment')}</Button>
            </div>
            {(filesQ.data?.items ?? []).length === 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('contracts.noAttachmentsUploadScanned')}</Typography.Text>
            ) : (
              <div style={{ maxHeight: 160, overflow: 'auto' }}>
                {(filesQ.data?.items ?? []).map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 0',
                      borderBottom: '1px solid #fafafa',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.fileName}
                    </span>
                    <Space>
                      <Typography.Text type="secondary">
                        {(f.size / 1024).toFixed(0)}KB
                      </Typography.Text>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => {
                          void fetch(apiUrl(`/api/v1/files/${f.id}`), {
                            headers: {
                              Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
                            },
                          })
                            .then((r) => r.blob())
                            .then((blob) => {
                              window.open(URL.createObjectURL(blob), '_blank')
                            })
                        }}
                      >{t('contracts.preview')}</Button>
                      <Button
                        size="small"
                        type="link"
                        onClick={() => {
                          void fetch(apiUrl(`/api/v1/files/${f.id}`), {
                            headers: {
                              Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}`,
                            },
                          })
                            .then((r) => r.blob())
                            .then((blob) => {
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = f.fileName
                              a.click()
                              URL.revokeObjectURL(url)
                            })
                        }}
                      >{t('common.download')}</Button>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
      <Modal
        title={t('contracts.registerInvoice')}
        open={invOpen}
        onCancel={() => setInvOpen(false)}
        onOk={() => createInvM.mutate()}
        confirmLoading={createInvM.isPending}
        width={420}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            placeholder={t('contracts.selectContract')}
            value={invForm.contractId || undefined}
            onChange={(v: string) => setInvForm({ ...invForm, contractId: v })}
            options={(listQ.data?.items ?? []).map((c) => ({
              value: String((c as { id: string }).id),
              label: String((c as { contractNo: string }).contractNo),
            }))}
          />
          <Input
            placeholder={t('contracts.invoiceNo2')}
            value={invForm.invoiceNo}
            onChange={(e) => setInvForm({ ...invForm, invoiceNo: e.target.value })}
          />
          <Input
            placeholder={t('audit.field.amount')}
            value={invForm.amount}
            onChange={(e) => setInvForm({ ...invForm, amount: e.target.value })}
          />
        </Space>
      </Modal>
      <Modal
        title={t('contracts.newContractChangeOrder')}
        open={coOpen}
        onCancel={() => setCoOpen(false)}
        onOk={() => createCoM.mutate()}
        confirmLoading={createCoM.isPending}
        width={480}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            placeholder={t('contracts.selectContract')}
            value={coForm.contractId || undefined}
            onChange={(v: string) => setCoForm({ ...coForm, contractId: v })}
            options={(listQ.data?.items ?? []).map((c) => ({
              value: String((c as { id: string }).id),
              label: String((c as { contractNo: string }).contractNo),
            }))}
          />
          <Input
            placeholder={t('contracts.changeTitle')}
            value={coForm.title}
            onChange={(e) => setCoForm({ ...coForm, title: e.target.value })}
          />
          <Input.TextArea
            rows={3}
            placeholder={t('contracts.changeReason')}
            value={coForm.reason}
            onChange={(e) => setCoForm({ ...coForm, reason: e.target.value })}
          />
          <Input
            placeholder={t('contracts.amountChangeMayBe')}
            value={coForm.amountDelta}
            onChange={(e) => setCoForm({ ...coForm, amountDelta: e.target.value })}
          />
        </Space>
      </Modal>
      <Modal
        title={t('contracts.configurePaymentPlan')}
        open={planOpen}
        onCancel={() => setPlanOpen(false)}
        onOk={() => savePlansM.mutate()}
        confirmLoading={savePlansM.isPending}
        width={560}
      >
        <div style={{ marginBottom: 12 }}>
          <span>{t('contracts.contract3')}</span>
          <Select
            style={{ width: 280 }}
            placeholder={t('contracts.selectContract')}
            value={planContractId || undefined}
            onChange={(v: string) => setPlanContractId(v)}
            options={(listQ.data?.items ?? []).map((c) => ({
              value: String((c as { id: string }).id),
              label: `${(c as { contractNo: string }).contractNo} ${(c as { title: string }).title}`.slice(0, 24),
            }))}
          />
        </div>
        {planRows.map((r, i) => (
          <Space key={i} style={{ display: 'flex', marginBottom: 8 }}>
            <Input
              type="date"
              style={{ width: 150 }}
              value={r.dueDate}
              onChange={(e) => {
                const next = [...planRows]
                next[i] = { ...r, dueDate: e.target.value }
                setPlanRows(next)
              }}
            />
            <Input
              style={{ width: 120 }}
              placeholder={t('audit.field.amount')}
              value={r.amount}
              onChange={(e) => {
                const next = [...planRows]
                next[i] = { ...r, amount: e.target.value }
                setPlanRows(next)
              }}
            />
            <Button
              size="small"
              danger
              onClick={() => setPlanRows(planRows.filter((_, j) => j !== i))}
            >{t('common.del')}</Button>
          </Space>
        ))}
        <Button
          block
          onClick={() =>
            setPlanRows([
              ...planRows,
              {
                seq: planRows.length + 1,
                dueDate: dayjs().add(30 * (planRows.length + 1), 'day').format('YYYY-MM-DD'),
                amount: '0',
              },
            ])
          }
        >{t('contracts.addInstallment')}</Button>
      </Modal>
      <Modal
        title={t('contracts.editTemplateBody')}
        open={editTplOpen}
        onCancel={() => setEditTplOpen(false)}
        onOk={() => {
          void api(`/contract-templates/${editTplId}/content`, {
            method: 'PUT',
            body: JSON.stringify({ content: editTplHtml }),
          })
            .then(() => {
              message.success(t('contracts.templateBodySavedIt'))
              setEditTplOpen(false)
              void qc.invalidateQueries({ queryKey: ['contract-templates'] })
            })
            .catch((e: Error) => message.error(e.message))
        }}
        width={720}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <Button
            size="small"
            onClick={() => {
              void api<{ content?: string; fileUrl?: string }>(`/contract-templates/${editTplId}/content`).then(
                async (c) => {
                  if (c.fileUrl) {
                    const parsed = await api<{ html: string }>(
                      `/files/${String(c.fileUrl).split('/').pop()}/render-html`,
                    )
                    setEditTplHtml(parsed.html)
                    message.success(t('common.restoredToUploadedFile'))
                  } else {
                    setEditTplHtml(c.content ?? '')
                  }
                },
              )
            }}
          >{t('common.restoreUploadedFile')}</Button>
          <Button
            size="small"
            onClick={() => {
              const w = window.open('', '_blank')
              if (!w) return
              w.document.write(editTplHtml || t('common.empty2'))
              w.document.close()
              w.print()
            }}
          >{t('common.printPreview')}</Button>
          <Button
            size="small"
            onClick={() => {
              void api<{ history?: { content: string; at: string }[] }>(
                `/contract-templates/${editTplId}/content`,
              ).then((c) => {
                const h = (c as { history?: { content: string; at: string }[] }).history ?? []
                setTplHistory(h)
                message.info(h.length ? t('common.versionsClickToRestore', { length: h.length }) : t('common.noVersionHistory'))
              })
            }}
          >{t('common.versionHistory')}</Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {['客户名','标题','金额','日期','签署日期','合同号','已收款','待收款','生效日期','到期日期','销售'].map((k) => (
            <Button
              key={k}
              size="small"
              onClick={() => setEditTplHtml((s) => s + '{' + k + '}')}
            >
              {'+' + k}
            </Button>
          ))}
        </div>
        {tplHistory.length > 0 && (
          <div style={{ marginBottom: 8, maxHeight: 100, overflow: 'auto', fontSize: 12 }}>
            {tplHistory.slice(0, 5).map((h, i) => (
              <div key={i}>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setEditTplHtml(h.content ?? '')
                    message.success(t('common.loaded', { v: h.at.slice(0, 16).replace('T', ' ') }))
                  }}
                >{t('common.restore2', { v: h.at.slice(5, 16).replace('T', ' ') })}
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setDiffWith(h.content ?? '')}
                >{t('common.compare')}</Button>
              </div>
            ))}
          </div>
        )}
        {diffWith ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, background: '#fff7ed' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('common.versionHistory')}</div>
              <div style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {diffWith}
              </div>
            </div>
            <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, background: '#f0fdf4' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('common.currentDraft')}</div>
              <div style={{ maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {editTplHtml}
              </div>
            </div>
          </div>
        ) : null}


        <RichTextEditor
          value={editTplHtml}
          onChange={setEditTplHtml}
          minHeight={300}
          placeholder={t('contracts.wysiwygEditingOfThe')}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#646A73' }}>{t('contracts.wysiwygEditorPrintingUses')}{'{客户名} {标题} {金额} {日期} {签署日期} {合同号} {已收款} {待收款} {生效日期} {到期日期} {销售}'}
        </div>
      </Modal>
    </div>
  )
}