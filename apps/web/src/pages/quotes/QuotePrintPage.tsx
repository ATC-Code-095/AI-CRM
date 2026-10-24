import { useQuery } from '@tanstack/react-query'
import { Select, Button, Table, Tag, Typography, Space, App } from 'antd'
import { useState } from 'react'
import dayjs from 'dayjs'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../api/client'
import { downloadHtmlDoc, fillTemplatePlaceholders, toChineseAmount } from '../../utils/docExport'
import { t } from '../../i18n'

/** 报价单打印/导出友好页：/quotes/:id/print ；?compare=版本 对比打印 */
export default function QuotePrintPage() {
  const { message } = App.useApp()
  const { id } = useParams()
  const [tplId, setTplId] = useState<string | undefined>()
  const tplQ = useQuery({
    queryKey: ['quote-templates'],
    queryFn: () =>
      api<{ items: { id: string; name: string; description?: string; file?: { fileName?: string } }[] }>(
        '/quote-templates',
      ),
    retry: false,
  })
  const tpl = tplQ.data?.items?.find((x) => x.id === tplId)
  const tplFileUrl = (tpl as { file?: { fileUrl?: string } } | undefined)?.file?.fileUrl
  const tplFileId = tplFileUrl ? String(tplFileUrl).split('/').pop() : ''
  const tplContent = useQuery({
    queryKey: ['tpl-content', tplId],
    enabled: !!tplId,
    queryFn: () =>
      api<{ content: string; hasFile?: boolean }>(`/quote-templates/${tplId}/content`),
    retry: false,
  })
  const tplHtml = useQuery({
    queryKey: ['tpl-html', tplFileId],
    enabled: !!tplFileId,
    queryFn: () =>
      api<{ html: string; fileName: string; lowQuality?: boolean }>(
        `/files/${tplFileId}/render-html`,
      ),
    retry: false,
  })
  const [sp] = useSearchParams()
  const compareVer = sp.get('compare')
  const { data } = useQuery({
    queryKey: ['quote-print', id],
    queryFn: () =>
      api<{
        quoteNo: string
        subject: string
        status: string
        version?: number
        total: string
        subtotal: string
        discountAmount: string
        taxAmount?: string
        currency?: string
        remark?: string | null
        createdAt?: string
        validUntil: string | null
        terms: string | null
        account?: {
          name: string
          shortName?: string
          phone?: string
          address?: string
          email?: string
          website?: string
          accountNo?: string
        }
        owner?: { name?: string; phone?: string; email?: string; title?: string }
        opportunity?: { name?: string }
        lines: {
          id: string
          name: string
          qty: string
          unitPrice: string
          discountRate: string
          amount: string
          product?: { code?: string }
        }[]
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
          lines: {
            name: string
            qty: string
            unitPrice: string
            discountRate: string
            amount: string
          }[]
        }[]
      }>(`/quotes/${id}/history`),
    enabled: !!id && !!compareVer,
    retry: false,
  })

  if (!data) return null
  const old = compareVer
    ? history.data?.items?.find((h) => String(h.version) === compareVer)
    : null
  // 是否已套用模板正文（则只输出模板，不输出 ERP 默认头/表）
  const savedHtml0 = tplContent.data?.content?.trim() || ''
  const fileHtml0 = tplHtml.data?.lowQuality ? '' : (tplHtml.data?.html ?? '').trim()
  const hasTemplateBody = !!((savedHtml0 || fileHtml0) && tplId)

  const buildFilledHtml = () => {
    const body = savedHtml0 || fileHtml0
    if (!body) return ''
    const cell = 'padding:9px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top'
    const linesHtml = data.lines
      .map((l, i) => {
        const unit = Number(l.unitPrice)
        const disc = Number(l.discountRate)
        const discUnit = unit * (1 - disc)
        return `<tr><td style="${cell}">${i + 1}</td><td style="${cell}">${l.name}</td><td style="${cell}">${unit.toFixed(2)}</td><td style="${cell}">${l.qty}</td><td style="${cell}">${(disc * 100).toFixed(0)}%</td><td style="${cell}">${discUnit.toFixed(2)}</td><td style="${cell}">${Number(l.amount).toFixed(2)}</td><td style="${cell}"></td></tr>`
      })
      .join('')
    return fillTemplatePlaceholders(body, {
      客户名: data.account?.name,
      甲方: data.account?.name,
      报价单号: data.quoteNo,
      单号: data.quoteNo,
      标题: data.subject,
      合计: data.total,
      大写金额: toChineseAmount(Number(data.total)),
      大写: toChineseAmount(Number(data.total)),
      金额: data.total,
      小计: data.subtotal,
      折扣: data.discountAmount,
      币种: data.currency ?? 'CNY',
      日期: dayjs().format('YYYY-MM-DD'),
      签署日期: dayjs().format('YYYY-MM-DD'),
      有效期: data.validUntil?.slice(0, 10) ?? '—',
      销售公司: '苏州中迪信息科技有限公司',
      销售: data.owner?.name,
      行项目: linesHtml,
      产品明细: linesHtml,
    } as Record<string, string | number | null | undefined>)
  }

  return (
    <div
      className={hasTemplateBody ? 'print-only-doc' : ''}
      style={{ maxWidth: 900, margin: '0 auto', padding: 24, background: '#fff', fontFamily: 'system-ui' }}
    >
      {/* 屏幕操作条：打印时隐藏；套用模板后连标题一并去掉 */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        {!hasTemplateBody ? (
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {old ? t('quotes.quoteComparisonPrint') : t('quotes.quotation')}
            </Typography.Title>
            <Typography.Text type="secondary">
              {data.quoteNo} · v{data.version ?? 1}
              {old ? t('quotes.vsV', { version: old.version }) : ''}
            </Typography.Text>
          </div>
        ) : (
          <div>
            <Typography.Text type="secondary">{t('quotes.appliedTemplate2', { v: tpl?.name ?? '', quoteNo: data.quoteNo })}
            </Typography.Text>
          </div>
        )}
        <Space>
          <Select
            style={{ width: 220 }}
            placeholder={t('common.selectTemplateForPrinting')}
            allowClear
            value={tplId}
            options={(tplQ.data?.items ?? []).map((x) => ({
              value: x.id,
              label: x.name + (x.file ? t('common.withFormatFile') : ''),
            }))}
            onChange={(v: string) => setTplId(v)}
          />
          <Button
            onClick={() => {
              const html = buildFilledHtml()
              if (html) downloadHtmlDoc(html, t('quotes.quote2', { quoteNo: data.quoteNo }), 'doc')
              else message.warning(t('common.pleaseSelectATemplate'))
            }}
          >{t('common.exportWord')}</Button>
          <Button type="primary" onClick={() => window.print()}>{t('common.printPdf')}</Button>
        </Space>
      </div>
      {!hasTemplateBody && (
        <>
      <Typography.Paragraph>
        <b>{t('quotes.customer')}</b>
        {data.account?.name ?? '-'}
        {data.account?.phone ? t('quotes.phone', { phone: data.account.phone }) : ''}
        {data.account?.address ? t('quotes.address', { address: data.account.address }) : ''}
      </Typography.Paragraph>
      <Typography.Paragraph>
        <b>{t('quotes.subject')}</b>
        {data.subject}
        {data.opportunity?.name ? t('quotes.deal', { name: data.opportunity.name }) : ''}
      </Typography.Paragraph>
      <Typography.Paragraph>
        <b>{t('quotes.date')}</b>
        {dayjs().format('YYYY-MM-DD')}
        {data.validUntil ? t('quotes.validUntil2', { v: data.validUntil.slice(0, 10) }) : ''}
        {data.owner?.name ? t('quotes.sales', { name: data.owner.name }) : ''}
        {data.owner?.phone ? `（${data.owner.phone}）` : ''}
      </Typography.Paragraph>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data.lines}
        columns={[
          {
            title: t('common.code'),
            dataIndex: 'product',
            width: 100,
            render: (v: { code?: string }) => v?.code ?? '—',
          },
          { title: t('audit.field.name'), dataIndex: 'name' },
          { title: t('common.qty'), dataIndex: 'qty' },
          {
            title: t('common.unitPrice'),
            dataIndex: 'unitPrice',
            render: (v: string) => Number(v).toFixed(2),
          },
          {
            title: t('quotes.discount'),
            dataIndex: 'discountRate',
            render: (v: string) => `${(Number(v) * 100).toFixed(0)}%`,
          },
          {
            title: t('audit.field.amount'),
            dataIndex: 'amount',
            render: (v: string) => Number(v).toFixed(2),
          },
        ]}
      />
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <div>{t('quotes.subtotal2', { v: Number(data.subtotal).toFixed(2) })}</div>
        <div>{t('quotes.discount2', { v: Number(data.discountAmount).toFixed(2) })}</div>
        <div>{t('quotes.tax2', { v: Number(data.taxAmount ?? 0).toFixed(2) })}</div>
        <div>{t('quotes.currencyVersionV', { v: data.currency ?? 'CNY', v2: data.version ?? 1 })}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{t('quotes.total', { v: Number(data.total).toFixed(2), v2: data.currency ?? 'CNY' })}
        </div>
        {old ? (
          <div>
            <Tag color="orange">{t('quotes.compareVTotalDifference', { version: old.version, v: Number(old.total).toFixed(2), v2: ' ', v3: (Number(data.total) - Number(old.total)).toFixed(2) })}
            </Tag>
          </div>
        ) : null}
      </div>
      {old ? (
        <div style={{ marginTop: 24 }}>
          <Typography.Title level={5}>{t('quotes.versionVLineItems', { version: old.version })}</Typography.Title>
          <Table
            rowKey={(_r, i) => String(i)}
            size="small"
            pagination={false}
            dataSource={old.lines ?? []}
            columns={[
              { title: t('audit.field.name'), dataIndex: 'name' },
              { title: t('common.qty'), dataIndex: 'qty' },
              {
                title: t('common.unitPrice'),
                dataIndex: 'unitPrice',
                render: (v: string) => Number(v).toFixed(2),
              },
              {
                title: t('quotes.discount'),
                dataIndex: 'discountRate',
                render: (v: string) => `${(Number(v) * 100).toFixed(0)}%`,
              },
              {
                title: t('audit.field.amount'),
                dataIndex: 'amount',
                render: (v: string) => Number(v).toFixed(2),
              },
            ]}
          />
          <div style={{ marginTop: 8, textAlign: 'right', color: '#646A73' }}>{t('quotes.versionTotalModifiedBy', { v: Number(old.total).toFixed(2), changedBy: old.changedBy, v2: ' ', v3: old.changedAt.slice(0, 10) })}
          </div>
        </div>
      ) : null}
        </>
      )}
      {(() => {
        // 模板正文优先级：用户保存的编辑正文 > 格式文件解析出的排版（表格）
        const savedHtml = tplContent.data?.content?.trim() || ''
        const fileHtml = tplHtml.data?.lowQuality ? '' : (tplHtml.data?.html ?? '').trim()
        const body = savedHtml || fileHtml
        const isFileFormat = !savedHtml && !!fileHtml
        // 行项目：与美化模板表头对齐（No./说明/标准单价/数量/折扣/折扣单价/金额/备注）
        const cell = 'padding:9px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top'
        const linesHtml =
          data.lines
            .map((l, i) => {
              const unit = Number(l.unitPrice)
              const disc = Number(l.discountRate)
              const discUnit = unit * (1 - disc)
              const zebra = i % 2 === 1 ? 'background:#f8fafc;' : ''
              return (
                `<tr style="${zebra}">` +
                `<td style="${cell};text-align:center;color:#64748b;width:40px">${i + 1}</td>` +
                `<td style="${cell};color:#0f172a;font-weight:500">${l.name}</td>` +
                `<td style="${cell};text-align:right;width:72px">${unit.toFixed(2)}</td>` +
                `<td style="${cell};text-align:center;width:56px">${l.qty}</td>` +
                `<td style="${cell};text-align:center;width:52px;color:#64748b">${(disc * 100).toFixed(0)}%</td>` +
                `<td style="${cell};text-align:right;width:72px">${discUnit.toFixed(2)}</td>` +
                `<td style="${cell};text-align:right;width:72px;font-weight:600;color:#0f172a">${Number(l.amount).toFixed(2)}</td>` +
                `<td style="${cell};width:56px;color:#94a3b8"></td>` +
                `</tr>`
              )
            })
            .join('')

        const vars = {
          客户名: data.account?.name,
          甲方: data.account?.name,
          乙方: t('quotes.ourCompany'),
          客户简称: data.account?.shortName,
          客户编号: data.account?.accountNo,
          客户电话: data.account?.phone,
          客户地址: data.account?.address,
          客户邮箱: data.account?.email,
          客户网址: data.account?.website,
          联系电话: data.account?.phone,
          联系地址: data.account?.address,
          报价单号: data.quoteNo,
          单号: data.quoteNo,
          报价编号: data.quoteNo,
          标题: data.subject,
          主题: data.subject,
          商机: data.opportunity?.name,
          合计: data.total,
          大写金额: toChineseAmount(Number(data.total)),
          大写: toChineseAmount(Number(data.total)),
          人民币大写: toChineseAmount(Number(data.total)),
          总额: data.total,
          金额: data.total,
          总金额: data.total,
          小计: data.subtotal,
          折扣: data.discountAmount,
          折扣金额: data.discountAmount,
          税额: data.taxAmount ?? '0.00',
          税金: data.taxAmount ?? '0.00',
          币种: data.currency ?? 'CNY',
          日期: dayjs().format('YYYY-MM-DD'),
          制单日期: data.createdAt
            ? dayjs(data.createdAt).format('YYYY-MM-DD')
            : dayjs().format('YYYY-MM-DD'),
          签署日期: dayjs().format('YYYY-MM-DD'),
          有效期: data.validUntil?.slice(0, 10) ?? '—',
          有效期至: data.validUntil?.slice(0, 10) ?? '—',
          有效日期: data.validUntil?.slice(0, 10) ?? '—',
          状态: data.status,
          版本: data.version ?? 1,
          销售公司: '苏州中迪信息科技有限公司',
          销售电话: data.owner?.phone ?? '',
          销售邮箱: data.owner?.email ?? '',
          销售: data.owner?.name,
          销售员: data.owner?.name,
          销售人员: data.owner?.name,
          负责人: data.owner?.name,
          联系人: data.owner?.name,
          销售手机: data.owner?.phone,
          销售职位: data.owner?.title,
          条款: data.terms,
          备注: data.remark,
        }

        if (!body) {
          return (
            <>
              {data.terms ? (
                <Typography.Paragraph style={{ marginTop: 24 }}>
                  <b>{t('quotes.terms')}</b>
                  {data.terms}
                </Typography.Paragraph>
              ) : null}
              {tpl ? (
                <div
                  style={{
                    marginTop: 20,
                    padding: 12,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('quotes.quoteTermsTemplate', { name: tpl.name })}</div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 13 }}>
                    {(tpl as { description?: string }).description ?? t('quotes.standardQuoteTerms')}
                  </div>
                  {tplHtml.data?.lowQuality ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        background: '#fff7ed',
                        border: '1px solid #fdba74',
                        borderRadius: 6,
                        color: '#9a3412',
                        fontSize: 12,
                      }}
                    >{t('common.formatFile2')}{tplHtml.data?.fileName ?? tpl?.file?.fileName ?? t('common.templateFile')}{t('quotes.couldNotBeParsed')}</div>
                  ) : null}
                </div>
              ) : null}
            </>
          )
        }

        // 套用模板排版：模板表/正文成为主文档
        let filled = fillTemplatePlaceholders(body, {
          ...vars,
          行项目: linesHtml,
          产品明细: linesHtml,
          明细表: linesHtml,
        } as Record<string, string | number | null | undefined>)
        // 模板里未写行项目占位符时，自动附上产品明细
        const hasLineSlot =
          body.includes('{行项目}') || body.includes('{产品明细}') || body.includes('{明细表}')
        if (!hasLineSlot) {
          filled = filled + '<div style="margin-top:16px">' + linesHtml + '</div>'
        }

        return (
          <div className="tpl-print-body">
            <div
              className="no-print"
              style={{
                marginBottom: 10,
                padding: '6px 10px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                fontSize: 12,
                color: '#1e40af',
              }}
            >{t('common.templateLayoutApplied')}{tpl?.name ?? t('common.template')}
              {isFileFormat ? t('common.sourceFile', { v: tplHtml.data?.fileName ?? t('common.formatFile') }) : t('quotes.sourceEditedBody')}{t('quotes.placeholders')}{' '}{'{客户名} {报价单号} {合计} {行项目}'}{' '}{t('quotes.etcAreFilledAutomatically')}</div>
            <div dangerouslySetInnerHTML={{ __html: filled }} />
          </div>
        )
      })()}
      <style>{`
        @media print {
          button, .no-print, .ant-btn, .ant-select { display: none !important; }
          /* 打印只要主体文档，去掉一切操作栏/提示 */
          .print-only-doc { padding: 0 !important; max-width: none !important; margin: 0 !important; }
          .print-only-doc > *:not(.tpl-print-body) { display: none !important; }
          .print-only-doc .tpl-print-body .qtpl {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
            max-width: none !important;
          }
          @page { margin: 12mm; }
        }
      `}</style>
    </div>
  )
}
