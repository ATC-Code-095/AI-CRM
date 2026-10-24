import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Popconfirm,
} from 'antd'
import { useUrlState } from '../hooks/useUrlState'
import dayjs from 'dayjs'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, apiUrl } from '../api/client'
import { useQuickCreate } from '../utils/quickCreate'
import { ErpListShell } from '../components/ErpListShell'
import { ErpTable } from '../components/ErpTable'
import { exportPdf, exportWord } from '../utils/docExport'
import { RichTextEditor } from '../components/RichTextEditor'
import { EntityFilterSelect } from '../components/EntityFilterSelect'
import { useEntityScope } from '../hooks/useEntityScope'
import { t } from '../i18n'
import { CurrencySelect } from '../components/CurrencySelect'

async function uploadQuoteTplFile(entityId: string, file: File) {
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
  await api(`/quote-templates/${entityId}/file`, {
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
        await api(`/quote-templates/${entityId}/content`, {
          method: 'PUT',
          body: JSON.stringify({ content: parsed.html }),
        })
      }
    } catch {
      /* 解析失败保留文件 */
    }
  }
}

interface Quote {
  id: string
  quoteNo: string
  subject: string
  status: string
  total: string
  account?: { name: string }
  lines?: unknown[]
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'orange',
  APPROVED: 'green',
  SENT: 'blue',
  ACCEPTED: 'success',
  REJECTED: 'red',
}

