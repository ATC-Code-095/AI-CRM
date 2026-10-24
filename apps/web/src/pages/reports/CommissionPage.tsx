import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { api } from '../../api/client'
import { ExportCsvButton } from '../../components/ExportCsvButton'
import { BarChart } from '../../components/SimpleCharts'
import { t } from '../../i18n'

type Tier = { min: number; max: number | null; rate: number }
type CommissionLine = {
  paymentId: string
  contractNo: string
  contractName: string
  accountName: string
  amount: string
  paidAt: string
  status: string
  commission: string
  cumulative: string
}
type CommissionRow = {
  userId: string
  name: string
  receivedAmount: string
  rate: string
  commission: string
  paymentCount: number
  status: string
  payoutId: string
  payoutNote: string
  lines: CommissionLine[]
}
type CommissionReport = {
  periodKey: string
  mode: 'TIERED' | 'FLAT'
  tiers: Tier[]
  totalCommission: string
  totalReceived: string
  rows: CommissionRow[]
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'default',
  CONFIRMED: 'blue',
  PAID: 'green',
}
const STATUS_TEXT: Record<string, string> = {
  PENDING: t('reports.toConfirm'),
  CONFIRMED: t('enum.payment.status.CONFIRMED'),
  PAID: t('reports.paidOut'),
}

