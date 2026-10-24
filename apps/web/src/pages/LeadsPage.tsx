import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Popconfirm,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
} from 'antd'
import { useUrlState } from '../hooks/useUrlState'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { exportPdf, exportWord } from '../utils/docExport'
import { useQuickCreate } from '../utils/quickCreate'
import { LeadConvertModal } from './leads/LeadConvertModal'
import { useFeature } from '../hooks/useFeature'
import { ErpListShell } from '../components/ErpListShell'
import { ErpTable } from '../components/ErpTable'
import { MobileCardList } from '../components/MobileCardList'
import { useIsMobile } from '../hooks/useIsMobile'

interface Lead {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  status: string
  source: string
  score: number
  nextFollowAt: string | null
}

const STATUS_COLOR: Record<string, string> = {
  NEW: 'blue',
  ACCEPTED: 'geekblue',
  CULTIVATING: 'orange',
  CONVERTED: 'green',
  CLOSED_LOST: 'default',
}

export default function LeadsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const nav = useNavigate()
  const isMobile = useIsMobile()
  const importEnabled = useFeature('feature.import')
  const [open, setOpen] = useState(false)
  useQuickCreate('lead', () => setOpen(true))
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [convertId, setConvertId] = useState<string | null>(null)
  const [leadQ, setLeadQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [form] = Form.useForm()

  const { data, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api<{ items: Lead[]; total: number }>('/leads?pageSize=50'),
  })

  /** 关键词过滤后的线索（移动卡片与桌面网格共用） */
  const leadRows = (data?.items ?? []).filter(
    (l) =>
      !leadQ ||
      l.name?.toLowerCase().includes(leadQ.toLowerCase()) ||
      (l.phone ?? '').includes(leadQ),
  )

  const createMut = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api('/leads', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const batchCloseM = useMutation({
    mutationFn: (p: { ids: string[]; reason?: string }) =>
      api<{ ok: number }>('/leads/batch-close', {
        method: 'POST',
        body: JSON.stringify(p),
      }),
    onSuccess: (r) => {
      message.success(t('leads.closedLeads', { ok: r.ok }))
      void qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const batchRecycleM = useMutation({
    mutationFn: (p: { ids: string[]; reason?: string }) =>
      api<{ ok: number }>('/leads/batch-recycle', {
        method: 'POST',
        body: JSON.stringify(p),
      }),
    onSuccess: (r) => {
      message.success(t('leads.recycledToThePool', { ok: r.ok }))
      void qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const batchAssignM = useMutation({
    mutationFn: (p: { ids: string[]; ownerId: string }) =>
      api<{ ok: number }>('/leads/batch-assign', {
        method: 'POST',
        body: JSON.stringify(p),
      }),
    onSuccess: (r) => {
      message.success(t('leads.assignedLeads', { ok: r.ok }))
      void qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const usersQ = useQuery({
    queryKey: ['users-mini'],
    queryFn: () =>
      api<{ items: { id: string; name: string; email: string }[] }>('/users/options'),
  })

  const importMut = useMutation({
    mutationFn: () =>
      api<{ ok: number; failed: number; errors: string[] }>('/import/leads', {
        method: 'POST',
        body: JSON.stringify({ csv: importText }),
      }),
    onSuccess: (r) => {
      message.success(t('leads.importedFailed', { ok: r.ok, failed: r.failed }))
      setImportOpen(false)
      setImportText('')
      void qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const closeMut = useMutation({
    mutationFn: (id: string) =>
      api(`/leads/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ reason: t('leads.closedFromList') }),
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtled0001"
        title={t('nav.leads')}
        subtitle={t('leads.acquisitionLeadPool')}
        search={leadQ}
        onSearch={setLeadQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['leads'] })}
        onCreate={() => setOpen(true)}
        createLabel={t('common.create')}
        extraActions={
          importEnabled ? (
            <Button size="small" onClick={() => setImportOpen(true)}>{t('leads.importCsv')}</Button>
          ) : null
        }
      >
        {isMobile ? (
          <MobileCardList
            loading={isLoading}
            items={leadRows.map((l) => ({
              id: l.id,
              title: l.name,
              to: `/leads/${l.id}`,
              swipeActions: [
                {
                  key: 'recycle',
                  label: t('leads.recycle'),
                  color: '#d97706',
                  onClick: () => batchRecycleM.mutate({ ids: [l.id], reason: t('leads.swipeRecycle') }),
                },
                {
                  key: 'close',
                  label: t('common.close'),
                  danger: true,
                  onClick: () => batchCloseM.mutate({ ids: [l.id], reason: t('leads.swipeClose') }),
                },
              ],
              tags: (
                <Tag color={STATUS_COLOR[l.status] ?? 'default'}>
                  {t(`enum.lead.status.${l.status}`)}
                </Tag>
              ),
              subtitle: l.contactName ? t('leads.contact', { contactName: l.contactName }) : t('leads.noContact'),
              fields: [
                { label: t('enum.activity.type.CALL'), value: l.phone ?? '-' },
                { label: t('common.source'), value: l.source ?? '-' },
                { label: t('common.score'), value: String(l.score ?? 0) },
                { label: t('common.nextFollowUp'), value: l.nextFollowAt ? String(l.nextFollowAt).slice(0, 10) : '-' },
              ],
              actions: (
                <Space size={6}>
                  <Button
                    size="small"
                    disabled={l.status === 'CONVERTED'}
                    onClick={() => setConvertId(l.id)}
                  >{t('common.convert')}</Button>
                  <Button
                    size="small"
                    danger
                    disabled={l.status === 'CONVERTED' || l.status === 'CLOSED_LOST'}
                    onClick={() => closeMut.mutate(l.id)}
                  >{t('common.close')}</Button>
                </Space>
              ),
            }))}
          />
        ) : (
        <ErpTable
          rowKey="id"
          storageKey="leads"
          loading={isLoading}
          dataSource={leadRows as unknown as Record<string, unknown>[]}
          pageSize={15}
          onRowClick={(row) => nav(`/leads/${String(row.id)}`)}
          batchBar={(ids, rows, clear) => (
            <Space wrap size={8}>
              <span className="crm-muted">{t('leads.selected', { length: ids.length })}</span>
              <Select
                style={{ width: 170 }}
                size="small"
                placeholder={t('leads.assignSelectedTo')}
                options={(usersQ.data?.items ?? []).map((u) => ({
                  value: u.id,
                  label: u.name || u.email,
                }))}
                onChange={(ownerId: string) => {
                  batchAssignM.mutate({ ids, ownerId })
                  clear()
                }}
                allowClear
              />
              <Button
                size="small"
                onClick={() => {
                  const header = ['name', 'contactName', 'phone', 'status', 'source', 'score']
                  const csv = [
                    header.join(','),
                    ...(rows as unknown as Lead[]).map((l) =>
                      [l.name, l.contactName, l.phone, l.status, l.source, l.score]
                        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                        .join(','),
                    ),
                  ].join('\n')
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `leads-selected_${Date.now()}.csv`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >{t('common.exportSelected')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const l of rows as unknown as {
                    name: string
                    contactName?: string
                    phone?: string
                    status?: string
                    source?: string
                  }[]) {
                    exportWord({
                      title: t('leads.leadProfile', { name: l.name }),
                      meta: { name: l.name, category: l.source ?? '' },
                      terms: [
                        t('leads.leadName', { name: l.name }),
                        t('leads.contact2', { v: l.contactName ?? '—' }),
                        t('common.phone', { v: l.phone ?? '—' }),
                        t('leads.status', { v: l.status ?? '—' }),
                        t('leads.source', { v: l.source ?? '—' }),
                      ].join('\n'),
                      filename: t('leads.lead', { name: l.name }),
                    })
                  }
                }}
              >{t('common.batchExportWord')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const l of rows as unknown as {
                    name: string
                    contactName?: string
                    phone?: string
                    status?: string
                    source?: string
                  }[]) {
                    exportPdf({
                      title: t('leads.leadProfile', { name: l.name }),
                      meta: { name: l.name, category: l.source ?? '' },
                      terms: [
                        t('leads.leadName', { name: l.name }),
                        t('leads.contact2', { v: l.contactName ?? '—' }),
                        t('common.phone', { v: l.phone ?? '—' }),
                        t('leads.status', { v: l.status ?? '—' }),
                        t('leads.source', { v: l.source ?? '—' }),
                      ].join('\n'),
                    })
                  }
                }}
              >{t('common.batchExportPdf')}</Button>
              <Button
                size="small"
                onClick={() => batchRecycleM.mutate({ ids, reason: t('leads.batchRecycle') })}
              >{t('leads.recycleToPool')}</Button>
              <Popconfirm
                title={t('leads.closeTheSelectedLeads', { length: ids.length })}
                onConfirm={() => {
                  batchCloseM.mutate({ ids, reason: t('leads.batchClose') })
                  clear()
                }}
              >
                <Button size="small" danger>{t('leads.batchClose')}</Button>
              </Popconfirm>
              <Button size="small" type="text" onClick={clear}>{t('common.clearSelection')}</Button>
            </Space>
          )}
          columns={[
            {
              title: t('common.leadName'),
              dataIndex: 'name',
              width: 160,
              filterType: 'text',
              sorter: true,
              render: (v, r) => (
                <Link to={`/leads/${String((r as unknown as Lead).id)}`}>{String(v)}</Link>
              ),
            },
            { title: t('nav.contacts'), dataIndex: 'contactName', width: 100, filterType: 'text', render: (v) => (v ? String(v) : '-') },
            { title: t('enum.activity.type.CALL'), dataIndex: 'phone', width: 120, filterType: 'text', render: (v) => (v ? String(v) : '-') },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 100,
              filterType: 'select',
              filterOptions: ['NEW', 'ACCEPTED', 'CULTIVATING', 'CONVERTED', 'CLOSED_LOST'].map((s) => ({
                value: s,
                label: s,
              })),
              render: (v) => (
                <Tag color={STATUS_COLOR[String(v)] ?? 'default'}>{t(`enum.lead.status.${String(v)}`)}</Tag>
              ),
            },
            {
              title: t('common.source'),
              dataIndex: 'source',
              width: 100,
              filterType: 'select',
              filterOptions: ['WEB_FORM', 'PHONE', 'REFERRAL', 'EXHIBITION', 'OTHER'].map((s) => ({
                value: s,
                label: s,
              })),
            },
            { title: t('common.score'), dataIndex: 'score', width: 70, filterType: 'number' },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 190,
              render: (_v, row) => {
                const r = row as unknown as Lead
                return (
                  <Space>
                    <Button
                      size="small"
                      disabled={r.status === 'CONVERTED'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setConvertId(r.id)
                      }}
                    >{t('common.convert')}</Button>
                    <Button
                      size="small"
                      danger
                      disabled={r.status === 'CONVERTED' || r.status === 'CLOSED_LOST'}
                      onClick={(e) => {
                        e.stopPropagation()
                        closeMut.mutate(r.id)
                      }}
                    >{t('common.close')}</Button>
                  </Space>
                )
              },
            },
          ]}
        />
        )}
      </ErpListShell>
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
          initialValues={{ source: 'OTHER', status: 'NEW' }}
          onFinish={(v) => createMut.mutate(v)}
        >
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contactName" label={t('nav.contacts')}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label={t('enum.activity.type.CALL')}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="source" label={t('common.source')} rules={[{ required: true }]}>
            <Select
              options={[
                'WEB_FORM',
                'PHONE',
                'REFERRAL',
                'EXHIBITION',
                'COLD_CALL',
                'ADS',
                'PARTNER',
                'OTHER',
              ].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('leads.importLeadsCsv')}
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={() => importMut.mutate()}
        confirmLoading={importMut.isPending}
        width={640}
      >
        <div style={{ color: '#646A73', marginBottom: 8 }}>{t('leads.headerExampleNameContactname')}</div>
        <Input.TextArea
          rows={10}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={t('leads.nameContactnamePhoneImported')}
        />
      </Modal>
      <LeadConvertModal
        leadId={convertId}
        open={!!convertId}
        onClose={() => setConvertId(null)}
        onDone={() => void qc.invalidateQueries({ queryKey: ['leads'] })}
      />
    </div>
  )
}
