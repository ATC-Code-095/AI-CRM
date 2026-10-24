import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Card, Col, Input, Row, Space, Statistic, Typography } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { api } from '../../api/client'
import { t } from '../../i18n'

/** 销售周报生成与分享 */
export default function WeeklyBriefPage() {
  const { message } = App.useApp()
  const [note, setNote] = useState('')

  const brief = useQuery({
    queryKey: ['sales-brief'],
    queryFn: () =>
      api<{
        text: string
        metrics: {
          leads: number
          opps: number
          wonCount: number
          wonAmount: string
          received: string
          activities: number
          reminders: number
        }
      }>('/reports/sales-brief'),
    retry: false,
    refetchInterval: 60_000,
  })

  const shareM = useMutation({
    mutationFn: () =>
      api('/reports/sales-brief/share', {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      message.success(t('reports.weeklyBriefSharedWith'))
      setNote('')
    },
    onError: (e: Error) => message.error(e.message),
  })

  const m = brief.data?.metrics
  const text = brief.data?.text ?? ''

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{t('common.weeklySalesBrief')}</Typography.Title>
        <Space className="no-print">
          <Button
            onClick={() => {
              void navigator.clipboard?.writeText(text)
              message.success(t('reports.weeklyBriefTextCopied'))
            }}
          >{t('reports.copyText')}</Button>
          <Button onClick={() => window.print()}>{t('common.print')}</Button>
          <Button type="primary" loading={shareM.isPending} onClick={() => shareM.mutate()}>{t('reports.shareWithEveryone')}</Button>
        </Space>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('reports.newLeads')} value={m?.leads ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('common.newDeal2')} value={m?.opps ?? 0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('enum.stage.WON')} value={m?.wonCount ?? 0} suffix={t('reports.text')} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('reports.closedAmount')} value={Number(m?.wonAmount ?? 0)} precision={0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('nav.payments')} value={Number(m?.received ?? 0)} precision={0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title={t('nav.activities')} value={m?.activities ?? 0} suffix={t('reports.runs')} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={t('reports.thisWeekSBrief')}>
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontSize: 13,
            lineHeight: 1.9,
            background: '#f8fafc',
            padding: 14,
            borderRadius: 8,
            margin: 0,
          }}
        >
          {text || t('common.loading')}
        </pre>
      </Card>

      <Card size="small" title={t('reports.shareNote')} style={{ marginTop: 16 }} className="no-print">
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder={t('reports.additionalNoteEG')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="primary" loading={shareM.isPending} onClick={() => shareM.mutate()}>{t('common.send')}</Button>
        </Space.Compact>
      </Card>

      <div style={{ marginTop: 16, color: '#94a3b8', fontSize: 12 }}>{t('reports.periodLast7Days', { v: dayjs().format('YYYY-MM-DD HH:mm') })}</div>
      <style>{`@media print { .no-print, button { display: none !important } }`}</style>
    </div>
  )
}
