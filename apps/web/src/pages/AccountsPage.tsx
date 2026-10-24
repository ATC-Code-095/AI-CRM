import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Select, Space, Tag } from 'antd'
import { useUrlState } from '../hooks/useUrlState'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api/client'
import { exportPdf, exportWord } from '../utils/docExport'
import { useQuickCreate } from '../utils/quickCreate'
import { ErpListShell } from '../components/ErpListShell'
import { EntityFilterSelect } from '../components/EntityFilterSelect'
import { useEntityScope } from '../hooks/useEntityScope'
import { ErpTable } from '../components/ErpTable'
import { MobileCardList } from '../components/MobileCardList'
import { useIsMobile } from '../hooks/useIsMobile'

interface Account {
  id: string
  name: string
  industry: string | null
  level: string
  stage: string
  phone: string | null
  contacts?: { id: string; name: string; mobile: string | null }[]
}

export default function AccountsPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  useQuickCreate('account', () => setOpen(true))
  const [form] = Form.useForm()
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')

  const { data, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<{ items: Account[]; total: number }>('/accounts?pageSize=50'),
  })
  const ent = useEntityScope()
  const [entFilter, setEntFilter] = useState<string | null>(null)
  const parentOptions = (data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))
  /** 关键词 + 法人主体过滤后的客户（移动卡片与桌面网格共用） */
  const rows = ent.filterByEntity(
    (data?.items ?? []).filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase())),
    entFilter,
  )

  const usersQ = useQuery({
    queryKey: ['users-mini'],
    queryFn: () => api<{ items: { id: string; name: string; email?: string }[] }>('/users/options'),
    retry: false,
  })

  const batchAssignM = useMutation({
    mutationFn: (p: { ids: string[]; ownerId: string }) =>
      api<{ ok: number; failed: number }>('/accounts/batch-assign', {
        method: 'POST',
        body: JSON.stringify(p),
      }),
    onSuccess: (r) => {
      message.success(t('accounts.assignedAccounts', { ok: r.ok, v: r.failed ? t('accounts.skipped', { failed: r.failed }) : '' }))
      void qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const batchDeleteM = useMutation({
    mutationFn: (ids: string[]) =>
      api<{ ok: number; failed: number }>('/accounts/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: (r) => {
      message.success(
        t('accounts.deletedAccounts', { ok: r.ok, v: r.failed ? t('accounts.skippedDueToOpen', { failed: r.failed }) : '' }),
      )
      void qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const createMut = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api('/accounts', { method: 'POST', body: JSON.stringify(values) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtacc0001"
        title={t('nav.accounts')}
        subtitle={t('accounts.masterDataAccounts')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['accounts'] })}
        extraActions={
          <>
            <EntityFilterSelect value={entFilter} onChange={setEntFilter} />
            <Button size="small" onClick={() => nav('/pool')}>{t('accounts.dedupeMerge')}</Button>
          </>
        }
        onCreate={() => setOpen(true)}
        createLabel={t('common.create')}
      >
        {isMobile ? (
          <MobileCardList
            loading={isLoading}
            items={rows.map((a) => ({
              id: a.id,
              title: a.name,
              to: `/accounts/${a.id}`,
              swipeActions: [
                {
                  key: 'call',
                  label: t('enum.activity.type.CALL'),
                  color: '#0d9488',
                  onClick: () => {
                    if (a.phone) window.open(`tel:${a.phone}`)
                    else message.info(t('accounts.noPhone'))
                  },
                },
                {
                  key: 'assign',
                  label: t('accounts.assignToMe'),
                  color: '#2b5fd9',
                  onClick: () => {
                    const me = JSON.parse(localStorage.getItem('me_cache') || '{}') as { id?: string }
                    if (!me.id) return
                    batchAssignM.mutate({ ids: [a.id], ownerId: me.id })
                  },
                },
              ],
              tags: <Tag color={a.level === 'A' ? 'gold' : 'default'}>{a.level}</Tag>,
              subtitle: a.industry ?? t('accounts.noIndustry'),
              fields: [
                { label: t('audit.field.stage'), value: a.stage },
                { label: t('enum.activity.type.CALL'), value: a.phone ?? '-' },
                { label: t('contacts.primary'), value: a.contacts?.[0]?.name ?? '-' },
              ],
            }))}
          />
        ) : (
        <ErpTable
          rowKey="id"
          storageKey="accounts"
          loading={isLoading}
          dataSource={rows as unknown as Record<string, unknown>[]}
          pageSize={15}
          onRowClick={(row) => nav(`/accounts/${String(row.id)}`)}
          batchBar={(ids, selectedRows, clear) => (
            <Space wrap size={8}>
              <span className="crm-muted">{t('accounts.selected', { length: ids.length })}</span>
              <Space size={4}>
                <span className="crm-muted">{t('accounts.assignOwner')}</span>
                <Select
                  size="small"
                  style={{ width: 150 }}
                  placeholder={t('accounts.selectOwner')}
                  showSearch
                  optionFilterProp="label"
                  options={(usersQ.data?.items ?? []).map((u) => ({
                    value: u.id,
                    label: u.name || u.email || u.id,
                  }))}
                  onChange={(ownerId: string) => {
                    batchAssignM.mutate({ ids, ownerId })
                    clear()
                  }}
                />
              </Space>
              <Button
                size="small"
                onClick={() => {
                  const header = ['name', 'industry', 'level', 'stage', 'phone']
                  const csv = [
                    header.join(','),
                    ...(selectedRows as unknown as Account[]).map((a) =>
                      [a.name, a.industry, a.level, a.stage, a.phone]
                        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                        .join(','),
                    ),
                  ].join('\n')
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `accounts-selected_${Date.now()}.csv`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >{t('common.exportSelected')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const a of selectedRows as unknown as {
                    name: string
                    industry?: string
                    level?: string
                    stage?: string
                    phone?: string
                    address?: string
                  }[]) {
                    exportWord({
                      title: t('accounts.accountProfile', { name: a.name }),
                      meta: { name: a.name, category: a.industry ?? '' },
                      terms: [
                        t('accounts.accountName', { name: a.name }),
                        t('accounts.industry', { v: a.industry ?? '—' }),
                        t('accounts.level', { v: a.level ?? '—' }),
                        t('common.stage', { v: a.stage ?? '—' }),
                        t('common.phone', { v: a.phone ?? '—' }),
                        t('accounts.address', { v: a.address ?? '—' }),
                      ].join('\n'),
                      filename: t('accounts.account', { name: a.name }),
                    })
                  }
                }}
              >{t('common.batchExportWord')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const a of selectedRows as unknown as {
                    name: string
                    industry?: string
                    level?: string
                    stage?: string
                    phone?: string
                    address?: string
                  }[]) {
                    exportPdf({
                      title: t('accounts.accountProfile', { name: a.name }),
                      meta: { name: a.name, category: a.industry ?? '' },
                      terms: [
                        t('accounts.accountName', { name: a.name }),
                        t('accounts.industry', { v: a.industry ?? '—' }),
                        t('accounts.level', { v: a.level ?? '—' }),
                        t('common.stage', { v: a.stage ?? '—' }),
                        t('common.phone', { v: a.phone ?? '—' }),
                        t('accounts.address', { v: a.address ?? '—' }),
                      ].join('\n'),
                    })
                  }
                }}
              >{t('common.batchExportPdf')}</Button>
              <Button
                size="small"
                danger
                onClick={() => {
                  modal.confirm({
                    title: t('accounts.batchDeleteAccounts'),
                    content: t('accounts.deleteTheSelectedAccounts', { length: ids.length }),
                    okText: t('common.delete'),
                    okButtonProps: { danger: true },
                    cancelText: t('common.cancel'),
                    onOk: () => {
                      batchDeleteM.mutate(ids)
                      clear()
                    },
                  })
                }}
              >{t('common.batchDelete')}</Button>
              <Button size="small" type="text" onClick={clear}>{t('common.clearSelection')}</Button>
            </Space>
          )}
          columns={[
            {
              title: t('common.accountName'),
              dataIndex: 'name',
              width: 180,
              filterType: 'text',
              sorter: true,
              render: (v: unknown, r: Record<string, unknown>) => (
                <Link to={`/accounts/${String(r.id)}`}>{String(v)}</Link>
              ),
            },
            {
              title: t('common.industry'),
              dataIndex: 'industry',
              width: 110,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v) : '-'),
            },
            {
              title: t('common.level'),
              dataIndex: 'level',
              width: 80,
              filterType: 'select',
              filterOptions: ['A', 'B', 'C', 'D'].map((x) => ({ value: x, label: x })),
              render: (v: unknown) => <Tag color={v === 'A' ? 'gold' : 'default'}>{String(v ?? '-')}</Tag>,
            },
            {
              title: t('audit.field.stage'),
              dataIndex: 'stage',
              width: 100,
              filterType: 'select',
              filterOptions: [
                { value: 'POTENTIAL', label: t('common.prospect') },
                { value: 'ACTIVE', label: t('common.active') },
                { value: 'AT_RISK', label: t('common.atRisk2') },
                { value: 'CHURNED', label: t('common.churned') },
              ],
            },
            {
              title: t('enum.activity.type.CALL'),
              dataIndex: 'phone',
              width: 130,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v) : '-'),
            },
            {
              title: t('contacts.primary'),
              dataIndex: 'contacts',
              width: 110,
              filterType: 'text',
              render: (v: unknown) => {
                const list = (v as { name?: string }[]) ?? []
                return list[0]?.name ?? '-'
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
          initialValues={{ level: 'C' }}
          onFinish={(v) => createMut.mutate(v)}
        >
          <Form.Item name="name" label={t('common.accountName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="industry" label={t('common.industry')}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label={t('enum.activity.type.CALL')}>
            <Input />
          </Form.Item>
          <Form.Item name="website" label={t('accounts.website')}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label={t('common.address')}>
            <Input />
          </Form.Item>
          <Form.Item name="parentAccountId" label={t('accounts.parentAccount')}>
            <Select
              allowClear
              placeholder={t('accounts.groupSubsidiaryHierarchy')}
              options={parentOptions}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
