import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Descriptions, InputNumber, Modal, Space, Tag, Typography } from 'antd'
import { AutoFitTable } from '../../components/AutoFitTable'
import { ErpTable } from '../../components/ErpTable'
import { Link, useParams } from 'react-router-dom'
import { api, webUrl } from '../../api/client'
import { ApprovalFlowChart } from '../../components/ApprovalFlowChart'
import { QrCode } from '../../components/QrCode'
import { downloadHtmlDoc } from '../../utils/docExport'
import { t } from '../../i18n'

interface QuoteLine {
  id: string
  productId: string
  name: string
  qty: string
  unitPrice: string
  discountRate: string
  amount: string
  product?: { code: string }
}

export default function QuoteDetailPage() {
  const { id } = useParams()
  const { data } = useQuery({
    queryKey: ['quote-detail', id],
    queryFn: () =>
      api<{
        id: string
        quoteNo: string
        subject: string
        status: string
        total: string
        currency?: string
        subtotal: string
        discountAmount: string
        version: number
        account?: { id: string; name: string }
        opportunity?: { id: string; name: string } | null
        lines: QuoteLine[]
        contracts: { id: string; contractNo: string; status: string }[]
      }>(`/quotes/${id}`),
    enabled: !!id,
    retry: false,
  })

  const history = useQuery({
    queryKey: ['quote-history', id],
    queryFn: () =>
      api<{
        items: {
          version: number
          total: string
          changedAt: string
          changedBy: string
          lines: QuoteLine[]
        }[]
      }>(`/quotes/${id}/history`),
    enabled: !!id,
    retry: false,
  })

  const qc = useQueryClient()
  const { message } = App.useApp()
  const [editLine, setEditLine] = useState<QuoteLine | null>(null)
  const [lineForm, setLineForm] = useState({ qty: 1, unitPrice: 0, discountRate: 0 })
  const saveLineM = useMutation({
    mutationFn: (p: { lines: Record<string, unknown>[]; version?: number }) =>
      api(`/quotes/${id}/lines`, { method: 'PUT', body: JSON.stringify(p) }),
    onSuccess: () => {
      message.success(t('quotes.lineItemsUpdated'))
      setEditLine(null)
      void qc.invalidateQueries({ queryKey: ['quote-detail', id] })
      void qc.invalidateQueries({ queryKey: ['quotes'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const toContractM = useMutation({
    mutationFn: () =>
      api<{ id: string; contractNo: string }>(`/quotes/${id}/to-contract`, { method: 'POST' }),
    onSuccess: (r) => {
      message.success(t('quotes.convertedToContract', { contractNo: r.contractNo }))
      void qc.invalidateQueries({ queryKey: ['quote-detail', id] })
      void qc.invalidateQueries({ queryKey: ['contracts'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const shareM = useMutation({
    mutationFn: () =>
      api<{ token: string; url: string }>(`/quotes/${id}/share-link`, { method: 'POST' }),
    onSuccess: (r) => {
      const url = webUrl(r.url)
      void navigator.clipboard?.writeText(url).catch(() => undefined)
      message.success(t('quotes.shareLinkCopied', { url: r.url }))
    },
    onError: (e: Error) => message.error(e.message),
  })

  if (!data) {
    return <div style={{ padding: 24, color: '#646A73' }}>{t('quotes.loadingQuote')}</div>
  }
  // 审批通过（或已发送）后才能发给客户确认
  const canShare = data.status === 'APPROVED' || data.status === 'SENT'
  const shareHint = canShare ? undefined : t('quotes.theQuoteCanBe')
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
          {data.quoteNo} <Tag>{data.status}</Tag> <Tag color="blue">v{data.version ?? 1}</Tag>
        </Typography.Title>
        <Space>
          <Button
            loading={shareM.isPending}
            disabled={!canShare}
            title={shareHint}
            onClick={() => shareM.mutate()}
          >{t('quotes.generateCustomerLink')}</Button>
          <Button
            type="primary"
            ghost
            loading={toContractM.isPending}
            onClick={() => toContractM.mutate()}
          >{t('quotes.toContract')}</Button>
          <Button
            onClick={() => {
              Modal.info({
                title: t('quotes.scanToViewQuote'),
                content: (
                  <div style={{ textAlign: 'center' }}>
                    <QrCode value={shareM.data?.url ? webUrl(shareM.data.url) : webUrl()} size={160} />
                    <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>
                      {shareM.data?.url || t('quotes.clickGenerateCustomerLink')}
                    </div>
                  </div>
                ),
              })
            }}
          >{t('quotes.qrCode')}</Button>
          <Button
            disabled={!canShare}
            title={shareHint}
            onClick={() => {
              void api<{ mailto: string; to: string }>(`/quotes/${id}/email`, {
                method: 'POST',
                body: JSON.stringify({ to: '' }),
              })
                .then((r) => {
                  window.location.href = r.mailto
                  message.success(t('quotes.emailDraftedPleaseSend'))
                })
                .catch((e: Error) => message.error(e.message))
            }}
          >{t('quotes.email')}</Button>
          <Link to={`/quotes/${id}/print`}>
            <Button type="primary">{t('common.printPdf')}</Button>
          </Link>
        </Space>
      </div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={t('common.subject')}>{data.subject}</Descriptions.Item>
          <Descriptions.Item label={t('nav.accounts')}>
            <Link to={`/accounts/${data.account?.id}`}>{data.account?.name ?? '-'}</Link>
          </Descriptions.Item>
          <Descriptions.Item label={t('quotes.relatedDeal')}>
            {data.opportunity ? (
              <Link to={`/opportunities/${data.opportunity.id}`}>{data.opportunity.name}</Link>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('quotes.subtotal')}>{data.subtotal}</Descriptions.Item>
          <Descriptions.Item label={t('quotes.discount')}>{data.discountAmount}</Descriptions.Item>
          <Descriptions.Item label={t('common.total')}>
            {data.total} {data.currency}
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Card
        size="small"
        title={t('quotes.approvalFlow')}
        style={{ marginBottom: 12 }}
        extra={<Tag color="blue">{t('quotes.triggeredAutomaticallyWhenDiscount')}</Tag>}
      >
        <ApprovalFlowChart quoteId={id} />
      </Card>
      <Card size="small" title={t('common.lineItems')}>
        <ErpTable
          rowKey="id"
          storageKey="quote-lines"
          pageSize={10}
          dataSource={(data.lines ?? []) as unknown as Record<string, unknown>[]}
          columns={[
            {
              title: t('common.products'),
              dataIndex: 'product',
              width: 110,
              render: (_: unknown, r: unknown) => ((r as QuoteLine).product?.code ?? (r as QuoteLine).name),
            },
            { title: t('audit.field.name'), dataIndex: 'name', width: 160, filterType: 'text' },
            { title: t('common.qty'), dataIndex: 'qty', width: 80, filterType: 'number' },
            { title: t('common.unitPrice'), dataIndex: 'unitPrice', width: 100, filterType: 'number' },
            {
              title: t('quotes.discount'),
              dataIndex: 'discountRate',
              width: 80,
              render: (v: unknown) => `${(Number(v) * 100).toFixed(0)}%`,
            },
            { title: t('audit.field.amount'), dataIndex: 'amount', width: 100, filterType: 'number' },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 80,
              render: (_: unknown, r: unknown) => (
                <Button
                  size="small"
                  onClick={() => {
                    const l = r as QuoteLine
                    setEditLine(l)
                    setLineForm({
                      qty: Number(l.qty) || 1,
                      unitPrice: Number(l.unitPrice) || 0,
                      discountRate: Number(l.discountRate) || 0,
                    })
                  }}
                >{t('common.edit')}</Button>
              ),
            },
          ]}
        />
      </Card>
      <Card size="small" title={t('quotes.versionHistoryCompare')} style={{ marginTop: 12 }}>
        <AutoFitTable
          rowKey="version"
          size="small"
          pagination={{ pageSize: 5 }}
          dataSource={history.data?.items ?? []}
          expandable={{
            expandedRowRender: (rec) => {
              const r = rec as unknown as { lines?: QuoteLine[] }
              return (
              <ErpTable
                rowKey="id"
                pageSize={5}
                dataSource={(r.lines ?? []) as unknown as Record<string, unknown>[]}
                columns={[
                  { title: t('audit.field.name'), dataIndex: 'name', width: 160 },
                  { title: t('common.qty'), dataIndex: 'qty', width: 80 },
                  { title: t('common.unitPrice'), dataIndex: 'unitPrice', width: 100 },
                  {
                    title: t('quotes.discount'),
                    dataIndex: 'discountRate',
                    width: 80,
                    render: (v: unknown) => `${(Number(v) * 100).toFixed(0)}%`,
                  },
                  { title: t('audit.field.amount'), dataIndex: 'amount', width: 100 },
                ]}
              />
              )
            },
          }}
          columns={[
            { title: t('quotes.version'), dataIndex: 'version', render: (v: number) => `v${v}` },
            { title: t('common.total'), dataIndex: 'total' },
            {
              title: t('common.time'),
              dataIndex: 'changedAt',
              render: (v: string) => v.slice(0, 19).replace('T', ' '),
            },
            { title: t('quotes.modifiedBy'), dataIndex: 'changedBy' },
            {
              title: t('common.actions'),
              render: (_: unknown, r: { version: number }) => (
                <>
                <Link to={`/quotes/${id}/print?compare=${r.version}`}>{t('quotes.comparePrint')}</Link>
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    const rec = r as unknown as {
                      version: number
                      total: string
                      lines: QuoteLine[]
                    }
                    const rows = (rec.lines ?? [])
                      .map(
                        (l) =>
                          `<tr><td style="border:1px solid #94a3b8;padding:6px">${l.name}</td><td style="border:1px solid #94a3b8;padding:6px">${l.qty}</td><td style="border:1px solid #94a3b8;padding:6px">${l.unitPrice}</td><td style="border:1px solid #94a3b8;padding:6px">${l.amount}</td></tr>`,
                      )
                      .join('')
                    const html = t('quotes.quoteVDetailsNo', { version: rec.version, quoteNo: data.quoteNo, total: rec.total, rows })
                    downloadHtmlDoc(html, t('quotes.quoteV', { quoteNo: data.quoteNo, version: rec.version }), 'doc')
                  }}
                >{t('quotes.exportThisVersion')}</Button>
                </>
              ),
            },
          ]}
        />
        {!history.data?.items?.length && (
          <div style={{ color: '#8b919a', fontSize: 12 }}>{t('quotes.noVersionHistoryYet')}</div>
        )}
      </Card>
      {(data.contracts ?? []).length > 0 && (
        <Card size="small" title={t('quotes.generatedContracts')} style={{ marginTop: 12 }}>
          <AutoFitTable
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.contracts}
            columns={[
              {
                title: t('common.no'),
                render: (_: unknown, r) => <Link to="/contracts">{r.contractNo}</Link>,
              },
              { title: t('audit.field.status'), dataIndex: 'status' },
            ]}
          />
        </Card>
      )}

      <Modal
        title={t('quotes.editLineItem', { v: editLine?.name ?? '' })}
        open={!!editLine}
        onCancel={() => setEditLine(null)}
        onOk={() => {
          if (!editLine || !data) return
          const lines = (data.lines ?? []).map((l) => ({
            productId: l.productId,
            name: l.name,
            qty: String(l.id === editLine.id ? lineForm.qty : l.qty),
            unitPrice: String(l.id === editLine.id ? lineForm.unitPrice : l.unitPrice),
            discountRate: String(l.id === editLine.id ? lineForm.discountRate : l.discountRate),
          }))
          saveLineM.mutate({ lines, version: data.version })
        }}
        confirmLoading={saveLineM.isPending}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>{t('quotes.qty')}<InputNumber
              min={0}
              value={lineForm.qty}
              onChange={(v) => setLineForm((f) => ({ ...f, qty: Number(v ?? 0) }))}
            />
          </div>
          <div>{t('quotes.unitPrice')}<InputNumber
              min={0}
              value={lineForm.unitPrice}
              onChange={(v) => setLineForm((f) => ({ ...f, unitPrice: Number(v ?? 0) }))}
            />
          </div>
          <div>{t('quotes.discount01')}<InputNumber
              min={0}
              max={1}
              step={0.05}
              value={lineForm.discountRate}
              onChange={(v) => setLineForm((f) => ({ ...f, discountRate: Number(v ?? 0) }))}
            />
          </div>
          <div>{t('quotes.estimatedAmount')}<b>
              {(lineForm.qty * lineForm.unitPrice * (1 - lineForm.discountRate)).toFixed(2)}
            </b>
          </div>
        </Space>
      </Modal>
    </div>
  )
}