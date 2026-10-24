import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Form, Input, Modal, Select, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'

interface Role {
  id: string
  code: string
  name: string
  isSystem: boolean
  permissionCodes: string[]
}

export default function OrgAdminPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [deptOpen, setDeptOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [permRole, setPermRole] = useState<Role | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [deptForm] = Form.useForm()
  const [roleForm] = Form.useForm()

  const depts = useQuery({
    queryKey: ['departments'],
    queryFn: () =>
      api<
        {
          id: string
          name: string
          parentId: string | null
          code: string | null
          path: string
        }[]
      >('/departments'),
  })

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<Role[]>('/roles'),
  })

  const perms = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api<{ code: string; name: string; module: string }[]>('/roles/permissions'),
  })

  const createDept = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/departments', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setDeptOpen(false)
      deptForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const createRole = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/roles', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      setRoleOpen(false)
      roleForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const savePerms = useMutation({
    mutationFn: () =>
      api(`/roles/${permRole!.id}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ permissionCodes: selected }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setPermRole(null)
      void qc.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtorg0001"
        title={t('org.organization')}
        subtitle={t('org.adminDepartmentsRoles')}
        onRefresh={() => window.location.reload()}
      >
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('org.organizationPermissions')}</Typography.Title>

      <Typography.Title level={5}>{t('org.department')}</Typography.Title>
      <Space style={{ marginBottom: 8 }}>
        <Button type="primary" size="small" onClick={() => setDeptOpen(true)}>{t('org.newDepartment')}</Button>
      </Space>
      <ErpTable
        rowKey="id"
        storageKey="org-depts"
        loading={depts.isLoading}
        onRowClick={(row) => {
          const d = row as { name?: string; code?: string }
          deptForm.setFieldsValue({ name: d.name, code: d.code })
          setDeptOpen(true)
        }}
        dataSource={(depts.data ?? []) as unknown as Record<string, unknown>[]}
        pageSize={12}
        columns={[
          { title: t('audit.field.name'), dataIndex: 'name', width: 160, filterType: 'text', sorter: true },
          { title: t('common.code'), dataIndex: 'code', width: 120, filterType: 'text' },
          { title: t('common.path'), dataIndex: 'path', width: 200, filterType: 'text' },
        ]}
      />

      <Typography.Title level={5} style={{ marginTop: 24 }}>{t('common.role')}</Typography.Title>
      <Space style={{ marginBottom: 8 }}>
        <Button type="primary" size="small" onClick={() => setRoleOpen(true)}>{t('org.newRole')}</Button>
      </Space>
      <ErpTable
        rowKey="id"
        storageKey="org-roles"
        loading={roles.isLoading}
        onRowClick={(row) => {
          const r = row as { name?: string; code?: string }
          roleForm.setFieldsValue({ name: r.name, code: r.code })
          setRoleOpen(true)
        }}
        dataSource={(roles.data ?? []) as unknown as Record<string, unknown>[]}
        pageSize={12}
        columns={[
          { title: t('common.code'), dataIndex: 'code', width: 120, filterType: 'text' },
          { title: t('audit.field.name'), dataIndex: 'name', width: 140, filterType: 'text', sorter: true },
          {
            title: t('org.system'),
            dataIndex: 'isSystem',
            width: 80,
            filterType: 'select',
            filterOptions: [
              { value: 'true', label: t('org.yes') },
              { value: 'false', label: t('org.no') },
            ],
            render: (v) => (v ? <Tag>{t('org.yes')}</Tag> : <Tag color="blue">{t('org.no')}</Tag>),
          },
          {
            title: t('org.permissions'),
            dataIndex: 'permissionCodes',
            width: 90,
            render: (_v, row) => ((row as unknown as Role).permissionCodes ?? []).length,
          },
          {
            title: t('common.actions'),
            dataIndex: '__op',
            width: 100,
            render: (_v, row) => {
              const r = row as unknown as Role
              return (
                <Button
                  size="small"
                  onClick={() => {
                    setPermRole(r)
                    setSelected(r.permissionCodes)
                  }}
                >{t('org.configurePermissions')}</Button>
              )
            },
          },
        ]}
      />

      <Modal
        title={t('org.newDepartment')}
        open={deptOpen}
        onCancel={() => setDeptOpen(false)}
        onOk={() => deptForm.submit()}
        confirmLoading={createDept.isPending}
      >
        <Form form={deptForm} layout="vertical" onFinish={(v) => createDept.mutate(v)}>
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label={t('common.code')}>
            <Input />
          </Form.Item>
          <Form.Item name="parentId" label={t('common.parent')}>
            <Select
              allowClear
              options={(depts.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('org.newRole')}
        open={roleOpen}
        onCancel={() => setRoleOpen(false)}
        onOk={() => roleForm.submit()}
        confirmLoading={createRole.isPending}
      >
        <Form form={roleForm} layout="vertical" onFinish={(v) => createRole.mutate(v)}>
          <Form.Item name="code" label={t('common.code')} rules={[{ required: true }]}>
            <Input placeholder="SALES_JUNIOR" />
          </Form.Item>
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('org.configurePermissions2', { v: permRole?.code ?? '' })}
        open={!!permRole}
        onCancel={() => setPermRole(null)}
        onOk={() => savePerms.mutate()}
        confirmLoading={savePerms.isPending}
        width={720}
      >
        <Select
          mode="multiple"
          style={{ width: '100%' }}
          value={selected}
          onChange={setSelected}
          optionFilterProp="value"
          options={(perms.data ?? []).map((p) => ({
            value: p.code,
            label: `${p.module} · ${p.code}`,
          }))}
        />
      </Modal>
      </ErpListShell>
    </div>
  )
}