/** 销售佣金管理中心：阶梯规则 + 明细计佣 + 发放状态 */
export default function CommissionPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [period, setPeriod] = useState<Dayjs>(dayjs())
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rulesForm] = Form.useForm()
  const [payoutTarget, setPayoutTarget] = useState<CommissionRow | null>(null)
  const [payoutStatus, setPayoutStatus] = useState('CONFIRMED')
  const [payoutNote, setPayoutNote] = useState('')

  const periodKey = period.format('YYYY-MM')
  const report = useQuery({
    queryKey: ['commission', periodKey],
    queryFn: () => api<CommissionReport>(`/reports/commission?periodKey=${periodKey}`),
    retry: false,
  })
  const rules = useQuery({
    queryKey: ['commission-rules'],
    queryFn: () => api<{ tiers: Tier[]; mode: string }>('/reports/commission/rules'),
    retry: false,
  })

  const saveRules = useMutation({
    mutationFn: (tiers: Tier[]) =>
      api('/reports/commission/rules', { method: 'PUT', body: JSON.stringify({ tiers }) }),
    onSuccess: () => {
      message.success(t('reports.commissionRulesSaved'))
      setRulesOpen(false)
      void qc.invalidateQueries({ queryKey: ['commission-rules'] })
      void qc.invalidateQueries({ queryKey: ['commission'] })
    },
    onError: (e: Error) => message.error(e.message || t('common.saveFailed')),
  })

  const savePayout = useMutation({
    mutationFn: (v: { userId: string; status: string; note?: string }) =>
      api('/reports/commission/payout', {
        method: 'POST',
        body: JSON.stringify({ ...v, periodKey }),
      }),
    onSuccess: () => {
      message.success(t('reports.payoutStatusUpdated'))
      setPayoutTarget(null)
      setPayoutNote('')
      void qc.invalidateQueries({ queryKey: ['commission', periodKey] })
    },
    onError: (e: Error) => message.error(e.message || t('reports.updateFailed')),
  })

  const rows = useMemo(() => report.data?.rows ?? [], [report.data])
  const maxCommission = useMemo(
    () => Math.max(...rows.map((r) => Number(r.commission)), 1),
    [rows],
  )

  const openRules = () => {
    const tiers = rules.data?.tiers ?? [{ min: 0, max: null, rate: 0.05 }]
    rulesForm.setFieldsValue({
      tiers: tiers.map((t) => ({
        min: t.min,
        max: t.max,
        rate: Number((t.rate * 100).toFixed(2)),
      })),
    })
    setRulesOpen(true)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>{t('reports.salesCommissionCenter')}</Typography.Title>
        <Space wrap>
          <DatePicker
            picker="month"
            value={period}
            allowClear={false}
            onChange={(v) => v && setPeriod(v)}
          />
          <Button onClick={openRules}>{t('reports.tierRules')}</Button>
          <ExportCsvButton
            path={`/reports/commission?periodKey=${periodKey}&export=csv`}
            filename={`commission-${periodKey}.csv`}
          />
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('reports.collectedThisPeriod')}
              value={Number(report.data?.totalReceived ?? 0)}
              precision={2}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('reports.commissionPayableThisPeriod')}
              value={Number(report.data?.totalCommission ?? 0)}
              precision={2}
              valueStyle={{ color: '#2b5fd9' }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title={t('reports.commissionMode')}
              value={report.data?.mode === 'TIERED' ? t('reports.tieredProgressive') : t('reports.flatRate')}
              suffix={
                report.data?.mode === 'TIERED' ? (
                  <Tag color="blue">{t('reports.tiers', { length: report.data.tiers.length })}</Tag>
                ) : (
                  <Tag>{report.data?.tiers?.[0] ? `${(report.data.tiers[0].rate * 100).toFixed(1)}%` : '-'}</Tag>
                )
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title={t('reports.earners')} value={rows.filter((r) => Number(r.receivedAmount) > 0).length} suffix={t('reports.people')} />
          </Card>
        </Col>
      </Row>

      {rows.length > 0 && (
        <Card size="small" title={t('reports.commissionDistribution')} style={{ marginBottom: 16 }}>
          <BarChart
            items={rows
              .filter((r) => Number(r.commission) > 0)
              .slice(0, 10)
              .map((r) => ({ label: r.name, value: Number(r.commission) }))}
            color="#2b5fd9"
            height={160}
          />
        </Card>
      )}

      <Card
        size="small"
        title={t('reports.commissionDetails', { periodKey })}
        extra={<Tag color="blue">{t('reports.lineLevelProgressiveCommission')}</Tag>}
      >
        <Table
          rowKey="userId"
          size="small"
          loading={report.isLoading}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                rowKey="paymentId"
                size="small"
                pagination={false}
                dataSource={r.lines}
                columns={[
                  { title: t('reports.paymentDate'), dataIndex: 'paidAt', width: 100 },
                  { title: t('audit.field.contractNo'), dataIndex: 'contractNo', width: 130 },
                  { title: t('nav.accounts'), dataIndex: 'accountName', width: 140 },
                  { title: t('nav.contracts'), dataIndex: 'contractName', ellipsis: true },
                  {
                    title: t('common.collectedAmount'),
                    dataIndex: 'amount',
                    width: 110,
                    align: 'right' as const,
                  },
                  {
                    title: t('reports.commissionOnThisPayment'),
                    dataIndex: 'commission',
                    width: 110,
                    align: 'right' as const,
                    render: (v: string) => <b style={{ color: '#2b5fd9' }}>{v}</b>,
                  },
                  {
                    title: t('reports.cumulativeCollected'),
                    dataIndex: 'cumulative',
                    width: 110,
                    align: 'right' as const,
                  },
                ]}
              />
            ),
          }}
          columns={[
            {
              title: t('leaderboard.rank'),
              width: 64,
              render: (_: unknown, __: CommissionRow, i: number) => (
                <Tag color={i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'orange' : 'default'}>
                  {i + 1}
                </Tag>
              ),
            },
            { title: t('common.sales'), dataIndex: 'name', width: 110 },
            {
              title: t('common.collectedAmount'),
              dataIndex: 'receivedAmount',
              width: 120,
              align: 'right' as const,
            },
            {
              title: t('reports.effectiveRate'),
              dataIndex: 'rate',
              width: 96,
              align: 'right' as const,
              render: (v: string) => `${v}%`,
            },
            {
              title: t('reports.commissionPayable'),
              dataIndex: 'commission',
              width: 120,
              align: 'right' as const,
              render: (v: string) => <b style={{ color: '#2b5fd9' }}>{v}</b>,
            },
            {
              title: t('common.share'),
              width: 140,
              render: (_: unknown, r: CommissionRow) => {
                const pct =
                  maxCommission > 0 ? Math.round((Number(r.commission) / maxCommission) * 100) : 0
                return <Progress percent={pct} size="small" strokeColor="#2b5fd9" showInfo={false} />
              },
            },
            {
              title: t('common.count2'),
              dataIndex: 'paymentCount',
              width: 70,
              align: 'right' as const,
            },
            {
              title: t('reports.payoutStatus'),
              dataIndex: 'status',
              width: 100,
              render: (v: string) => (
                <Tag color={STATUS_COLOR[v] ?? 'default'}>{STATUS_TEXT[v] ?? v}</Tag>
              ),
            },
            {
              title: t('common.actions'),
              width: 120,
              render: (_: unknown, r: CommissionRow) =>
                Number(r.commission) > 0 ? (
                  <Button size="small" type="link" onClick={() => {
                    setPayoutTarget(r)
                    setPayoutStatus(r.status === 'PAID' ? 'PAID' : 'CONFIRMED')
                    setPayoutNote(r.payoutNote)
                  }}>{t('reports.payOut')}</Button>
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
          ]}
        />
      </Card>

      <Drawer
        title={t('reports.commissionTierRulesProgressive')}
        width={520}
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setRulesOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={saveRules.isPending} onClick={() => rulesForm.submit()}>{t('common.save')}</Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>{t('reports.commissionIsCalculatedBy')}</Typography.Paragraph>
        <Form
          form={rulesForm}
          layout="vertical"
          onFinish={(v: { tiers: { min: number; max: number | null; rate: number }[] }) => {
            const tiers = (v.tiers ?? []).map((t) => ({
              min: Number(t.min ?? 0),
              max: t.max === null || t.max === undefined ? null : Number(t.max),
              rate: Number(t.rate ?? 0) / 100,
            }))
            saveRules.mutate(tiers)
          }}
        >
          <Form.List name="tiers">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item
                      name={[field.name, 'min']}
                      rules={[{ required: true, message: t('validation.required') }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber placeholder={t('reports.lowerBound')} min={0} style={{ width: 110 }} />
                    </Form.Item>
                    <Typography.Text type="secondary">—</Typography.Text>
                    <Form.Item name={[field.name, 'max']} style={{ marginBottom: 0 }}>
                      <InputNumber
                        placeholder={t('reports.upperBoundEmpty')}
                        min={0}
                        style={{ width: 120 }}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'rate']}
                      rules={[{ required: true, message: t('validation.required') }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber placeholder={t('reports.rate')} min={0} max={100} style={{ width: 100 }} />
                    </Form.Item>
                    <Button type="text" danger onClick={() => remove(field.name)}>{t('common.del')}</Button>
                  </Space>
                ))}
                <Button type="dashed" block onClick={() => add({ min: 0, max: null, rate: 5 })}>{t('reports.addTier')}</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Drawer>

      <Modal
        title={payoutTarget ? t('reports.payOutCommission', { name: payoutTarget.name }) : t('reports.payOutCommission2')}
        open={!!payoutTarget}
        onCancel={() => setPayoutTarget(null)}
        onOk={() => {
          if (!payoutTarget) return
          savePayout.mutate({
            userId: payoutTarget.userId,
            status: payoutStatus,
            note: payoutNote,
          })
        }}
        confirmLoading={savePayout.isPending}
      >
        {payoutTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>{t('reports.commissionPayable2')}<b style={{ color: '#2b5fd9', fontSize: 18 }}>{payoutTarget.commission}</b>
              <Typography.Text type="secondary" style={{ marginLeft: 12 }}>{t('reports.collectedEffectiveRate', { receivedAmount: payoutTarget.receivedAmount, rate: payoutTarget.rate })}</Typography.Text>
            </div>
            <div>
              <Typography.Text>{t('reports.payoutStatus')}</Typography.Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                value={payoutStatus}
                onChange={setPayoutStatus}
                options={[
                  { value: 'PENDING', label: t('reports.toConfirm') },
                  { value: 'CONFIRMED', label: t('enum.payment.status.CONFIRMED') },
                  { value: 'PAID', label: t('reports.paidOut') },
                ]}
              />
            </div>
            <div>
              <Typography.Text>{t('enum.activity.type.NOTE')}</Typography.Text>
              <Input.TextArea
                rows={3}
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                placeholder={t('reports.payoutBatchBankReference')}
                style={{ marginTop: 8 }}
              />
            </div>
          </Space>
        )}
      </Modal>
    </div>
  )
}
