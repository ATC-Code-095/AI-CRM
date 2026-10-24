import { useMutation } from '@tanstack/react-query'
import { App, Alert, Button, Card, Radio, Space, Steps, Table, Typography, Upload } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import { t } from '../../i18n'

type Preview = {
  headers: string[]
  mapped: string[]
  sample: string[][]
  totalRows: number
}

type ImportResult = { ok: number; failed: number; errors: string[] }

/** CSV 导入向导：选择对象 → 上传预览 → 导入 */
export default function ImportWizardPage() {
  const { message } = App.useApp()
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [kind, setKind] = useState<'leads' | 'contacts' | 'accounts'>('leads')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const previewM = useMutation({
    mutationFn: (text: string) =>
      api<Preview>('/import/preview', { method: 'POST', body: JSON.stringify({ csv: text }) }),
    onSuccess: (p) => {
      setPreview(p)
      setStep(1)
    },
    onError: (e: Error) => message.error(e.message),
  })

  const importM = useMutation({
    mutationFn: () =>
      api<ImportResult>(`/import/${kind}`, { method: 'POST', body: JSON.stringify({ csv }) }),
    onSuccess: (r) => {
      setResult(r)
      setStep(2)
      message.success(t('import.importCompleteSucceeded', { ok: r.ok }))
    },
    onError: (e: Error) => message.error(e.message),
  })

  const kindLabel = { leads: t('nav.leads'), contacts: t('nav.contacts'), accounts: t('nav.accounts') }[kind]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <Typography.Title level={3}>{t('import.csvImportWizard')}</Typography.Title>
      <Steps
        current={step}
        items={[{ title: t('import.chooseType') }, { title: t('import.previewData') }, { title: t('common.done') }]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <Card size="small">
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>{t('import.importAs')}</div>
              <Radio.Group
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={[
                  { value: 'leads', label: t('import.leads') },
                  { value: 'contacts', label: t('import.contacts') },
                  { value: 'accounts', label: t('import.accounts') },
                ]}
                optionType="button"
              />
            </div>
            <Alert
              type="info"
              showIcon
              message={t('import.csvHeadersAcceptChinese')}
              description={t('import.nameContactnamePhoneEmail')}
            />
            <Upload
              accept=".csv,text/csv"
              maxCount={1}
              beforeUpload={(f) => {
                const reader = new FileReader()
                reader.onload = () => {
                  const text = String(reader.result ?? '')
                  setCsv(text)
                  setFileName(f.name)
                  previewM.mutate(text)
                }
                reader.readAsText(f, 'utf-8')
                return false
              }}
            >
              <Button type="primary" loading={previewM.isPending}>{t('import.selectCsvFile')}</Button>
            </Upload>
            {fileName ? <Typography.Text>{t('import.selected', { fileName })}</Typography.Text> : null}
            <Button onClick={() => nav(-1)} style={{ alignSelf: 'flex-start' }}>{t('common.back')}</Button>
          </Space>
        </Card>
      )}

      {step === 1 && preview && (
        <Card size="small" title={t('import.previewRowsWillImport', { totalRows: preview.totalRows, kindLabel })}>
          <Table
            rowKey={(_r, i) => String(i)}
            size="small"
            pagination={false}
            dataSource={preview.sample}
            columns={preview.headers.map((h, i) => ({
              title: (
                <span>
                  {h}
                  {preview.mapped[i] ? (
                    <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 11 }}>
                      → {preview.mapped[i]}
                    </Typography.Text>
                  ) : null}
                </span>
              ),
              render: (_: unknown, r: string[]) => r[i] ?? '',
            }))}
          />
          <Space style={{ marginTop: 16 }}>
            <Button onClick={() => setStep(0)}>{t('import.previous')}</Button>
            <Button type="primary" loading={importM.isPending} onClick={() => importM.mutate()}>{t('import.importRows', { totalRows: preview.totalRows })}</Button>
          </Space>
        </Card>
      )}

      {step === 2 && result && (
        <Card size="small">
          <Space direction="vertical" size={12}>
            <Alert
              type={result.ok > 0 ? 'success' : 'warning'}
              showIcon
              message={t('import.importCompleteSucceededFailed', { ok: result.ok, failed: result.failed })}
            />
            {result.errors?.length ? (
              <div style={{ maxHeight: 160, overflow: 'auto', fontSize: 12, color: '#64748b' }}>
                {result.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            ) : null}
            <Space>
              <Button
                type="primary"
                onClick={() =>
                  nav(kind === 'leads' ? '/leads' : kind === 'contacts' ? '/contacts' : '/accounts')
                }
              >{t('import.viewList')}</Button>
              <Button
                onClick={() => {
                  setStep(0)
                  setCsv('')
                  setFileName('')
                  setPreview(null)
                  setResult(null)
                }}
              >{t('import.importAnother')}</Button>
            </Space>
          </Space>
        </Card>
      )}
    </div>
  )
}