export default function QuotesPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  useQuickCreate('quote', () => setOpen(true))
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const ent = useEntityScope()
  const [entFilter, setEntFilter] = useState<string | null>(null)
  const [form] = Form.useForm()
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; code: string; name: string }[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; standardPrice: string }[]>([])
  const [bundles, setBundles] = useState<
    { id: string; name: string; description: string; productIds: string[]; discountRate: string }[]
  >([])
  const [lines, setLines] = useState<{ productId: string; qty: number; discountRate: number }[]>([])
  const [tplName, setTplName] = useState('')
  const [tplOpen, setTplOpen] = useState(false)
  const [editTplOpen, setEditTplOpen] = useState(false)
  const [editTplId, setEditTplId] = useState<string | null>(null)
  const [editTplHtml, setEditTplHtml] = useState('')
  const [tplHistory, setTplHistory] = useState<{ content: string; at: string }[]>([])
  const [diffWith, setDiffWith] = useState<string | null>(null)
  const [tplManageOpen, setTplManageOpen] = useState(false)

  const tplQ = useQuery({
    queryKey: ['quote-templates'],
    queryFn: () =>
      api<{
        items: {
          id: string
          name: string
          description?: string
          published?: boolean
          approveStatus?: string
          file?: { fileName?: string }
          lines: { productId: string; qty: number | string; discountRate: number | string }[]
        }[]
      }>('/quote-templates'),
    retry: false,
  })

  const saveTplM = useMutation({
    mutationFn: () =>
      api('/quote-templates', {
        method: 'POST',
        body: JSON.stringify({
          name: tplName || t('quotes.untitledTemplate'),
          lines: lines
            .filter((l) => l.productId)
            .map((l) => ({
              productId: l.productId,
              qty: String(l.qty),
              discountRate: String(l.discountRate),
            })),
        }),
      }),
    onSuccess: () => {
      message.success(t('quotes.templateSaved'))
      setTplOpen(false)
      setTplName('')
      void qc.invalidateQueries({ queryKey: ['quote-templates'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const delTplM = useMutation({
    mutationFn: (id: string) => api(`/quote-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success(t('quotes.templateDeleted'))
      void qc.invalidateQueries({ queryKey: ['quote-templates'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const applyTpl = (tplId: string) => {
    const tpl = tplQ.data?.items.find((x) => x.id === tplId)
    if (!tpl) return
    setLines(
      (tpl.lines ?? []).map((l) => ({
        productId: l.productId,
        qty: Number(l.qty) || 1,
        discountRate: Number(l.discountRate) || 0,
      })),
    )
    if (tpl.description) {
      form.setFieldsValue({ subject: tpl.description })
    }
    const file = (tpl as { file?: { fileName?: string; fileUrl?: string } }).file
    if (file?.fileUrl) {
      message.info(t('common.templateAppliedWithFormat', { v: file.fileName ?? '' }))
      message.success(t('quotes.appliedTemplateAndOpened', { name: tpl.name, v: file.fileName ?? '' }))
    } else {
      message.success(t('quotes.appliedTemplate', { name: tpl.name }))
    }
  }

  const listQ = useQuery({
    queryKey: ['quotes'],
    queryFn: () => api<{ items: Quote[]; total: number }>('/quotes?pageSize=50'),
  })

  const openCreate = async () => {
    const [acc, prod, bdl, prj] = await Promise.all([
      api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=50'),
      api<{ items: { id: string; name: string; standardPrice: string }[] }>('/products?pageSize=50'),
      api<{ id: string; name: string; description: string; productIds: string[]; discountRate: string }[]>(
        '/product-bundles',
      ),
      api<{ items: { id: string; code: string; name: string }[] }>('/projects').catch(() => ({
        items: [],
      })),
    ])
    setAccounts(acc.items ?? [])
    setProducts(prod.items ?? [])
    setBundles(Array.isArray(bdl) ? bdl : [])
    setProjects(prj.items ?? [])
    setLines([{ productId: '', qty: 1, discountRate: 0 }])
    setOpen(true)
  }

  const addBundle = (bundleId: string) => {
    const bundle = bundles.find((b) => b.id === bundleId)
    if (!bundle) return
    const disc = Number(bundle.discountRate) || 0
    const next = bundle.productIds.map((pid) => ({
      productId: pid,
      qty: 1,
      discountRate: disc,
    }))
    setLines((prev) => {
      const base = prev.filter((l) => l.productId)
      return [...base, ...next]
    })
    message.success(t('quotes.added', { name: bundle.name }))
  }

  const createMut = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          accountId: values.accountId,
          subject: values.subject,
          currency: values.currency || undefined,
          projectId: values.projectId,
          projectName: values.projectName,
          lines: lines
            .filter((l) => l.productId)
            .map((l) => ({
              productId: l.productId,
              qty: String(l.qty),
              discountRate: String(l.discountRate),
            })),
        }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const useQuoteAction = (path: string) =>
    useMutation({
      mutationFn: (id: string) => api(`/quotes/${id}/${path}`, { method: 'POST' }),
      onSuccess: () => {
        message.success('OK')
        void qc.invalidateQueries({ queryKey: ['quotes'] })
      },
      onError: (e: Error) => message.error(e.message),
    })

  const submitM = useQuoteAction('submit')
  const sendM = useQuoteAction('send')
  const acceptM = useQuoteAction('accept')
  const toContractM = useQuoteAction('to-contract')
  const printQuote = (id: string) => window.open(`/quotes/${id}/print`, '_blank')
  const rejectM = useMutation({
    mutationFn: (id: string) =>
      api(`/quotes/${id}/submit`, {
        // 仅 DRAFT 可再提交；REJECTED 后 UI 提示改行再提交
        method: 'POST',
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const batchDelM = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: number; failed: number }>('/quotes/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (r) => {
      message.success(t('quotes.deletedDraftQuotes', { ok: r.ok, v: r.failed ? t('quotes.skipped', { failed: r.failed }) : '' }))
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtqte0001"
        title={t('nav.quotes')}
        subtitle={t('quotes.salesQuotes')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['quotes'] })}
        onCreate={() => void openCreate()}
        createLabel={t('common.create')}
        extraActions={
          <>
          <EntityFilterSelect value={entFilter} onChange={setEntFilter} />
          <Button
            size="small"
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.doc,.docx,.xls,.xlsx,.csv'
              input.onchange = async () => {
                const f = input.files?.[0]
                if (!f) return
                try {
                  const items = tplQ.data?.items ?? []
                  let tplId = items[0]?.id
                  if (!tplId) {
                    const created = await api<{ id: string }>('/quote-templates', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: f.name.replace(/\.[^.]+$/, ''),
                        lines: [],
                        description: t('quotes.wordExcelFormatTemplate'),
                      }),
                    })
                    tplId = created.id
                    void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                  }
                  await uploadQuoteTplFile(String(tplId), f)
                  message.success(t('quotes.quoteTemplateFormatUploaded', { name: f.name }))
                  void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                } catch (e) {
                  message.error(e instanceof Error ? e.message : t('common.uploadFailed'))
                }
              }
              input.click()
            }}
          >{t('quotes.uploadQuoteTemplateWord')}</Button>
          </>
        }
      >
        <ErpTable
          rowKey="id"
          storageKey="quotes"
          batchBar={(ids, rows, clear) => (
            <Space wrap size={8}>
              <span style={{ color: '#64748b' }}>{t('common.selected', { length: ids.length })}</span>
              <Button
                size="small"
                onClick={() => {
                  const header = [t('common.no'), t('common.subject'), t('nav.accounts'), t('common.total'), t('audit.field.status')]
                  const csv = [
                    header.join(','),
                    ...(rows as unknown as { quoteNo: string; subject: string; account?: { name?: string }; total: string; status: string }[]).map((r) =>
                      [r.quoteNo, r.subject, r.account?.name ?? '', r.total, r.status]
                        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                        .join(','),
                    ),
                  ].join('\n')
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `quotes-selected_${Date.now()}.csv`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >{t('common.exportSelected')}</Button>
              <Popconfirm
                title={t('quotes.deleteSelectedDraftQuotes', { length: ids.length })}
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
                    quoteNo: string
                    subject: string
                    total: string
                    lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
                  }[]) {
                    exportWord({
                      title: t('quotes.quote', { quoteNo: r.quoteNo }),
                      meta: { name: r.subject },
                      terms: '',
                      lines: (r.lines ?? []).map((l) => ({
                        name: l.name,
                        qty: l.qty,
                        unitPrice: l.unitPrice,
                        amount: l.amount,
                      })),
                      filename: t('quotes.quote2', { quoteNo: r.quoteNo }),
                    })
                  }
                }}
              >{t('common.batchExportWord')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const r of rows as unknown as {
                    quoteNo: string
                    subject: string
                    total: string
                    lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
                  }[]) {
                    exportPdf({
                      title: t('quotes.quote', { quoteNo: r.quoteNo }),
                      meta: { name: r.subject },
                      terms: '',
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
          loading={listQ.isLoading}
          dataSource={ent
            .filterByEntity(
              (listQ.data?.items ?? []).filter(
                (r) =>
                  !q ||
                  r.quoteNo.toLowerCase().includes(q.toLowerCase()) ||
                  r.subject.toLowerCase().includes(q.toLowerCase()),
              ) as unknown as { id: string; accountId?: string }[],
              entFilter,
            ) as unknown as Record<string, unknown>[]}
          pageSize={15}
          onRowClick={(row) => nav(`/quotes/${String(row.id)}`)}
          columns={[
            {
              title: t('common.no'),
              dataIndex: 'quoteNo',
              width: 150,
              filterType: 'text',
              sorter: true,
              render: (v, r) => (
                <Link to={`/quotes/${String((r as unknown as Quote).id)}`}>{String(v)}</Link>
              ),
            },
            { title: t('common.subject'), dataIndex: 'subject', width: 180, filterType: 'text' },
            {
              title: t('nav.accounts'),
              dataIndex: 'account',
              width: 130,
              filterType: 'text',
              render: (v) => {
                const acc = v as { name?: string } | undefined
                return acc?.name ?? '-'
              },
            },
            { title: t('common.total'), dataIndex: 'total', width: 100, filterType: 'number' },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 100,
              filterType: 'select',
              filterOptions: ['DRAFT', 'SUBMITTED', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED'].map(
                (s) => ({ value: s, label: s }),
              ),
              render: (v) => <Tag color={STATUS_COLOR[String(v)] ?? 'default'}>{String(v)}</Tag>,
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 220,
              render: (_v, row) => {
                const r = row as unknown as Quote
                return (
                  <Space wrap>
                    <Button
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation()
                        printQuote(r.id)
                      }}
                    >{t('common.print')}</Button>
                    {r.status === 'DRAFT' && (
                      <Button size="small" onClick={(e) => { e.stopPropagation(); submitM.mutate(r.id) }}>{t('quotes.submit')}</Button>
                    )}
                    {r.status === 'REJECTED' && (
                      <Button size="small" onClick={(e) => { e.stopPropagation(); rejectM.mutate(r.id) }}>{t('quotes.resubmit')}</Button>
                    )}
                    {r.status === 'APPROVED' && (
                      <Button size="small" onClick={(e) => { e.stopPropagation(); sendM.mutate(r.id) }}>{t('common.send')}</Button>
                    )}
                    {r.status === 'SENT' && (
                      <Button size="small" onClick={(e) => { e.stopPropagation(); acceptM.mutate(r.id) }}>{t('quotes.accept')}</Button>
                    )}
                    {r.status === 'ACCEPTED' && (
                      <Button size="small" type="primary" onClick={(e) => { e.stopPropagation(); toContractM.mutate(r.id) }}>{t('quotes.toContract')}</Button>
                    )}
                  </Space>
                )
              },
            },
          ]}
        />
      </ErpListShell>
      <Modal
        title={t('common.create')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMut.isPending}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate(v)}>
          <Form.Item name="subject" label={t('common.subject')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountId" label={t('nav.accounts')} rules={[{ required: true }]}>
            <Select options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="currency" label={t('currency.currency')}>
            <CurrencySelect />
          </Form.Item>
          <Form.Item name="projectId" label={t('quotes.project')}>
            <Select
              allowClear
              placeholder={t('quotes.optionalForProjectBased')}
              options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              onChange={(v: string) => {
                const p = projects?.find((x) => x.id === v)
                form.setFieldsValue({ projectName: p?.name })
              }}
            />
          </Form.Item>
          <Form.Item name="projectName" hidden>
            <Input />
          </Form.Item>
          {bundles.length > 0 && (
            <Form.Item label={t('quotes.addBundle')}>
              <Select
                placeholder={t('quotes.selectABundleTo')}
                options={bundles.map((b) => ({
                  value: b.id,
                  label: t('quotes.off', { name: b.name, description: b.description, v: (1 - Number(b.discountRate)) * 10 }),
                }))}
                onChange={(v: string) => {
                  addBundle(v)
                }}
                allowClear
              />
            </Form.Item>
          )}
          <Form.Item label={t('quotes.quoteTemplatesApplySave')}>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                placeholder={t('quotes.selectATemplateTo')}
                style={{ flex: 1 }}
                options={(tplQ.data?.items ?? []).map((tpl) => ({
                  value: tpl.id,
                  label: t('quotes.lines', { name: tpl.name, length: (tpl.lines ?? []).length }),
                }))}
                onChange={(v: string) => applyTpl(v)}
                allowClear
              />
              <Button onClick={() => setTplOpen(true)}>{t('quotes.saveAsTemplate')}</Button>
              <Button
                onClick={() => {
                  const items = tplQ.data?.items ?? []
                  if (!items.length) {
                    message.warning(t('quotes.saveAsATemplate'))
                    return
                  }
                  void (async () => {
                    try {
                      const c = await api<{ content: string; fileUrl?: string }>(
                        `/quote-templates/${items[0].id}/content`,
                      )
                      setEditTplId(items[0].id)
                      if (c.content) setEditTplHtml(c.content)
                      else if (c.fileUrl) {
                        const parsed = await api<{ html: string }>(`/files/${String(c.fileUrl).split('/').pop()}/render-html`)
                        setEditTplHtml(parsed.html)
                      } else setEditTplHtml('')
                      setEditTplOpen(true)
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : t('common.loadFailed'))
                    }
                  })()
                }}
              >{t('common.editBody')}</Button>
              <Button
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.doc,.docx,.xls,.xlsx,.csv'
                  input.onchange = async () => {
                    const f = input.files?.[0]
                    if (!f) return
                    try {
                      const items = tplQ.data?.items ?? []
                      let tplId = items[0]?.id
                      if (!tplId) {
                        // 无模板时自动创建一条，再挂格式文件
                        const created = await api<{ id: string }>('/quote-templates', {
                          method: 'POST',
                          body: JSON.stringify({
                            name: f.name.replace(/\.[^.]+$/, ''),
                            lines: [],
                            description: t('quotes.wordExcelFormatTemplate'),
                          }),
                        })
                        tplId = created.id
                        void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                      }
                      await uploadQuoteTplFile(String(tplId), f)
                      message.success(t('common.formatFileUploaded', { name: f.name }))
                      void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : t('common.uploadFailed'))
                    }
                  }
                  input.click()
                }}
              >{t('common.uploadWordExcel')}</Button>
              <Button
                onClick={() => {
                  exportWord({
                    title: t('quotes.quoteTemplates'),
                    terms: t('quotes.standardQuoteTerms'),
                    lines: lines
                      .filter((l) => l.productId)
                      .map((l) => ({
                        name: products.find((p) => p.id === l.productId)?.name ?? l.productId,
                        qty: String(l.qty),
                        unitPrice: String(l.qty),
                        amount: String(l.qty * l.discountRate),
                      })),
                    filename: t('quotes.quoteTemplates'),
                  })
                }}
              >
                Word
              </Button>
              <Button
                onClick={() =>
                  exportPdf({
                    title: t('quotes.quoteTemplates'),
                    terms: t('quotes.standardQuoteTerms'),
                  })
                }
              >
                PDF
              </Button>
              <Button onClick={() => setTplManageOpen(true)}>{t('quotes.manage')}</Button>
            </Space.Compact>
            {(tplQ.data?.items ?? []).length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(tplQ.data?.items ?? []).slice(0, 5).map((tpl) => (
                  <Tag
                    key={tpl.id}
                    closable
                    onClose={(e) => {
                      e.preventDefault()
                      delTplM.mutate(tpl.id)
                    }}
                    style={{ cursor: 'pointer' }}
                    color={tpl.published ? 'green' : tpl.approveStatus === 'PENDING' ? 'orange' : undefined}
                    onClick={() => applyTpl(tpl.id)}
                  >
                    {tpl.name}
                    {tpl.published ? t('quotes.published') : tpl.approveStatus === 'PENDING' ? t('quotes.pendingApproval') : ''}
                  </Tag>
                ))}
              </div>
            )}
          </Form.Item>
          {lines.map((line, idx) => (
            <Space key={idx} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
              <Select
                style={{ width: 220 }}
                placeholder={t('common.products')}
                value={line.productId || undefined}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(productId) => {
                  const next = [...lines]
                  next[idx] = { ...next[idx], productId }
                  setLines(next)
                }}
              />
              <InputNumber
                min={1}
                value={line.qty}
                onChange={(qty) => {
                  const next = [...lines]
                  next[idx] = { ...next[idx], qty: Number(qty ?? 1) }
                  setLines(next)
                }}
              />
              <InputNumber
                min={0}
                max={1}
                step={0.05}
                value={line.discountRate}
                onChange={(d) => {
                  const next = [...lines]
                  next[idx] = { ...next[idx], discountRate: Number(d ?? 0) }
                  setLines(next)
                }}
              />
            </Space>
          ))}
          <Button
            type="dashed"
            block
            onClick={() => setLines([...lines, { productId: '', qty: 1, discountRate: 0 }])}
          >{t('common.addLine')}</Button>
          <div style={{ color: '#646A73', marginTop: 8 }}>{t('quotes.defaultCloseDateReference', { v: dayjs().add(30, 'day').format('YYYY-MM-DD') })}
          </div>
        </Form>
      </Modal>
      <Modal
        title={t('quotes.quoteTemplateManagement')}
        open={tplManageOpen}
        onCancel={() => setTplManageOpen(false)}
        footer={null}
        width={720}
      >
        <Table
          rowKey="id"
          size="small"
          dataSource={tplQ.data?.items ?? []}
          pagination={false}
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
            {
              title: t('quotes.lines2'),
              width: 70,
              render: (_: unknown, r: Record<string, unknown>) =>
                ((r as { lines?: unknown[] }).lines ?? []).length,
            },
            {
              title: t('common.formatFile'),
              width: 130,
              render: (_: unknown, r: Record<string, unknown>) =>
                (r as { file?: { fileName?: string } }).file?.fileName ?? '—',
            },
            {
              title: t('common.actions'),
              width: 280,
              render: (_: unknown, r: Record<string, unknown>) => {
                const rr = r as { id: string; published?: boolean; approveStatus?: string }
                return (
                  <Space wrap>
                    {rr.approveStatus !== 'APPROVED' && (
                      <Button
                        size="small"
                        onClick={() => {
                          void api(`/quote-templates/${rr.id}/approve`, {
                            method: 'POST',
                            body: JSON.stringify({ action: 'SUBMIT' }),
                          })
                            .then(() => {
                              message.success(t('quotes.submittedForApproval'))
                              void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                            })
                            .catch((e: Error) => message.error(e.message))
                        }}
                      >{t('common.submitForApproval')}</Button>
                    )}
                    {rr.approveStatus === 'PENDING' && (
                      <>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => {
                            void api(`/quote-templates/${rr.id}/approve`, {
                              method: 'POST',
                              body: JSON.stringify({ action: 'APPROVE', note: t('common.approved2') }),
                            })
                              .then(() => {
                                message.success(t('quotes.approvedAndPublished'))
                                void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                              })
                              .catch((e: Error) => message.error(e.message))
                          }}
                        >{t('common.approve')}</Button>
                        <Button
                          size="small"
                          danger
                          onClick={() => {
                            void api(`/quote-templates/${rr.id}/approve`, {
                              method: 'POST',
                              body: JSON.stringify({ action: 'REJECT', note: t('common.pleaseReviseAndResubmit') }),
                            })
                              .then(() => {
                                message.success(t('enum.quote.status.REJECTED'))
                                void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                              })
                              .catch((e: Error) => message.error(e.message))
                          }}
                        >{t('common.reject')}</Button>
                      </>
                    )}
                    <Button
                      size="small"
                      onClick={() => {
                        const published = !rr.published
                        void api(`/quote-templates/${rr.id}/publish`, {
                          method: 'POST',
                          body: JSON.stringify({ published }),
                        })
                          .then(() => {
                            message.success(published ? t('common.templatePublished') : t('common.unpublished'))
                            void qc.invalidateQueries({ queryKey: ['quote-templates'] })
                          })
                          .catch((e: Error) => message.error(e.message))
                      }}
                    >
                      {rr.published ? t('common.unpublish') : t('common.publish')}
                    </Button>
                    <Button size="small" onClick={() => applyTpl(rr.id)}>{t('quotes.apply')}</Button>
                  </Space>
                )
              },
            },
          ]}
        />
      </Modal>
      <Modal
        title={t('quotes.saveQuoteTemplate')}
        open={tplOpen}
        onCancel={() => setTplOpen(false)}
        onOk={() => saveTplM.mutate()}
        confirmLoading={saveTplM.isPending}
        width={420}
      >
        <Input
          placeholder={t('quotes.templateNameEG')}
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
        />
        <div style={{ marginTop: 8, color: '#646A73', fontSize: 12 }}>{t('quotes.usageCreateAQuote')}</div>
      </Modal>
      <Modal
        title={t('quotes.editQuoteTemplateBody')}
        open={editTplOpen}
        onCancel={() => setEditTplOpen(false)}
        onOk={() => {
          void api(`/quote-templates/${editTplId}/content`, {
            method: 'PUT',
            body: JSON.stringify({ content: editTplHtml }),
          })
            .then(() => {
              message.success(t('quotes.templateBodySaved'))
              setEditTplOpen(false)
              void qc.invalidateQueries({ queryKey: ['quote-templates'] })
            })
            .catch((e: Error) => message.error(e.message))
        }}
        width={720}
      >
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          <Button
            size="small"
            onClick={() => {
              void api<{ content?: string; fileUrl?: string }>(`/quote-templates/${editTplId}/content`).then(
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
                `/quote-templates/${editTplId}/content`,
              ).then((c) => {
                const h = (c as { history?: { content: string; at: string }[] }).history ?? []
                setTplHistory(h)
                message.info(h.length ? t('common.versionsClickToRestore', { length: h.length }) : t('common.noVersionHistory'))
              })
            }}
          >{t('common.versionHistory')}</Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {['客户名','标题','金额','日期','报价单号','小计','折扣','税额','币种','销售','有效期'].map((k) => (
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
          placeholder={t('quotes.wysiwygEditingOfThe')}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#646A73' }}>{t('quotes.wysiwygEditorPrintingAnd')}{'{客户名} {标题} {金额} {日期} {签署日期} {报价单号} {小计} {税额} {币种} {销售} {有效期}'}
        </div>
      </Modal>
    </div>
  )
}
