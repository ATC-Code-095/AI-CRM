import { useQuery } from '@tanstack/react-query'
import { App, Button, Select, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { useParams } from 'react-router-dom'
import { api } from '../../api/client'
import { downloadHtmlDoc, fillTemplatePlaceholders, toChineseAmount } from '../../utils/docExport'
import { t } from '../../i18n'

/** 合同打印：/contracts/:id/print */
export default function ContractPrintPage() {
  const { message } = App.useApp()
  const { id } = useParams()
  const [tplId, setTplId] = useState<string | undefined>()
  const tplQ = useQuery({
    queryKey: ['contract-templates'],
    queryFn: () =>
      api<{ items: { id: string; name: string; terms?: string; file?: { fileName?: string } }[] }>(
        '/contract-templates',
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
      api<{ content: string; hasFile?: boolean }>(`/contract-templates/${tplId}/content`),
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
  const { data } = useQuery({
    queryKey: ['contract-print', id],
    queryFn: () =>
      api<{
        contractNo: string
        title: string
        status: string
        total: string
        receivedAmount: string
        currency?: string
        signDate: string | null
        effectiveDate: string | null
        expireDate: string | null
        terms: string | null
        remark?: string | null
        templateId?: string | null
        account?: { name: string; phone?: string; address?: string; shortName?: string }
        owner?: { name?: string; phone?: string; email?: string }
        lines: { id: string; name: string; qty: string; unitPrice: string; amount: string }[]
      }>(`/contracts/${id}`),
    enabled: !!id,
    retry: false,
  })
  // 默认选中合同关联的模板
  useEffect(() => {
    if (data?.templateId && !tplId) setTplId(data.templateId)
  }, [data?.templateId, tplId])

  if (!data) return null
  const hasTpl = !!(tplContent.data?.content || (tplHtml.data?.html && !tplHtml.data?.lowQuality))

  const buildFilledHtml = () => {
    const savedHtml = tplContent.data?.content?.trim() || ''
    const fileHtml = tplHtml.data?.lowQuality ? '' : (tplHtml.data?.html ?? '').trim()
    const body = savedHtml || fileHtml
    const lineAmt = (l: { qty: string; unitPrice: string; amount: string }) => {
      const a = Number(l.amount)
      if (a > 0) return a
      return Number(l.qty || 0) * Number(l.unitPrice || 0)
    }
    const sumFromLines = data.lines.reduce((s, l) => s + lineAmt(l), 0)
    const totalVal = Number(data.total) > 0 ? Number(data.total) : sumFromLines
    const linesHtml =
      '<table class="tpl-lines" border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">' +
      t('contracts.itemQtyUnitPrice') +
      data.lines
        .map(
          (l) =>
            `<tr><td>${l.name}</td><td>${l.qty}</td><td>${Number(l.unitPrice).toFixed(2)}</td><td>${lineAmt(l).toFixed(2)}</td></tr>`,
        )
        .join('') +
      t('contracts.total', { v: totalVal.toFixed(2) })
    if (!body) return ''
    let filled = fillTemplatePlaceholders(body, {
      客户名: data.account?.name,
      甲方: data.account?.name,
      乙方: '苏州中迪信息科技有限公司',
      销售公司: '苏州中迪信息科技有限公司',
      甲方全称: data.account?.name,
      乙方全称: '苏州中迪信息科技有限公司',
      客户电话: data.account?.phone,
      客户地址: data.account?.address,
      合同号: data.contractNo,
      合同编号: data.contractNo,
      标题: data.title,
      合同名称: data.title,
      合同总额: totalVal.toFixed(2),
      大写金额: toChineseAmount(totalVal),
      大写: toChineseAmount(totalVal),
      人民币大写: toChineseAmount(totalVal),
      金额: totalVal.toFixed(2),
      合计: totalVal.toFixed(2),
      总额: totalVal.toFixed(2),
      币种: data.currency ?? 'CNY',
      签署日期: data.signDate?.slice(0, 10) ?? dayjs().format('YYYY-MM-DD'),
      日期: dayjs().format('YYYY-MM-DD'),
      生效日期: data.effectiveDate?.slice(0, 10) ?? '—',
      到期日期: data.expireDate?.slice(0, 10) ?? '—',
      行项目: linesHtml,
      产品明细: linesHtml,
      明细表: linesHtml,
    } as Record<string, string | number | null | undefined>)
    const hasLineSlot =
      body.includes('{行项目}') || body.includes('{产品明细}') || body.includes('{明细表}')
    if (!hasLineSlot) filled = filled + '<div style="margin-top:16px">' + linesHtml + '</div>'
    return filled
  }
  return (
    <div
      className={tplContent.data?.content || (tplHtml.data?.html && !tplHtml.data?.lowQuality) ? 'print-only-doc' : ''}
      style={{ maxWidth: 860, margin: '0 auto', padding: 24, background: '#fff', fontFamily: 'system-ui' }}
    >
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>{t('contracts.salesContract2')}</Typography.Title>
          <Typography.Text type="secondary">{data.contractNo}</Typography.Text>
        </div>
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
              if (html) downloadHtmlDoc(html, t('contracts.contract', { contractNo: data.contractNo }), 'doc')
              else message.warning(t('common.pleaseSelectATemplate'))
            }}
          >{t('common.exportWord')}</Button>
          <Button type="primary" onClick={() => window.print()}>{t('common.printPdf')}</Button>
        </Space>
      </div>
      {!hasTpl ? (
        <div className="qtpl" style={{ fontFamily:"'Microsoft YaHei','PingFang SC',sans-serif", color:'#1e293b', fontSize:12.5, lineHeight:1.75 }}>
          <div style={{ textAlign:'center', padding:'12px 0 4px' }}>
            <div style={{ fontSize:22, fontWeight:700, letterSpacing:6, color:'#0f172a' }}>{t('contracts.salesContract3')}</div>
            <div style={{ fontSize:11, letterSpacing:3, color:'#64748b', marginTop:2 }}>SALES CONTRACT</div>
            <div style={{ width:56, height:3, background:'#0d9488', margin:'10px auto 0', borderRadius:2 }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', margin:'14px 0 8px', fontSize:12, color:'#334155' }}>
            <div>{t('contracts.contractNo')}<b style={{ color:'#0f172a' }}>{data.contractNo}</b></div>
            <div>{t('contracts.signedOn')}<b style={{ color:'#0f172a' }}>{data.signDate?.slice(0, 10) ?? '—'}</b></div>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', margin:'8px 0 16px' }}>
            <tr>
              <td style={{ width:'50%', verticalAlign:'top', padding:'12px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderLeft:'3px solid #0d9488' }}>
                <div style={{ fontSize:11, color:'#64748b', letterSpacing:1, marginBottom:6 }}>{t('contracts.partyABuyer')}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{data.account?.name ?? '-'}</div>
                {data.account?.phone ? <div style={{ marginTop:6, color:'#475569', fontSize:12 }}>{t('contracts.phone', { phone: data.account.phone })}</div> : null}
                {data.account?.address ? <div style={{ color:'#475569', fontSize:12 }}>{t('contracts.address', { address: data.account.address })}</div> : null}
              </td>
              <td style={{ width:12 }} />
              <td style={{ width:'50%', verticalAlign:'top', padding:'12px 14px', border:'1px solid #e2e8f0', borderLeft:'3px solid #2563eb' }}>
                <div style={{ fontSize:11, color:'#64748b', letterSpacing:1, marginBottom:6 }}>{t('contracts.partyBSeller')}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>苏州中迪信息科技有限公司</div>
                {data.owner?.phone ? <div style={{ marginTop:6, color:'#475569', fontSize:12 }}>{t('contracts.phone', { phone: data.owner.phone })}</div> : null}
                {data.owner?.email ? <div style={{ color:'#475569', fontSize:12 }}>{t('contracts.email', { email: data.owner.email })}</div> : null}
              </td>
            </tr>
          </table>
          <div style={{ margin:'4px 0 8px', padding:'10px 14px', background:'#f1f5f9', borderLeft:'3px solid #1e3a5f' }}>
            <div style={{ fontSize:11, color:'#64748b', letterSpacing:1 }}>{t('contracts.title')}</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginTop:2 }}>{data.title}</div>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1e3a5f', color:'#fff' }}>
                <th style={{ padding:'9px 6px', fontWeight:600, width:40 }}>No.</th>
                <th style={{ padding:'9px 6px', fontWeight:600 }}>{t('contracts.item')}</th>
                <th style={{ padding:'9px 6px', fontWeight:600, width:64 }}>Qty.<br/>{t('common.qty')}</th>
                <th style={{ padding:'9px 6px', fontWeight:600, width:88 }}>Unit Price<br/>{t('common.unitPrice')}</th>
                <th style={{ padding:'9px 6px', fontWeight:600, width:88 }}>Amount<br/>{t('audit.field.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l, i) => (
                <tr key={l.id} style={i % 2 === 1 ? { background:'#f8fafc' } : undefined}>
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #e2e8f0', textAlign:'center', color:'#64748b' }}>{i + 1}</td>
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #e2e8f0', color:'#0f172a', fontWeight:500 }}>{l.name}</td>
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #e2e8f0', textAlign:'center' }}>{l.qty}</td>
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #e2e8f0', textAlign:'right' }}>{Number(l.unitPrice).toFixed(2)}</td>
                  <td style={{ padding:'9px 8px', borderBottom:'1px solid #e2e8f0', textAlign:'right', fontWeight:600 }}>{(Number(l.amount) > 0 ? Number(l.amount) : Number(l.qty || 0) * Number(l.unitPrice || 0)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <tr>
              <td style={{ padding:'8px 10px' }} />
              <td style={{ padding:'8px 10px', textAlign:'right', color:'#64748b', width:200 }}>{t('contracts.received2')}</td>
              <td style={{ padding:'8px 12px', textAlign:'right', width:120 }}>{Number(data.receivedAmount).toFixed(2)}</td>
            </tr>
            <tr>
              <td style={{ padding:'6px 10px' }} />
              <td style={{ padding:'6px 10px', textAlign:'right', color:'#64748b' }}>{t('contracts.outstanding')}</td>
              <td style={{ padding:'6px 12px', textAlign:'right', color:'#dc2626' }}>{(Number(data.total) - Number(data.receivedAmount)).toFixed(2)}</td>
            </tr>
            <tr>
              <td style={{ padding:10 }} />
              <td style={{ padding:10, textAlign:'right', color:'#0f172a', fontSize:13, fontWeight:700 }}>{t('contracts.total2')}</td>
              <td style={{ padding:'10px 12px', textAlign:'right', fontSize:16, fontWeight:700, color:'#fff', background:'#0d9488' }}>{Number(data.total).toFixed(2)}</td>
            </tr>
          </table>
          {data.terms ? (
            <div style={{ marginTop:16, padding:'12px 14px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6 }}>
              <div style={{ fontWeight:700, color:'#0f172a', marginBottom:6, fontSize:12, letterSpacing:1 }}>{t('contracts.terms')}</div>
              <div style={{ color:'#475569', fontSize:12, lineHeight:1.9, whiteSpace:'pre-wrap' }}>{data.terms}</div>
            </div>
          ) : null}
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:14 }}>
            <tr>
              <td style={{ padding:'8px 10px', background:'#f1f5f9', width:90, fontWeight:600, color:'#334155', border:'1px solid #e2e8f0' }}>{t('contracts.effectiveDate')}</td>
              <td style={{ padding:'8px 12px', border:'1px solid #e2e8f0' }}>{data.effectiveDate?.slice(0, 10) ?? '—'}</td>
              <td style={{ padding:'8px 10px', background:'#f1f5f9', width:90, fontWeight:600, color:'#334155', border:'1px solid #e2e8f0' }}>{t('contracts.expiryDate')}</td>
              <td style={{ padding:'8px 12px', border:'1px solid #e2e8f0' }}>{data.expireDate?.slice(0, 10) ?? '—'}</td>
            </tr>
          </table>
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:28 }}>
            <tr>
              <td style={{ width:'48%', verticalAlign:'top' }}>
                <div style={{ color:'#64748b', fontSize:11, letterSpacing:1, marginBottom:8 }}>{t('contracts.partyASeal')}</div>
                <div style={{ fontWeight:700, color:'#0f172a', fontSize:13 }}>{data.account?.name ?? '-'}</div>
                <div style={{ marginTop:36, borderTop:'1px solid #cbd5e1', width:180 }} />
                <div style={{ marginTop:8, color:'#64748b', fontSize:12 }}>{t('contracts.authorizedSignature')}</div>
                <div style={{ marginTop:10, color:'#64748b', fontSize:12 }}>{t('common.date2')}</div>
              </td>
              <td style={{ width:'4%' }} />
              <td style={{ width:'48%', verticalAlign:'top' }}>
                <div style={{ color:'#64748b', fontSize:11, letterSpacing:1, marginBottom:8 }}>{t('contracts.partyBSeal')}</div>
                <div style={{ fontWeight:700, color:'#0f172a', fontSize:13 }}>苏州中迪信息科技有限公司</div>
                <div style={{ marginTop:36, borderTop:'1px solid #cbd5e1', width:180 }} />
                <div style={{ marginTop:8, color:'#64748b', fontSize:12 }}>{t('contracts.authorizedSignature')}</div>
                <div style={{ marginTop:10, color:'#64748b', fontSize:12 }}>{t('common.date2')}</div>
              </td>
            </tr>
          </table>
        </div>
      ) : null}
      {(() => {
        const savedHtml = tplContent.data?.content?.trim() || ''
        const fileHtml = tplHtml.data?.lowQuality ? '' : (tplHtml.data?.html ?? '').trim()
        const body = savedHtml || fileHtml
        // 行金额兜底：amount 为 0 时按 数量×单价 重算
        const lineAmt = (l: { qty: string; unitPrice: string; amount: string }) => {
          const a = Number(l.amount)
          if (a > 0) return a
          return Number(l.qty || 0) * Number(l.unitPrice || 0)
        }
        const sumFromLines = data.lines.reduce((s, l) => s + lineAmt(l), 0)
        const totalVal = Number(data.total) > 0 ? Number(data.total) : sumFromLines
        const linesHtml =
          '<table class="tpl-lines" border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">' +
          t('contracts.itemQtyUnitPrice') +
          data.lines
            .map(
              (l) =>
                `<tr><td>${l.name}</td><td>${l.qty}</td><td>${Number(l.unitPrice).toFixed(2)}</td><td>${lineAmt(l).toFixed(2)}</td></tr>`,
            )
            .join('') +
          t('contracts.total', { v: totalVal.toFixed(2) })
        if (!body) {
          return tplHtml.data?.lowQuality ? (
            <div
              style={{
                marginTop: 20,
                padding: 12,
                background: '#fff7ed',
                border: '1px solid #fdba74',
                borderRadius: 8,
                color: '#9a3412',
                fontSize: 13,
              }}
            >{t('common.formatFile2')}{tplHtml.data?.fileName ?? t('common.templateFile')}{t('contracts.isALegacyXls')}</div>
          ) : null
        }
        let filled = fillTemplatePlaceholders(body, {
          客户名: data.account?.name,
          甲方: data.account?.name,
          乙方: '苏州中迪信息科技有限公司',
          销售公司: '苏州中迪信息科技有限公司',
          甲方全称: data.account?.name,
          乙方全称: '苏州中迪信息科技有限公司',
          客户简称: data.account?.shortName,
          客户电话: data.account?.phone,
          客户地址: data.account?.address,
          联系电话: data.account?.phone,
          联系地址: data.account?.address,
          合同号: data.contractNo,
          合同编号: data.contractNo,
          单号: data.contractNo,
          标题: data.title,
          合同名称: data.title,
          名称: data.title,
          金额: totalVal.toFixed(2),
          合计: totalVal.toFixed(2),
          合同总额: totalVal.toFixed(2),
          大写金额: toChineseAmount(totalVal),
          大写: toChineseAmount(totalVal),
          人民币大写: toChineseAmount(totalVal),
          总额: totalVal.toFixed(2),
          已收款: data.receivedAmount,
          已收金额: data.receivedAmount,
          待收款: (Number(data.total) - Number(data.receivedAmount)).toFixed(2),
          待收金额: (Number(data.total) - Number(data.receivedAmount)).toFixed(2),
          币种: data.currency ?? 'CNY',
          状态: data.status,
          日期: dayjs().format('YYYY-MM-DD'),
          打印日期: dayjs().format('YYYY-MM-DD'),
          签署日期: data.signDate?.slice(0, 10) ?? dayjs().format('YYYY-MM-DD'),
          生效日期: data.effectiveDate?.slice(0, 10) ?? '—',
          到期日期: data.expireDate?.slice(0, 10) ?? '—',
          有效期: data.expireDate?.slice(0, 10) ?? '—',
          销售: data.owner?.name,
          销售员: data.owner?.name,
          负责人: data.owner?.name,
          联系人: data.owner?.name,
          销售电话: data.owner?.phone,
          销售邮箱: data.owner?.email,
          条款: data.terms,
          备注: data.remark,
          行项目: linesHtml,
          产品明细: linesHtml,
          明细表: linesHtml,
        } as Record<string, string | number | null | undefined>)
        const hasLineSlot =
          body.includes('{行项目}') || body.includes('{产品明细}') || body.includes('{明细表}')
        if (!hasLineSlot) {
          filled = filled + '<div style="margin-top:16px">' + linesHtml + '</div>'
        }
        return (
          <div className="tpl-print-body" style={{ marginTop: 16 }}>
            <div
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
              {!savedHtml && fileHtml ? t('common.sourceFile', { v: tplHtml.data?.fileName ?? t('common.formatFile') }) : ''}
            </div>
            <div dangerouslySetInnerHTML={{ __html: filled }} />
          </div>
        )
      })()}
      <style>{`
        @media print {
          button, .no-print, .ant-btn, .ant-select { display: none !important; }
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
