import { Card, Collapse, Tag, Typography } from 'antd'
import { t } from '../../i18n'

const PLACEHOLDERS = [
  ['{客户名} / {甲方}', t('platform.customerFullName')],
  ['{销售公司} / {乙方}', t('platform.ourCompanyName')],
  ['{报价单号} / {合同号}', t('platform.documentNumber')],
  ['{日期} / {签署日期}', t('platform.currentDate')],
  ['{合计} / {总额}', t('platform.totalAmount')],
  ['{小计} / {折扣} / {税额}', t('platform.amountBreakdown')],
  ['{已收款} / {待收款}', t('platform.contractPaymentsContracts')],
  ['{生效日期} / {到期日期}', t('platform.contractDatesContracts')],
  ['{销售} / {销售电话} / {销售邮箱}', t('platform.ownerInfo')],
  ['{客户电话} / {客户地址} / {客户邮箱}', t('platform.customerContactInfo')],
  ['{行项目} / {产品明细}', t('platform.insertProductDetailTable')],
  ['{条款}', t('platform.contractQuoteTermsBody')],
]

const STEPS = [
  [t('platform.n1CreateTemplate'), t('platform.contractQuoteListTemplates')],
  [t('platform.n2UploadFormatFile'), t('platform.clickUploadWordExcel')],
  [t('platform.n3EditBodyOptional'), t('platform.editBodyOpensA')],
  [t('platform.n4SubmitForApproval'), t('platform.templateListSubmitFor')],
  [t('platform.n5PrintWithTemplate'), t('platform.quoteContractPrintPage')],
  [t('platform.n6ShareWithCustomer'), t('platform.quoteDetailsGenerateCustomer')],
]

/** 模板使用说明 */
export default function TemplateGuidePage() {
  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 20 }}>
      <Typography.Title level={3}>{t('common.templateGuide')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('platform.contractQuoteTemplatesSupport')}</Typography.Paragraph>

      <Card size="small" title={t('platform.quickStart')} style={{ marginBottom: 16 }}>
        <Collapse
          defaultActiveKey={['0']}
          items={STEPS.map(([title, desc], i) => ({
            key: String(i),
            label: title,
            children: <div style={{ fontSize: 13, lineHeight: 1.8 }}>{desc}</div>,
          }))}
        />
      </Card>

      <Card size="small" title={t('platform.placeholderReference')} style={{ marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{t('platform.placeholder')}</th>
              <th style={{ padding: 8, textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>{t('platform.meaning')}</th>
            </tr>
          </thead>
          <tbody>
            {PLACEHOLDERS.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace' }}>
                  {k}
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card size="small" title={t('platform.formatSupport')} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <Tag color="green">.docx</Tag>{' '}{t('platform.headingLevelsBoldAlignment')}<br />
          <Tag color="green">.xlsx</Tag>{' '}{t('platform.rowsColumnsMergedCells')}<br />
          <Tag color="gold">.xls / .doc</Tag>{' '}{t('platform.legacyFormatParsingSave')}<br />
          <Tag color="blue">{t('common.print')}</Tag>{' '}{t('platform.onlyTheDocumentBody')}</div>
      </Card>

      <Card size="small" title={t('platform.faq')}>
        <Collapse
          items={[
            {
              key: '1',
              label: t('platform.whatIfThePrint'),
              children:
                t('platform.forLegacyXlsDoc'),
            },
            {
              key: '2',
              label: t('platform.howDoIMake'),
              children:
                t('platform.afterUploadingWordThe'),
            },
            {
              key: '3',
              label: t('platform.howDoIInsert'),
              children: t('platform.writeThePlaceholderIn'),
            },
            {
              key: '4',
              label: t('platform.whatIsTheTemplate'),
              children: t('platform.submitForApprovalAdmin'),
            },
          ]}
        />
      </Card>
    </div>
  )
}
