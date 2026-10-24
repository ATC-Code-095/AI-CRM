import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
} from 'antd'
import { useUrlState } from '../../hooks/useUrlState'
import { useState } from 'react'
import { api } from '../../api/client'
import { ErpListShell } from '../../components/ErpListShell'
import { ErpTable } from '../../components/ErpTable'
import { t } from '../../i18n'

interface PriceRow {
  id: string
  priceBookName: string
  unitPrice: string
  currency: string
}

interface ProductRow {
  id: string
  code: string
  name: string
  category: string | null
  unit: string
  description?: string | null
  standardPrice: string
  cost: string | null
  taxRate: string
  isActive: boolean
  prices: PriceRow[]
}

export default function ProductsPage() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editRow, setEditRow] = useState<ProductRow | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [priceOpen, setPriceOpen] = useState(false)
  const [priceProduct, setPriceProduct] = useState<ProductRow | null>(null)
  const [search, setSearch] = useUrlState('q')
  const [density, setDensity] = useState<'small' | 'middle'>('small')
  const [form] = Form.useForm()
  const [priceForm] = Form.useForm()

  const listQ = useQuery({
    queryKey: ['price-books'],
    queryFn: () =>
      api<{ books: string[]; products: ProductRow[] }>('/price-books'),
    retry: false,
  })

  const saveM = useMutation({
    mutationFn: (v: Record<string, unknown>) => {
      if (editRow) {
        return api(`/products/${editRow.id}`, { method: 'PATCH', body: JSON.stringify(v) })
      }
      return api('/products', {
        method: 'POST',
        body: JSON.stringify({
          code: v.code,
          name: v.name,
          category: v.category,
          unit: v.unit,
          standardPrice: String(v.standardPrice ?? 0),
          cost: v.cost != null ? String(v.cost) : null,
          taxRate: String(v.taxRate ?? 0),
          description: v.description,
        }),
      })
    },
    onSuccess: () => {
      message.success(t('common.saved'))
      setOpen(false)
      setFlashId(editRow?.id ?? null)
      setTimeout(() => setFlashId(null), 1500)
      setEditRow(null)
      form.resetFields()
      void qc.invalidateQueries({ queryKey: ['price-books'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  const priceM = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api(`/products/${priceProduct!.id}/prices`, {
        method: 'POST',
        body: JSON.stringify({
          priceBookName: v.priceBookName,
          unitPrice: String(v.unitPrice ?? 0),
          currency: v.currency ?? 'CNY',
        }),
      }),
    onSuccess: () => {
      message.success(t('products.priceSaved'))
      setPriceOpen(false)
      priceForm.resetFields()
      void qc.invalidateQueries({ queryKey: ['price-books'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <div>
      <ErpListShell
        program="mtprd0001"
        title={t('products.priceBook')}
        subtitle={t('products.masterDataProductCatalog')}
        search={search}
        onSearch={setSearch}
        density={density}
        onDensityChange={setDensity}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['price-books'] })}
        onCreate={() => {
          setEditRow(null)
          form.resetFields()
          form.setFieldsValue({ taxRate: 0 })
          setOpen(true)
        }}
        createLabel={t('products.newProduct')}
      >
        <ErpTable<ProductRow & Record<string, unknown>>
          rowKey="id"
          storageKey="products"
          flashId={flashId}
          loading={listQ.isLoading}
          onRowClick={(r) => {
            const row = r as unknown as ProductRow
            setEditRow(row)
            form.setFieldsValue({
              code: row.code,
              name: row.name,
              category: row.category,
              unit: row.unit,
              standardPrice: Number(row.standardPrice),
              cost: row.cost != null ? Number(row.cost) : null,
              taxRate: Number(row.taxRate),
              description: row.description ?? undefined,
            })
            setOpen(true)
          }}
          dataSource={(listQ.data?.products ?? []) as unknown as (ProductRow &
            Record<string, unknown>)[]}
          pageSize={12}
          columns={[
            {
              title: t('products.itemCode'),
              dataIndex: 'code',
              width: 160,
              filterType: 'text',
              sorter: true,
            },
            {
              title: t('products.itemDescription'),
              dataIndex: 'name',
              width: 200,
              filterType: 'text',
            },
            {
              title: t('products.itemType'),
              dataIndex: 'category',
              width: 110,
              filterType: 'select',
              filterOptions: [
                { value: '产品', label: t('common.products') },
                { value: '服务', label: t('nav.tickets') },
                { value: '实施', label: t('products.implementation') },
                { value: '硬件', label: t('products.hardware') },
              ],
              render: (v: unknown) =>
                v ? <Tag color="orange">{String(v)}</Tag> : <Tag>{t('common.products')}</Tag>,
            },
            {
              title: t('products.specDescription'),
              dataIndex: 'description',
              width: 180,
              filterType: 'text',
              render: (v: unknown) => (v ? String(v) : '-'),
            },
            {
              title: t('products.unit'),
              dataIndex: 'unit',
              width: 70,
              filterType: 'select',
              filterOptions: [
                { value: '个', label: t('products.text') },
                { value: '套', label: t('products.set') },
                { value: '人天', label: t('products.personDay') },
                { value: '年', label: t('products.year') },
              ],
            },
            {
              title: t('products.standardPrice'),
              dataIndex: 'standardPrice',
              width: 110,
              filterType: 'number',
              render: (v: unknown) => <b>{String(v)}</b>,
              sorter: true,
            },
            {
              title: t('products.costFloorPrice'),
              dataIndex: 'cost',
              width: 100,
              filterType: 'number',
              render: (v: unknown) => (v != null ? String(v) : '-'),
            },
            {
              title: t('products.taxRate'),
              dataIndex: 'taxRate',
              width: 80,
              render: (v: unknown) => `${(Number(v) * 100).toFixed(0)}%`,
            },
            {
              title: t('products.priceBooks'),
              dataIndex: 'prices',
              width: 160,
              filterType: 'select',
              filterOptions: [
                { value: 'standard', label: t('products.standardPriceBook') },
                { value: 'partner', label: t('products.channelPriceBook') },
                { value: 'vip', label: t('products.vipPriceBook') },
              ],
              render: (rows: unknown) => {
                const list = (rows as PriceRow[]) ?? []
                return (
                  <Space wrap size={4}>
                    {list.map((p) => (
                      <Tag key={p.id} color="geekblue" style={{ fontSize: 10 }}>
                        {p.priceBookName}:{p.unitPrice}
                      </Tag>
                    ))}
                    {!list.length && <span style={{ color: '#8b919a' }}>{t('products.standardPrice')}</span>}
                  </Space>
                )
              },
            },
            {
              title: t('audit.field.status'),
              dataIndex: 'isActive',
              width: 80,
              filterType: 'select',
              filterOptions: [
                { value: 'true', label: t('common.enabled2') },
                { value: 'false', label: t('common.disable') },
              ],
              render: (v: unknown) =>
                v ? <Tag color="green">{t('common.enabled2')}</Tag> : <Tag>{t('common.disable')}</Tag>,
            },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              width: 80,
              render: (_: unknown, r: ProductRow) => (
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPriceProduct(r)
                    priceForm.setFieldsValue({ priceBookName: 'partner', currency: 'CNY' })
                    setPriceOpen(true)
                  }}
                >{t('products.priceBook2')}</Button>
              ),
            },
          ]}
        />
      </ErpListShell>

      <Modal
        title={editRow ? t('products.editProduct') : t('products.newProduct')}
        open={open}
        onCancel={() => {
          setOpen(false)
          setEditRow(null)
        }}
        onOk={() => form.submit()}
        confirmLoading={saveM.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveM.mutate(v)}>
          <Form.Item name="code" label={t('common.code')} rules={[{ required: true }]}>
            <Input disabled={!!editRow} />
          </Form.Item>
          <Form.Item name="name" label={t('audit.field.name')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label={t('common.category2')}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('products.specification')}>
            <Input />
          </Form.Item>
          <Form.Item name="unit" label={t('products.unit')} initialValue="个">
            <Input />
          </Form.Item>
          <Form.Item name="standardPrice" label={t('products.standardSellingPrice')} rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="cost" label={t('products.costFloorPrice')} extra={t('products.discountedQuotePriceMay')}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="taxRate" label={t('products.taxRate')}>
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('products.setPriceBook', { v: priceProduct?.name ?? '' })}
        open={priceOpen}
        onCancel={() => setPriceOpen(false)}
        onOk={() => priceForm.submit()}
        confirmLoading={priceM.isPending}
      >
        <Form form={priceForm} layout="vertical" onFinish={(v) => priceM.mutate(v)}>
          <Form.Item name="priceBookName" label={t('products.priceBooks')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'standard', label: t('products.standardPriceBook') },
                { value: 'partner', label: t('products.channelPriceBook') },
                { value: 'vip', label: t('products.vipPriceBook') },
                { value: 'promotion', label: t('products.promotionalPriceBook') },
              ]}
            />
          </Form.Item>
          <Form.Item name="unitPrice" label={t('common.unitPrice')} rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="currency" label={t('common.currency')} initialValue="CNY">
            <Select options={['CNY', 'USD', 'EUR'].map((c) => ({ value: c, label: c }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
