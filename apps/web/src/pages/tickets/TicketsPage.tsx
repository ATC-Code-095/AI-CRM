import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Form, Input, Modal, Select, Tag } from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'

interface Ticket {
  id: string
  ticketNo: string
  title: string
  status: string
  severity: string
  type: string
  account?: { name: string }
}

const NEXT: Record<string, string[]> = {
  NEW: ['PROCESSING', 'CLOSED'],
  PROCESSING: ['WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'],
  WAITING_CUSTOMER: ['PROCESSING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'PROCESSING'],
  CLOSED: [],
}

export default function TicketsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [form] = Form.useForm()
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([])

  const listQ = useQuery({
    queryKey: ['tickets'],
    queryFn: () => api<{ items: Ticket[]; total: number }>('/tickets?pageSize=50'),
  })

  const slaQ = useQuery({
    queryKey: ['tickets-sla'],
    queryFn: () =>
      api<{ id: string; ticketNo: string; title: string; dueAt: string; severity: string }[]>(
        '/tickets/sla-alerts',
      ),
    retry: false,
  })

  const openCreate = async () => {
    const acc = await api<{ items: { id: string; name: string }[] }>('/accounts?pageSize=50')
    setAccounts(acc.items ?? [])
    setEditId(null)
    form.resetFields()
    setOpen(true)
  }

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      editId
        ? api(`/tickets/${editId}`, {
            method: 'PATCH',
            // 客户不可在编辑时变更
            body: JSON.stringify({ title: v.title, type: v.type, severity: v.severity }),
          })
        : api('/tickets', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const transM = useMutation({
    mutationFn: (p: { id: string; toStatus: string; resolution?: string }) =>
      api(`/tickets/${p.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ toStatus: p.toStatus, resolution: p.resolution }),
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['tickets'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      {(slaQ.data?.length ?? 0) > 0 && (
        <div
          style={{
            background: '#FFF7E6',
            border: '1px solid #FFD591',
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 12,
          }}
        >
          <b>{t('common.slaAlerts')}</b>：{(slaQ.data ?? [])
            .map((t) => `${t.ticketNo}(${t.severity})`)
            .join('，')}
        </div>
      )}
      <ErpListShell
        program="mttkt0001"
        title={t('nav.tickets')}
        subtitle={t('tickets.serviceTickets')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['tickets'] })}
        onCreate={() => void openCreate()}
        createLabel={t('common.create')}
      >
        <ErpTable
          rowKey="id"
          onRowClick={(row) => {
            const r = row as unknown as Record<string, unknown>
            const acc = r.account as { id?: string; name?: string } | undefined
            if (acc?.id) setAccounts([{ id: acc.id, name: acc.name ?? acc.id }])
            setEditId(String(r.id))
            form.setFieldsValue(r)
            setOpen(true)
          }}
          storageKey="tickets"
          loading={listQ.isLoading}
          dataSource={
            (listQ.data?.items ?? []).filter(
              (r) =>
                !q ||
                r.ticketNo.toLowerCase().includes(q.toLowerCase()) ||
                r.title.toLowerCase().includes(q.toLowerCase()),
            ) as unknown as Record<string, unknown>[]
          }
          pageSize={15}
          columns={[
            { title: t('common.no'), dataIndex: 'ticketNo', width: 130, filterType: 'text', sorter: true },
            { title: t('audit.field.title'), dataIndex: 'title', width: 200, filterType: 'text' },
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
              title: t('tickets.urgency'),
              dataIndex: 'severity',
              width: 90,
              filterType: 'select',
              filterOptions: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((s) => ({ value: s, label: s })),
              render: (v) => (
                <Tag color={String(v) === 'URGENT' ? 'red' : String(v) === 'HIGH' ? 'orange' : 'default'}>
                  {String(v)}
                </Tag>
              ),
            },
            {
              title: t('common.type'),
              dataIndex: 'type',
              width: 90,
              filterType: 'select',
              filterOptions: ['ISSUE', 'QUESTION', 'REQUEST', 'BUG'].map((s) => ({ value: s, label: s })),
            },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 100,
              filterType: 'select',
              filterOptions: ['NEW', 'PROCESSING', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'].map((s) => ({
                value: s,
                label: s,
              })),
              render: (v) => <Tag>{String(v)}</Tag>,
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 150,
              render: (_v, row) => {
                const r = row as unknown as Ticket
                return (
                  <Select
                    size="small"
                    style={{ width: 130 }}
                    placeholder={t('tickets.transition')}
                    options={(NEXT[r.status] ?? []).map((s) => ({ value: s, label: s }))}
                    onChange={(toStatus) => {
                      if (toStatus === 'RESOLVED') {
                        transM.mutate({ id: r.id, toStatus, resolution: t('common.processed') })
                      } else {
                        transM.mutate({ id: r.id, toStatus })
                      }
                    }}
                  />
                )
              },
            },
          ]}
        />
      </ErpListShell>
      <Modal
        title={editId ? t('common.edit') : t('common.create')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'ISSUE', severity: 'MEDIUM' }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="title" label={t('audit.field.title')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountId" label={t('nav.accounts')} rules={[{ required: true }]}>
            <Select
              disabled={!!editId}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Form.Item>
          <Form.Item name="type" label={t('common.type')}>
            <Select
              options={['ISSUE', 'QUESTION', 'REQUEST', 'BUG'].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
          <Form.Item name="severity" label={t('tickets.urgency')}>
            <Select
              options={['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
