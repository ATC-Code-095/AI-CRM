import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, DatePicker, Form, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { api } from '../../api/client'
import { useCurrencies } from '../../components/CurrencySelect'
import { t } from '../../i18n'

/** 常用币种（ISO 4217）；也可直接输入其他 3 位代码 */
const COMMON = ['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD', 'SGD', 'AUD', 'CAD', 'KRW', 'TWD', 'CHF']

/** 多币种：本位币、汇率（按日期生效）、重新折算 */
export function CurrencyCard({ className }: { className?: string }) {
  const { message, modal } = App.useApp()
  const qc = useQueryClient()
  const q = useCurrencies()
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ currency: string; rate: number; effectiveDate: dayjs.Dayjs }>()
  const base = q.data?.base ?? 'CNY'
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['currency'] })
    void qc.invalidateQueries({ queryKey: ['currency-auto'] })
  }
  const autoQ = useQuery({
    queryKey: ['currency-auto'],
    queryFn: () =>
      api<{ enabled: boolean; currencies: string[]; supported: string[]; lastRunAt?: string; lastDate?: string; lastError?: string | null; lastUpdated?: string[] }>(
        '/currency/auto',
      ),
  })
  const saveAuto = useMutation({
    mutationFn: (v: { enabled: boolean; currencies: string[] }) => api('/currency/auto', { method: 'PUT', body: JSON.stringify(v) }),
    onSuccess: refresh,
    onError: (e: Error) => message.error(e.message),
  })
  const runAuto = useMutation({
    mutationFn: () => api<{ lastError?: string | null; lastUpdated?: string[]; lastDate?: string }>('/currency/auto/run', { method: 'POST' }),
    onSuccess: (r) => {
      if (r.lastError) message.error(t('currency.autoFailed', { v: r.lastError }))
      else message.success(t('currency.autoUpdated', { n: r.lastUpdated?.length ?? 0, date: r.lastDate }))
      refresh()
    },
    onError: (e: Error) => message.error(e.message),
  })
  const auto = autoQ.data

  const setBase = useMutation({
    mutationFn: (currency: string) => api('/currency/base', { method: 'PUT', body: JSON.stringify({ currency }) }),
    onSuccess: () => {
      message.success(t('common.save'))
      refresh()
    },
    onError: (e: Error) => message.error(e.message),
  })
  const addRate = useMutation({
    mutationFn: (v: { currency: string; rate: number; effectiveDate: dayjs.Dayjs }) =>
      api('/currency/rates', {
        method: 'POST',
        body: JSON.stringify({
          currency: v.currency.toUpperCase(),
          rate: String(v.rate),
          effectiveDate: v.effectiveDate.format('YYYY-MM-DD'),
        }),
      }),
    onSuccess: () => {
      message.success(t('common.save'))
      setOpen(false)
      refresh()
    },
    onError: (e: Error) => message.error(e.message),
  })
  const removeRate = useMutation({
    mutationFn: (id: string) => api(`/currency/rates/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e: Error) => message.error(e.message),
  })
  const recompute = useMutation({
    mutationFn: () => api<Record<string, number>>('/currency/recompute', { method: 'POST' }),
    onSuccess: (r) => message.success(t('currency.recomputed', { n: Object.values(r).reduce((a, b) => a + b, 0) })),
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Card
      size="small"
      className={className}
      title={t('currency.title')}
      loading={q.isLoading}
      extra={
        <Space size={6}>
          <Button
            size="small"
            onClick={() =>
              modal.confirm({
                title: t('currency.recompute'),
                content: t('currency.recomputeHint'),
                onOk: () => recompute.mutateAsync(),
              })
            }
          >
            {t('currency.recompute')}
          </Button>
          <Button
            type="primary"
            size="small"
            onClick={() => {
              form.setFieldsValue({ currency: 'USD', rate: undefined, effectiveDate: dayjs() })
              setOpen(true)
            }}
          >
            {t('currency.addRate')}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('currency.intro', { v: base })}
      </Typography.Paragraph>
      <Space style={{ marginBottom: 12 }}>
        <span>{t('currency.base')}</span>
        <Select
          style={{ width: 140 }}
          value={base}
          disabled={(q.data?.rates.length ?? 0) > 0}
          loading={setBase.isPending}
          onChange={(v: string) => setBase.mutate(v)}
          options={COMMON.map((c) => ({ value: c, label: c }))}
        />
        {(q.data?.rates.length ?? 0) > 0 && <span className="crm-muted">{t('currency.baseLocked')}</span>}
      </Space>
      <Space wrap style={{ marginBottom: 12 }}>
        <span>{t('currency.auto')}</span>
        <Switch
          checked={auto?.enabled}
          loading={saveAuto.isPending}
          onChange={(on) => saveAuto.mutate({ enabled: on, currencies: auto?.currencies ?? [] })}
        />
        <Select
          mode="multiple"
          style={{ minWidth: 260 }}
          placeholder={t('currency.autoCurrencies')}
          value={auto?.currencies ?? []}
          onChange={(v: string[]) => saveAuto.mutate({ enabled: auto?.enabled ?? false, currencies: v })}
          options={(auto?.supported ?? []).filter((c) => c !== base).map((c) => ({ value: c, label: c }))}
        />
        <Button size="small" loading={runAuto.isPending} onClick={() => runAuto.mutate()}>
          {t('currency.autoRun')}
        </Button>
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -4 }}>
        {t('currency.autoHint')}
        {auto?.lastRunAt && ` ${t('currency.autoLast', { at: new Date(auto.lastRunAt).toLocaleString(), date: auto.lastDate ?? '-' })}`}
      </Typography.Paragraph>
      {auto?.lastError && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('currency.autoFailed', { v: auto.lastError })} />}
      <Table
        rowKey="id"
        size="small"
        pagination={{ pageSize: 10, hideOnSinglePage: true }}
        dataSource={q.data?.rates ?? []}
        columns={[
          { title: t('currency.currency'), dataIndex: 'currency' },
          { title: t('currency.rate', { v: base }), dataIndex: 'rate', render: (v: string, r) => `1 ${r.currency} = ${Number(v)} ${base}` },
          { title: t('currency.effectiveDate'), dataIndex: 'effectiveDate' },
          {
            title: t('currency.source'),
            dataIndex: 'source',
            render: (v?: string) => (v === 'ECB' ? <Tag color="blue">{t('currency.sourceEcb')}</Tag> : <Tag>{t('currency.sourceManual')}</Tag>),
          },
          {
            title: t('common.actions'),
            render: (_: unknown, r) => (
              <Popconfirm title={t('currency.confirmDelete')} onConfirm={() => removeRate.mutate(r.id)}>
                <Button size="small" type="link" danger>
                  {t('common.delete')}
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal
        open={open}
        title={t('currency.addRate')}
        onCancel={() => setOpen(false)}
        onOk={() => void form.validateFields().then((v) => addRate.mutate(v))}
        confirmLoading={addRate.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="currency"
            label={t('currency.currency')}
            rules={[{ required: true, pattern: /^[A-Za-z]{3}$/, message: t('currency.codeHint') }]}
          >
            <Select
              showSearch
              options={COMMON.filter((c) => c !== base).map((c) => ({ value: c, label: c }))}
            />
          </Form.Item>
          <Form.Item
            name="rate"
            label={t('currency.rate', { v: base })}
            rules={[{ required: true, message: t('validation.required') }]}
            extra={t('currency.rateHint', { v: base })}
          >
            <InputNumber style={{ width: '100%' }} min={0.00000001} step={0.01} />
          </Form.Item>
          <Form.Item
            name="effectiveDate"
            label={t('currency.effectiveDate')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
