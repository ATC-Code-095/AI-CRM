import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Button, Card, Descriptions, Input, Space, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { t } from '../../i18n'

/** 客户分享页：/share/quote/:token 免登录 */
export default function ShareQuotePage() {
  const { token } = useParams()
  const { message } = App.useApp()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [accepted, setAccepted] = useState(false)

  const { data, error, isLoading } = useQuery({
    queryKey: ['share-quote', token],
    queryFn: () =>
      api<{
        quoteNo: string
        subject: string
        status: string
        total: string
        subtotal: string
        discountAmount: string
        currency: string
        validUntil: string | null
        terms: string | null
        version: number
        account?: { name: string } | null
        lines: { name: string; qty: string; unitPrice: string; discountRate: string; amount: string }[]
      }>(`/public/quotes/${token}`),
    retry: false,
  })

  const acceptM = useMutation({
    mutationFn: () =>
      api(`/public/quotes/${token}/accept`, {
        method: 'POST',
        body: JSON.stringify({ name, note }),
      }),
    onSuccess: () => {
      message.success(t('quotes.quoteConfirmedTheSales'))
      setAccepted(true)
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (isLoading) return null
  if (error || !data) {
    return (
      <div style={{ maxWidth: 720, margin: '48px auto', padding: 24, textAlign: 'center' }}>
        <Typography.Title level={3}>{t('quotes.linkIsInvalidOr')}</Typography.Title>
        <Typography.Text type="secondary">{t('quotes.pleaseContactYourSales')}</Typography.Text>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 24, background: '#fff', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
        <Typography.Title level={2} style={{ margin: 0 }}>{t('quotes.quotation')}</Typography.Title>
        <Typography.Text type="secondary">QUOTATION</Typography.Text>
      </div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label={t('common.no')}>{data.quoteNo}</Descriptions.Item>
          <Descriptions.Item label={t('quotes.version')}>v{data.version}</Descriptions.Item>
          <Descriptions.Item label={t('common.subject')}>{data.subject}</Descriptions.Item>
          <Descriptions.Item label={t('nav.accounts')}>{data.account?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('quotes.validUntil3')}>
            {data.validUntil ? data.validUntil.slice(0, 10) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('audit.field.status')}>
            <Tag color={data.status === 'ACCEPTED' ? 'green' : 'blue'}>{data.status}</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Table
        rowKey={(_r, i) => String(i)}
        size="small"
        pagination={false}
        dataSource={data.lines}
        columns={[
          { title: t('nav.projects'), dataIndex: 'name' },
          { title: t('common.qty'), dataIndex: 'qty', width: 80 },
          {
            title: t('common.unitPrice'),
            dataIndex: 'unitPrice',
            width: 100,
            render: (v: string) => Number(v).toFixed(2),
          },
          {
            title: t('quotes.discount'),
            dataIndex: 'discountRate',
            width: 80,
            render: (v: string) => `${(Number(v) * 100).toFixed(0)}%`,
          },
          {
            title: t('audit.field.amount'),
            dataIndex: 'amount',
            width: 110,
            render: (v: string) => Number(v).toFixed(2),
          },
        ]}
      />
      <div style={{ marginTop: 16, textAlign: 'right', fontSize: 14 }}>
        <div>{t('quotes.subtotal2', { v: Number(data.subtotal).toFixed(2) })}</div>
        <div>{t('quotes.discount2', { v: Number(data.discountAmount).toFixed(2) })}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{t('quotes.total2', { v: Number(data.total).toFixed(2), currency: data.currency })}
        </div>
      </div>
      {data.terms ? (
        <div style={{ marginTop: 16, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('common.terms')}</div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.8 }}>{data.terms}</div>
        </div>
      ) : null}

      {!accepted && data.status !== 'ACCEPTED' ? (
        <Card size="small" style={{ marginTop: 20 }} title={t('quotes.confirmQuote')}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Input
              placeholder={t('quotes.yourNameCompany')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input.TextArea
              rows={2}
              placeholder={t('quotes.remarkOptional')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              type="primary"
              block
              loading={acceptM.isPending}
              onClick={() => acceptM.mutate()}
            >{t('quotes.acceptThisQuote')}</Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('quotes.byConfirmingYouAccept')}</Typography.Text>
          </Space>
        </Card>
      ) : (
        <Card size="small" style={{ marginTop: 20, background: '#f0fdf4', border: '1px solid #86efac' }}>
          <Space>
            <Tag color="green">{t('enum.payment.status.CONFIRMED')}</Tag>
            <span>{t('quotes.thankYouForConfirming', { v: dayjs().format('YYYY-MM-DD HH:mm') })}</span>
          </Space>
        </Card>
      )}
      <div style={{ marginTop: 24, textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{t('quotes.thisPageWasGenerated')}</div>
    </div>
  )
}
