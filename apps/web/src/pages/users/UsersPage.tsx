import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Tag,
} from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'

interface UserRow {
  id: string
  email: string
  name: string
  status: string
  dataScope: string
  roles?: { code: string; name: string }[]
}

export default function UsersPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [resetUser, setResetUser] = useState<UserRow | null>(null)
  const [resetForm] = Form.useForm<{ newPassword: string }>()
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ items: UserRow[]; total: number }>('/users?pageSize=50'),
  })

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      editId
        ? api(`/users/${editId}`, { method: 'PATCH', body: JSON.stringify(v) })
        : api('/users', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      setFlashId(editId)
      setTimeout(() => setFlashId(null), 1500)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const assignRoles = useMutation({
    mutationFn: (p: { id: string; roleCodes: string[] }) =>
      api(`/users/${p.id}/roles`, {
        method: 'POST',
        body: JSON.stringify({ roleCodes: p.roleCodes }),
      }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const resetPwd = useMutation({
    mutationFn: (p: { id: string; newPassword: string }) =>
      api(`/users/${p.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: p.newPassword }) }),
    onSuccess: () => {
      message.success(t('users.passwordResetShareIt'))
      setResetUser(null)
      resetForm.resetFields()
    },
    onError: (e: Error) => message.error(e.message),
  })

  const rolesQ = useQuery({
    queryKey: ['roles-mini'],
    queryFn: () => api<{ id: string; code: string; name: string }[]>('/roles'),
    retry: false,
  })

  return (
    <div>
      <ErpListShell
        program="mtusr0001"
        title={t('nav.users')}
        subtitle={t('users.adminUsersRoles')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['users'] })}
        onCreate={() => {
          setEditId(null)
          form.resetFields()
          setOpen(true)
        }}
        createLabel={t('common.create')}
      >
        <ErpTable
          rowKey="id"
          storageKey="users"
          flashId={flashId}
          loading={listQ.isLoading}
          onRowClick={(row) => {
            const u = row as unknown as {
              id: string
              name: string
              email: string
              dataScope?: string
              status?: string
            }
            setEditId(u.id)
            form.setFieldsValue({
              name: u.name,
              email: u.email,
              dataScope: u.dataScope,
              status: u.status,
            })
            setOpen(true)
          }}
          dataSource={
            (listQ.data?.items ?? []).filter(
              (u) =>
                !q ||
                u.name.toLowerCase().includes(q.toLowerCase()) ||
                u.email.toLowerCase().includes(q.toLowerCase()),
            ) as unknown as Record<string, unknown>[]
          }
          pageSize={15}
          columns={[
            { title: t('common.name'), dataIndex: 'name', width: 120, filterType: 'text', sorter: true },
            { title: t('common.email'), dataIndex: 'email', width: 200, filterType: 'text' },
            {
              title: t('audit.field.status'),
              dataIndex: 'status',
              width: 90,
              filterType: 'select',
              filterOptions: [
                { value: 'ACTIVE', label: 'ACTIVE' },
                { value: 'DISABLED', label: 'DISABLED' },
              ],
              render: (v) => (
                <Tag color={String(v) === 'ACTIVE' ? 'green' : 'default'}>{String(v)}</Tag>
              ),
            },
            { title: t('users.dataScope'), dataIndex: 'dataScope', width: 100, filterType: 'select', filterOptions: [
              { value: 'SELF', label: 'SELF' },
              { value: 'DEPARTMENT', label: 'DEPARTMENT' },
              { value: 'ALL', label: 'ALL' },
            ] },
            {
              title: t('common.role'),
              dataIndex: 'roles',
              width: 140,
              render: (v) => {
                const roles = (v as { code?: string }[]) ?? []
                return roles.map((x) => x.code).join(',')
              },
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 200,
              render: (_v, row) => {
                const r = row as unknown as UserRow
                return (
                  <span style={{ display: 'inline-flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <Select
                      mode="multiple"
                      size="small"
                      style={{ minWidth: 160 }}
                      placeholder={t('users.changeRole')}
                      defaultValue={(r.roles ?? []).map((x) => x.code)}
                      options={(rolesQ.data ?? []).map((role) => ({
                        value: role.code,
                        label: role.code,
                      }))}
                      onChange={(codes) => assignRoles.mutate({ id: r.id, roleCodes: codes as string[] })}
                    />
                    <Button size="small" onClick={() => setResetUser(r)}>{t('users.resetPassword')}</Button>
                  </span>
                )
              },
            },
          ]}
        />
      </ErpListShell>
      <Modal
        title={editId ? t('users.editUser') : t('common.create')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ dataScope: 'SELF' }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="name" label={t('common.name')} rules={[{ required: true, message: t('users.pleaseFillInThe') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label={t('common.email')} rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('users.initialPassword')}
            rules={[{ required: true, min: 8 }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="phone" label={t('enum.activity.type.CALL')}>
            <Input />
          </Form.Item>
          <Form.Item name="dataScope" label={t('users.dataScope')}>
            <Select
              options={['SELF', 'TEAM', 'DEPARTMENT', 'ALL', 'CUSTOM'].map((s) => ({
                value: s,
                label: s,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('users.resetPasswordTitle', { v: resetUser?.name ?? '' })}
        open={!!resetUser}
        onCancel={() => {
          setResetUser(null)
          resetForm.resetFields()
        }}
        onOk={() => resetForm.submit()}
        confirmLoading={resetPwd.isPending}
        destroyOnClose
      >
        <Form
          form={resetForm}
          layout="vertical"
          onFinish={(v) => resetUser && resetPwd.mutate({ id: resetUser.id, newPassword: v.newPassword })}
        >
          <Form.Item
            name="newPassword"
            label={t('settings.newPassword')}
            extra={t('users.resetPasswordHint')}
            rules={[{ required: true, min: 8, message: t('users.minLength8') }]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
