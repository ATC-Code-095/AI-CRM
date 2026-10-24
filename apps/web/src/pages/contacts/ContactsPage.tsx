import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Select, Space, Tag, Tooltip } from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { DownloadOutlined, StarFilled } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, getAccessToken, apiUrl } from '../../api/client'
import { exportPdf, exportWord } from '../../utils/docExport'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { MobileCardList } from '../../components/MobileCardList'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useQuickCreate } from '../../utils/quickCreate'
import { t } from '../../i18n'

interface Contact {
  id: string
  name: string
  title: string | null
  mobile: string | null
  phone: string | null
  email: string | null
  wechat: string | null
  isPrimary: boolean
  decisionRole: string | null
  accountId: string
  account?: { id: string; name: string; level?: string }
}

const ROLE_LABEL: Record<string, string> = {
  ECONOMIC: t('contacts.role.economic'),
  USER: t('common.user'),
  TECH: t('common.technicalEvaluator'),
  CHAMPION: t('contacts.role.champion'),
  OTHER: t('common.other'),
}

const ROLE_COLOR: Record<string, string> = {
  ECONOMIC: 'red',
  CHAMPION: 'gold',
  TECH: 'blue',
  USER: 'cyan',
  OTHER: 'default',
}

/**
 * 联系人中心（M03 客户与联系人）
 * 对标 Salesforce Contacts / 纷享销客「联系人」：
 * 支持按客户过滤、角色标识、主联系人、导出 CSV 与 vCard 名片下载。
 */
