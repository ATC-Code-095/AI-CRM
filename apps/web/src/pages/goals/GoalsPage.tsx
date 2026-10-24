import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Statistic, Tag } from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { AutoFitTable } from '../../components/AutoFitTable'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { tLabel } from '../../i18n'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { GoalCascade } from '../../components/GoalCascade'
import { GaugeRing, WaterfallChart } from '../../components/SimpleCharts'

interface GoalRow {
  id: string
  metric: string
  periodKey: string
  targetAmount: string
  userId?: string
}

export default function GoalsPage() {
  const { t } = useTranslation()
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [q, setQ] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [form] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['goals'],
    queryFn: () => api<GoalRow[]>('/goals'),
    retry: false,
  })

  const waterfall = useQuery({
    queryKey: ['quota-waterfall'],
    queryFn: () =>
      api<{
        periodKey: string
        target: string
        wonAmount: string
        weightedPipeline: string
        received: string
        gap: string
        coverage: string
        items: { label: string; value: number; type: 'total' | 'positive' | 'negative' | 'info' }[]
        byOwner?: {
          userId: string
          name: string
          target: string
          wonAmount: string
          weightedPipeline: string
          gap: string
          coverage: string
        }[]
      }>('/reports/quota-waterfall'),
    retry: false,
  })

  const attainment = useQuery({
    queryKey: ['goal-attainment'],
    queryFn: () =>
      api<{ metric: string; targetAmount: string; actualAmount: string; rate: string }[]>(
        '/reports/goal-attainment',
      ),
    retry: false,
  })

  // 同一指标不同周期会有重复行，构造稳定唯一 key（不再依赖 rowKey(index)）
  const attainmentRows = (attainment.data ?? []).map((r, i) => ({
    ...r,
    __key: `${r.metric}-${i}`,
  }))

  const createM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      editId
        ? api(`/goals/${editId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              metric: v.metric,
              periodKey: v.periodKey,
              targetAmount: String(v.targetAmount ?? 0),
            }),
          })
        : api('/goals', {
        method: 'POST',
        body: JSON.stringify({
          metric: v.metric,
          periodKey: v.periodKey,
          targetAmount: String(v.targetAmount ?? 0),
        }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['goals'] })
      void qc.invalidateQueries({ queryKey: ['goal-attainment'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const removeM = useMutation({
    mutationFn: (id: string) => api(`/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('OK')
      void qc.invalidateQueries({ queryKey: ['goals'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <div className="crm-grid crm-cols-3 crm-h-lg">
        <div>
          <Card size="small" title={t('goals.salesQuotaWaterfall', { v: waterfall.data?.periodKey ?? '' })}>
            <WaterfallChart items={(waterfall.data?.items ?? []).map((it) => ({ ...it, label: tLabel(it.label) }))} />
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--crm-muted)' }}>{t('goals.coverage')}{' '}<b>{waterfall.data?.coverage ?? 0}%</b>{t('goals.wonWeightedPipelineGoal')}</div>
          </Card>
        </div>
        <div>
          <Card size="small" title={t('goals.goalAttainmentThisMonth')}>
            <Space size="large" wrap>
              <Statistic title={t('nav.goals')} value={waterfall.data?.target ?? '0'} />
              <Statistic
                title={t('goals.won')}
                value={waterfall.data?.wonAmount ?? '0'}
                valueStyle={{ color: 'var(--crm-success)' }}
              />
              <Statistic
                title={t('goals.weightedPipeline')}
                value={waterfall.data?.weightedPipeline ?? '0'}
                valueStyle={{ color: 'var(--crm-accent)' }}
              />
              <Statistic
                title={t('goals.gap')}
                value={waterfall.data?.gap ?? '0'}
                valueStyle={{ color: 'var(--crm-danger)' }}
              />
            </Space>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <GaugeRing
                value={Math.min(100, Number(waterfall.data?.coverage ?? 0))}
                label={t('goals.coverage2')}
                size={72}
                color={Number(waterfall.data?.coverage ?? 0) >= 80 ? '#22a06b' : '#2f6bff'}
              />
              <AutoFitTable
                rowKey="__key"
                size="small"
                pagination={false}
                dataSource={attainmentRows.slice(0, 5)}
                style={{ flex: 1, minWidth: 220 }}
                columns={[
                  { title: t('common.metric'), dataIndex: 'metric' },
                  { title: t('nav.goals'), dataIndex: 'targetAmount' },
                  { title: t('common.actual'), dataIndex: 'actualAmount' },
                  {
                    title: t('common.attained'),
                    dataIndex: 'rate',
                    render: (v: string) => (
                      <Tag color={Number(v) >= 100 ? 'green' : Number(v) >= 60 ? 'blue' : 'default'}>
                        {v}%
                      </Tag>
                    ),
                  },
                ]}
              />
            </div>
          </Card>
        </div>
        <div>
          <Card size="small" title={t('goals.quotaTips')}>
            <div style={{ fontSize: 12, color: 'var(--crm-muted)', lineHeight: 1.8 }}>
              <div>{t('goals.commitShouldCoverDeals')}</div>
              <div>{t('goals.addPipelineWhenCoverage')}</div>
              <div>{t('goals.breakTheGapDown')}</div>
              <div>{t('goals.submitCommitBestWorst')}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              <GaugeRing
                value={Math.min(100, Number(waterfall.data?.coverage ?? 0))}
                label={t('goals.completion')}
                size={88}
                color="#2f6bff"
              />
            </div>
          </Card>
        </div>
      </div>
      <GoalCascade />
      <Card size="small" title={t('goals.quotaByOwner')} className="crm-panel-fixed" style={{ marginBottom: 16 }}>
        <AutoFitTable
          rowKey="userId"
          size="small"
          pagination={false}
          loading={waterfall.isLoading}
          dataSource={waterfall.data?.byOwner ?? []}
          columns={[
            { title: t('common.sales'), dataIndex: 'name', width: 120 },
            { title: t('nav.goals'), dataIndex: 'target', width: 110 },
            { title: t('goals.won'), dataIndex: 'wonAmount', width: 110 },
            { title: t('goals.weightedPipeline'), dataIndex: 'weightedPipeline', width: 110 },
            {
              title: t('goals.gap'),
              dataIndex: 'gap',
              width: 110,
              render: (v: string) => (
                <span style={{ color: Number(v) > 0 ? 'var(--crm-danger)' : 'var(--crm-success)' }}>{v}</span>
              ),
            },
            {
              title: t('goals.coverage'),
              dataIndex: 'coverage',
              render: (v: string) => (
                <Tag color={Number(v) >= 100 ? 'green' : Number(v) >= 70 ? 'blue' : 'orange'}>
                  {v}%
                </Tag>
              ),
            },
          ]}
        />
      </Card>
      <ErpListShell
        program="mtgoa0001"
        title={t('goals.goals')}
        subtitle={t('goals.adminMonthlyQuarterlyGoals')}
        search={q}
        onSearch={setQ}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['goals'] })}
        onCreate={() => setOpen(true)}
        createLabel={t('common.create')}
      >
        <ErpTable
          rowKey="id"
          storageKey="goals"
          onRowClick={(row) => {
            const r = row as unknown as Record<string, unknown>
            setEditId(String(r.id))
            form.setFieldsValue(r)
            setOpen(true)
          }}
          loading={listQ.isLoading}
          dataSource={
            (listQ.data ?? []).filter(
              (g) =>
                !q ||
                String(g.metric).toLowerCase().includes(q.toLowerCase()) ||
                String(g.periodKey).includes(q),
            ) as unknown as Record<string, unknown>[]
          }
          pageSize={12}
          columns={[
            {
              title: t('common.metric'),
              dataIndex: 'metric',
              width: 130,
              filterType: 'select',
              filterOptions: ['REVENUE', 'NEW_OPP', 'WON_AMOUNT'].map((s) => ({ value: s, label: s })),
            },
            { title: t('goals.period'), dataIndex: 'periodKey', width: 100, filterType: 'text', sorter: true },
            { title: t('goals.goalAmount'), dataIndex: 'targetAmount', width: 110, filterType: 'number' },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 90,
              render: (_v, row) => {
                const r = row as unknown as GoalRow
                return (
                  <Button size="small" danger onClick={() => removeM.mutate(r.id)}>{t('common.delete')}</Button>
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
        confirmLoading={createM.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            metric: 'WON_AMOUNT',
            periodKey: new Date().toISOString().slice(0, 7),
            targetAmount: 100000,
          }}
          onFinish={(v) => createM.mutate(v)}
        >
          <Form.Item name="metric" label={t('common.metric')}>
            <Select
              options={['WON_AMOUNT', 'REVENUE', 'NEW_OPP'].map((s) => ({ value: s, label: s }))}
            />
          </Form.Item>
          <Form.Item name="periodKey" label={t('common.periodYyyyMm')} rules={[{ required: true }]}>
            <Input placeholder="2026-09" />
          </Form.Item>
          <Form.Item name="targetAmount" label={t('goals.goalAmount')}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
