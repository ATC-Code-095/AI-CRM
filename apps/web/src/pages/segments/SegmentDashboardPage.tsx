import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Col, Form, Input, Modal, Row, Select, Space, Statistic, Switch, Table, Tag, Typography } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { t } from '../../i18n'

type Seg = {
  id: string
  name: string
  stage?: string
  industry?: string
  level?: string
  tag?: string
  minAmount?: string
  note?: string
  autoOutreach?: boolean
}

type Members = { total: number; items: { id: string; name: string; stage: string; level: string; industry: string }[] }

/** 客户分群自动化看板 */
export default function SegmentDashboardPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm()
  const [viewId, setViewId] = useState<string | null>(null)

  const segsQ = useQuery({
    queryKey: ['segments'],
    queryFn: () => api<{ items: Seg[]; total: number }>('/segments'),
    retry: false,
  })

  const membersQ = useQuery({
    queryKey: ['segment-members', viewId],
    enabled: !!viewId,
    queryFn: () => api<Members>(`/segments/${viewId}/members`),
    retry: false,
  })

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api('/segments', { method: 'POST', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('segments.segmentCreated'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['segments'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const autoM = useMutation({
    mutationFn: (p: { id: string; autoOutreach: boolean }) =>
      api(`/segments/${p.id}`, { method: 'PUT', body: JSON.stringify({ autoOutreach: p.autoOutreach }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['segments'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const segs = segsQ.data?.items ?? []
  const activeAuto = segs.filter((s) => s.autoOutreach).length

  return (
    <ErpListShell
      program="mtseg0001"
      title={t('common.segmentDashboard')}
      subtitle={t('segments.customerSuccessSegmentsAutomation')}
      density="small"
      onRefresh={() => void qc.invalidateQueries({ queryKey: ['segments'] })}
      onCreate={() => setOpen(true)}
      createLabel={t('common.newSegment')}
      extraActions={
        <Link to="/enablement">
          <Button size="small">{t('segments.operationsWorkbench')}</Button>
        </Link>
      }
    >
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic title={t('segments.totalSegments')} value={segs.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title={t('segments.autoOutreachActive')} value={activeAuto} valueStyle={{ color: '#16a34a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title={t('segments.membersToReview')} value={membersQ.data?.total ?? '—'} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title={t('segments.automationStatus')} value={t('segments.daily0800')} valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
      </Row>

      <Table
        rowKey="id"
        size="small"
        loading={segsQ.isLoading}
        dataSource={segs}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: t('common.segment'),
            dataIndex: 'name',
            render: (v: string, r: Seg) => (
              <Space>
                <a onClick={() => setViewId(r.id)}>{v}</a>
                {r.autoOutreach ? <Tag color="green">{t('common.autoOutreach')}</Tag> : null}
              </Space>
            ),
          },
          {
            title: t('common.conditions'),
            render: (_: unknown, r: Seg) => (
              <Space size={4} wrap>
                {r.stage ? <Tag>{r.stage}</Tag> : null}
                {r.level ? <Tag color="blue">{r.level}</Tag> : null}
                {r.industry ? <Tag color="geekblue">{r.industry}</Tag> : null}
                {r.tag ? <Tag color="purple">#{r.tag}</Tag> : null}
                {r.minAmount ? <Tag color="gold">≥{r.minAmount}</Tag> : null}
                {!r.stage && !r.level && !r.industry && !r.tag && !r.minAmount ? (
                  <Typography.Text type="secondary">—</Typography.Text>
                ) : null}
              </Space>
            ),
          },
          { title: t('common.notes'), dataIndex: 'note', ellipsis: true },
          {
            title: t('common.autoOutreach'),
            width: 100,
            render: (_: unknown, r: Seg) => (
              <Switch
                size="small"
                checked={!!r.autoOutreach}
                onChange={(c) => autoM.mutate({ id: r.id, autoOutreach: c })}
              />
            ),
          },
          {
            title: t('common.actions'),
            width: 120,
            render: (_: unknown, r: Seg) => (
              <Button size="small" onClick={() => setViewId(r.id)}>{t('segments.viewMembers')}</Button>
            ),
          },
        ]}
      />

      <Modal
        title={t('common.newCustomerSegment')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createM.isPending}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={(v) => createM.mutate(v)}>
          <Form.Item name="name" label={t('common.segmentName')} rules={[{ required: true }]}>
            <Input placeholder={t('segments.eGHighValue')} />
          </Form.Item>
          <Form.Item name="level" label={t('segments.accountLevel')}>
            <Select
              allowClear
              options={['A', 'B', 'C', 'D'].map((x) => ({ value: x, label: x }))}
              placeholder={t('segments.filterByLevel')}
            />
          </Form.Item>
          <Form.Item name="stage" label={t('common.accountStage')}>
            <Select
              allowClear
              options={[
                { value: 'POTENTIAL', label: t('common.prospect') },
                { value: 'ACTIVE', label: t('common.active') },
                { value: 'AT_RISK', label: t('common.atRisk2') },
                { value: 'CHURNED', label: t('common.churned') },
              ]}
            />
          </Form.Item>
          <Form.Item name="tag" label={t('common.tags')}>
            <Input placeholder={t('segments.filterByTagE')} />
          </Form.Item>
          <Form.Item name="note" label={t('common.notes')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('segments.segmentMembers')}
        open={!!viewId}
        onCancel={() => setViewId(null)}
        footer={null}
        width={640}
      >
        <Table
          rowKey="id"
          size="small"
          loading={membersQ.isLoading}
          dataSource={membersQ.data?.items ?? []}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: t('nav.accounts'),
              dataIndex: 'name',
              render: (v: string, r: { id: string }) => <Link to={`/accounts/${r.id}`}>{v}</Link>,
            },
            { title: t('audit.field.stage'), dataIndex: 'stage', width: 90 },
            { title: t('audit.field.level'), dataIndex: 'level', width: 70 },
            { title: t('common.industry'), dataIndex: 'industry', width: 100 },
          ]}
        />
      </Modal>
    </ErpListShell>
  )
}