export default function ContactsPage() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [q, setQ] = useUrlState('q')
  const [accountId, setAccountId] = useState<string | undefined>()
  const [role, setRole] = useState<string | undefined>()
  const [density, setDensity] = useState<'small' | 'middle'>('small')

  useQuickCreate('contact', () => setOpen(true))

  const accountsQ = useQuery({
    queryKey: ['accounts-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=100'),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', accountId],
    queryFn: () =>
      api<{ items: Contact[]; total: number }>(
        `/contacts?pageSize=50${accountId ? `&accountId=${accountId}` : ''}`,
      ),
  })

  const createMut = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api('/accounts/' + String(values.accountId) + '/contacts', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          title: values.title,
          mobile: values.mobile,
          email: values.email,
          decisionRole: values.decisionRole,
          isPrimary: values.isPrimary,
        }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['contacts'] })
      void qc.invalidateQueries({ queryKey: ['accounts-mini'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const batchM = useMutation({
    mutationFn: (p: { ids: string[]; action: 'setPrimary' | 'delete' }) =>
      api<{ ok: number }>('/contacts/batch', { method: 'POST', body: JSON.stringify(p) }),
    onSuccess: (r, v) => {
      message.success(
        v.action === 'delete' ? t('contacts.deletedContacts', { ok: r.ok }) : t('contacts.setPrimaryContacts', { ok: r.ok }),
      )
      void qc.invalidateQueries({ queryKey: ['contacts'] })
      void qc.invalidateQueries({ queryKey: ['accounts-mini'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const rows = useMemo(() => {
    return (data?.items ?? []).filter((c) => {
      if (role && (c.decisionRole ?? 'OTHER') !== role) return false
      if (!q) return true
      const kw = q.toLowerCase()
      return [c.name, c.mobile, c.phone, c.email, c.title, c.account?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw))
    })
  }, [data, q, role])

  const exportCsv = () => {
    const token = getAccessToken()
    const url = apiUrl(`/api/v1/contacts?export=csv${accountId ? `&accountId=${accountId}` : ''}`)
    void fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.text())
      .then((text) => {
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `contacts_${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch((e: Error) => message.error(e.message))
  }

  return (
    <div>
      <ErpListShell
        program="mtcon0001"
        title={t('nav.contacts')}
        subtitle={t('contacts.customerMasterDataContacts')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['contacts'] })}
        onCreate={() => setOpen(true)}
        createLabel={t('common.create')}
        onExport={exportCsv}
        extraActions={
          <Space size={6} wrap>
            <Select
              size="small"
              allowClear
              placeholder={t('contacts.filterByAccount')}
              style={{ width: 180 }}
              value={accountId}
              onChange={setAccountId}
              showSearch
              optionFilterProp="label"
              options={(accountsQ.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))}
            />
            <Select
              size="small"
              allowClear
              placeholder={t('common.decisionRole')}
              style={{ width: 130 }}
              value={role}
              onChange={setRole}
              options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))}
            />
            <Button size="small" icon={<DownloadOutlined />} onClick={exportCsv}>{t('common.exportCsv')}</Button>
          </Space>
        }
      >
        {isMobile ? (
          <MobileCardList
            loading={isLoading}
            items={rows.map((c) => ({
              id: c.id,
              title: (
                <Space size={6}>
                  {c.isPrimary && <Tag color="gold">{t('common.primary')}</Tag>}
                  {c.name}
                </Space>
              ),
              to: `/accounts/${c.accountId}`,
              tags: (
                <Tag color={ROLE_COLOR[c.decisionRole ?? 'OTHER'] ?? 'default'}>
                  {ROLE_LABEL[c.decisionRole ?? 'OTHER'] ?? t('common.other')}
                </Tag>
              ),
              subtitle: c.account?.name ?? '-',
              fields: [
                { label: t('common.jobTitle'), value: c.title ?? '-' },
                { label: t('common.mobile'), value: c.mobile ?? '-' },
                { label: t('common.email'), value: c.email ?? '-' },
                { label: t('contacts.wechat'), value: c.wechat ?? '-' },
              ],
              actions: (
                <a href={apiUrl(`/api/v1/contacts/${c.id}/vcard`)} target="_blank" rel="noreferrer">{t('contacts.downloadVcard')}</a>
              ),
            }))}
          />
        ) : (
        <ErpTable
          rowKey="id"
          storageKey="contacts"
          loading={isLoading}
          dataSource={rows as unknown as Record<string, unknown>[]}
          pageSize={15}
          onRowClick={(row) => nav(`/accounts/${String(row.accountId)}`)}
          batchBar={(ids, selectedRows, clear) => (
            <Space wrap size={8}>
              <span className="crm-muted">{t('contacts.selected', { length: ids.length })}</span>
              <Button
                size="small"
                onClick={() => {
                  batchM.mutate({ ids, action: 'setPrimary' })
                  clear()
                }}
              >{t('contacts.setAsPrimary')}</Button>
              <Button
                size="small"
                onClick={() => {
                  const header = ['name', 'title', 'account', 'mobile', 'email']
                  const csv = [
                    header.join(','),
                    ...(selectedRows as unknown as Contact[]).map((c) =>
                      [c.name, c.title, c.account?.name, c.mobile, c.email]
                        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                        .join(','),
                    ),
                  ].join('\n')
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `contacts-selected_${Date.now()}.csv`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >{t('common.exportSelected')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const c of selectedRows as unknown as {
                    name: string
                    title?: string
                    mobile?: string
                    email?: string
                  }[]) {
                    exportWord({
                      title: t('contacts.contactProfile', { name: c.name }),
                      meta: { name: c.name, category: c.title ?? '' },
                      terms: [
                        t('contacts.name', { name: c.name }),
                        t('contacts.title2', { v: c.title ?? '—' }),
                        t('contacts.mobile', { v: c.mobile ?? '—' }),
                        t('common.email2', { v: c.email ?? '—' }),
                      ].join('\n'),
                      filename: t('contacts.contact', { name: c.name }),
                    })
                  }
                }}
              >{t('common.batchExportWord')}</Button>
              <Button
                size="small"
                onClick={() => {
                  for (const c of selectedRows as unknown as {
                    name: string
                    title?: string
                    mobile?: string
                    email?: string
                  }[]) {
                    exportPdf({
                      title: t('contacts.contactProfile', { name: c.name }),
                      meta: { name: c.name, category: c.title ?? '' },
                      terms: [
                        t('contacts.name', { name: c.name }),
                        t('contacts.title2', { v: c.title ?? '—' }),
                        t('contacts.mobile', { v: c.mobile ?? '—' }),
                        t('common.email2', { v: c.email ?? '—' }),
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
                    title: t('contacts.batchDeleteContacts'),
                    content: t('contacts.deleteTheSelectedContacts', { length: ids.length }),
                    okText: t('common.delete'),
                    okButtonProps: { danger: true },
                    cancelText: t('common.cancel'),
                    onOk: () => {
                      batchM.mutate({ ids, action: 'delete' })
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
              title: t('common.name'),
              dataIndex: 'name',
              width: 150,
              filterType: 'text',
              sorter: true,
              render: (v: unknown, r: Record<string, unknown>) => (
                <Space size={6}>
                  {Boolean(r.isPrimary) && (
                    <Tooltip title={t('contacts.primary')}>
                      <StarFilled style={{ color: 'var(--crm-warn)' }} />
                    </Tooltip>
                  )}
                  <Link to={`/accounts/${String(r.accountId)}`}>{String(v)}</Link>
                </Space>
              ),
            },
            {
              title: t('nav.accounts'),
              dataIndex: 'account',
              width: 180,
              filterType: 'text',
              render: (v: unknown) => {
                const acc = v as { id?: string; name?: string } | undefined
                if (!acc?.name) return '-'
                return <Link to={`/accounts/${String(acc.id)}`}>{acc.name}</Link>
              },
            },
            {
              title: t('common.jobTitle'),
              dataIndex: 'title',
              width: 130,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v) : '-'),
            },
            {
              title: t('common.decisionRole'),
              dataIndex: 'decisionRole',
              width: 110,
              filterType: 'select',
              filterOptions: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })),
              render: (v: unknown) => {
                const key = String(v ?? 'OTHER')
                return <Tag color={ROLE_COLOR[key] ?? 'default'}>{ROLE_LABEL[key] ?? key}</Tag>
              },
            },
            {
              title: t('common.mobile'),
              dataIndex: 'mobile',
              width: 130,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v) : '-'),
            },
            {
              title: t('common.email'),
              dataIndex: 'email',
              width: 190,
              filterType: 'text',
              render: (v: unknown) => (v ? <a href={`mailto:${String(v)}`}>{String(v)}</a> : '-'),
            },
            {
              title: t('contacts.wechat'),
              dataIndex: 'wechat',
              width: 120,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v) : '-'),
            },
            {
              title: t('contacts.businessCard'),
              dataIndex: 'id',
              width: 104,
              render: (_: unknown, r: Record<string, unknown>) => (
                <a href={apiUrl(`/api/v1/contacts/${String(r.id)}/vcard`)} target="_blank" rel="noreferrer">
                  vCard
                </a>
              ),
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
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate(v)}>
          <Form.Item name="accountId" label={t('common.account')} rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('common.selectAccount')}
              options={(accountsQ.data?.items ?? []).map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label={t('common.jobTitle')}>
            <Input placeholder={t('contacts.eGPurchasingDirector')} />
          </Form.Item>
          <Form.Item name="decisionRole" label={t('common.decisionRole')}>
            <Select
              allowClear
              options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item name="mobile" label={t('common.mobile')}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('common.email')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
