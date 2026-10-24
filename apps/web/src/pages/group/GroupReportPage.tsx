import { useQuery } from '@tanstack/react-query'
import { Button, Space, Table, Typography } from 'antd'
import dayjs from 'dayjs'
import { api } from '../../api/client'
import { t } from '../../i18n'

/** 集团合并经营报表（可打印 PDF）：/group/report */
export default function GroupReportPage() {
  const overview = useQuery({
    queryKey: ['group-overview'],
    queryFn: () =>
      api<{
        entities: {
          id: string
          code: string
          name: string
          type: string
          accountCount: number
          userCount: number
          wonAmount: string
          openAmount: string
          weightedAmount: string
          contractAmount: string
          received: string
        }[]
        // 金额按约定以字符串返回（避免浮点误差），显示前再转数字
        total: {
          wonAmount: number | string
          openAmount: number | string
          contractAmount: number | string
          received: number | string
        }
      }>('/group/overview'),
    retry: false,
  })

  const finance = useQuery({
    queryKey: ['group-consolidated-finance'],
    queryFn: () =>
      api<{
        year: string
        contractTotal: string
        receivedOnContract: string
        cashIn: string
        receivable: string
        overduePlanCount: number
        overduePlanAmount: string
        totalExpense: string
        profit: string
        margin: string
      }>('/group/consolidated-finance'),
    retry: false,
  })

  const monthly = useQuery({
    queryKey: ['group-monthly-report'],
    queryFn: () =>
      api<{
        month: string
        wonAmount: string
        wonCount: number
        contractAmount: string
        received: string
        budget: string
      }>('/group/monthly-report'),
    retry: false,
  })

  const f = finance.data
  const m = monthly.data
  const rows = overview.data?.entities ?? []
  const total = overview.data?.total

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: 28,
        background: '#fff',
        fontFamily: 'system-ui, "PingFang SC", sans-serif',
        color: '#1e293b',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>{t('group.groupConsolidatedBusinessReport')}</Typography.Title>
          <Typography.Text type="secondary">{t('group.periodGeneratedOn', { v: f?.year ?? dayjs().format('YYYY'), v2: dayjs().format('YYYY-MM-DD') })}
          </Typography.Text>
        </div>
        <Space className="no-print">
          <Button onClick={() => window.print()}>{t('common.printPdf')}</Button>
          <Button
            onClick={() => {
              const header = [t('common.code'), t('group.entity'), t('common.type'), t('group.accounts'), t('group.headcount'), t('enum.stage.WON'), t('common.openDeals'), t('common.contractAmount'), t('nav.payments')]
              const body = rows.map((e) =>
                [e.code, e.name, e.type, e.accountCount, e.userCount, e.wonAmount, e.openAmount, e.contractAmount, e.received].join(','),
              )
              const csv = [header.join(','), ...body].join('\n')
              const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = t('group.groupConsolidatedReportCsv', { v: dayjs().format('YYYYMMDD') })
              a.click()
              URL.revokeObjectURL(url)
            }}
          >{t('common.exportCsv')}</Button>
        </Space>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: t('common.contractTotal'), value: f?.contractTotal ?? '—' },
          { label: t('group.receivedOnContracts2'), value: f?.receivedOnContract ?? '—' },
          { label: t('group.cashCollected'), value: f?.cashIn ?? '—' },
          { label: t('group.accountsReceivable'), value: f?.receivable ?? '—' },
          { label: t('group.totalExpense'), value: f?.totalExpense ?? '—' },
          { label: t('group.profit2'), value: f?.profit ?? '—' },
          { label: t('group.profitMargin'), value: f?.margin ? `${f.margin}%` : '—' },
          { label: t('group.overduePlans2'), value: f ? t('group.items', { overduePlanCount: f.overduePlanCount, overduePlanAmount: f.overduePlanAmount }) : '—' },
        ].map((k) => (
          <div
            key={k.label}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '12px 14px',
              background: '#f8fafc',
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b' }}>{k.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <Typography.Title level={4} style={{ marginTop: 28 }}>{t('group.monthlyBusinessSummary')}</Typography.Title>
      <Table
        size="small"
        pagination={false}
        rowKey={(r) => r.label}
        dataSource={[
          { label: t('common.month'), value: m?.month ?? '—' },
          { label: t('group.wonAmount'), value: m?.wonAmount ?? '—' },
          { label: t('group.dealsWon'), value: m?.wonCount ?? '—' },
          { label: t('group.newContracts2'), value: m?.contractAmount ?? '—' },
          { label: t('nav.payments'), value: m?.received ?? '—' },
          { label: t('group.annualBudget'), value: m?.budget ?? '—' },
        ]}
        columns={[
          { title: t('common.metric'), dataIndex: 'label', width: 160 },
          { title: t('group.value'), dataIndex: 'value' },
        ]}
      />

      <Typography.Title level={4} style={{ marginTop: 28 }}>{t('group.legalEntityComparison')}</Typography.Title>
      <Table
        size="small"
        pagination={false}
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: t('common.code'), dataIndex: 'code', width: 80 },
          { title: t('group.entity'), dataIndex: 'name' },
          { title: t('common.type'), dataIndex: 'type', width: 90 },
          { title: t('nav.accounts'), dataIndex: 'accountCount', width: 70 },
          { title: t('group.headcount'), dataIndex: 'userCount', width: 70 },
          { title: t('enum.stage.WON'), dataIndex: 'wonAmount' },
          { title: t('common.openDeals'), dataIndex: 'openAmount' },
          { title: t('common.contractAmount'), dataIndex: 'contractAmount' },
          { title: t('nav.payments'), dataIndex: 'received' },
        ]}
        summary={() =>
          total ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={4}>
                <b>{t('common.total')}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} />
              <Table.Summary.Cell index={5}>
                <b>{Number(total.wonAmount).toFixed(2)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6}>
                <b>{Number(total.openAmount).toFixed(2)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7}>
                <b>{Number(total.contractAmount).toFixed(2)}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8}>
                <b>{Number(total.received).toFixed(2)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          ) : null
        }
      />

      <div style={{ marginTop: 36, display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 12 }}>
        <span>{t('group.preparedByGroupFinance')}</span>
        <span>{t('group.thisReportWasGenerated', { v: dayjs().format('YYYY-MM-DD HH:mm') })}</span>
      </div>
      <style>{`@media print { .no-print, button { display: none !important } }`}</style>
    </div>
  )
}
