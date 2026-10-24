import { Dropdown, Input, Select, Space } from 'antd'
import type { FilterOp } from './ErpTable'
import { t } from '../i18n'

/** 运算符图标（对齐 Infor 物料列表筛选菜单） */
export const OP_META: Record<
  FilterOp,
  { label: string; icon: string }
> = {
  eq: { label: t('cmp.filterOpPicker.equals'), icon: '=' },
  ne: { label: t('cmp.filterOpPicker.notEqual'), icon: '≠' },
  startsWith: { label: t('cmp.filterOpPicker.startsWith'), icon: '[A' },
  gte: { label: t('cmp.filterOpPicker.greaterThanOrEqual'), icon: '≥' },
  lte: { label: t('cmp.filterOpPicker.lessThanOrEqual'), icon: '≤' },
  gt: { label: t('cmp.filterOpPicker.greaterThan'), icon: '>' },
  lt: { label: t('cmp.filterOpPicker.lessThan'), icon: '<' },
  // 中文对照截图：开头不是 / 包含 / 不包含 / 结尾是 / 结尾不是
  contains: { label: t('cmp.filterOpPicker.contains'), icon: '[A]' },
  notContains: { label: t('cmp.filterOpPicker.doesNotContain'), icon: '[x]' },
  endsWith: { label: t('cmp.filterOpPicker.endsWith'), icon: 'Aj' },
  empty: { label: t('cmp.filterOpPicker.isEmpty'), icon: '∅' },
  notEmpty: { label: t('cmp.filterOpPicker.isNotEmpty'), icon: '◎' },
}

const ORDER: FilterOp[] = [
  'eq',
  'ne',
  'startsWith',
  'gte',
  'lte',
  'gt',
  'lt',
  'contains',
  'notContains',
  'endsWith',
  'empty',
  'notEmpty',
]

export function FilterOpPicker({
  value,
  onChange,
  numberOnly,
}: {
  value: FilterOp
  onChange: (op: FilterOp) => void
  numberOnly?: boolean
}) {
  const items = (numberOnly
    ? ORDER.filter((o) => ['contains', 'eq', 'ne', 'gte', 'lte', 'gt', 'lt', 'empty', 'notEmpty'].includes(o))
    : ORDER
  ).map((op) => ({
    key: op,
    label: (
      <Space size={8}>
        <span className="erp-op-icon">{OP_META[op].icon}</span>
        <span>{OP_META[op].label}</span>
      </Space>
    ),
  }))
  const meta = OP_META[value] ?? OP_META.contains
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items,
        selectable: true,
        selectedKeys: [value],
        onClick: ({ key }) => onChange(key as FilterOp),
      }}
    >
      <button type="button" className="erp-op-btn" title={meta.label}>
        {meta.icon}
      </button>
    </Dropdown>
  )
}

/** 列筛选：运算符徽标 + 输入框（Infor 风格） */
export function ColumnFilterInput({
  op,
  value,
  onOpChange,
  onValueChange,
  numberOnly,
  options,
  mode,
}: {
  op: FilterOp
  value: string
  onOpChange: (op: FilterOp) => void
  onValueChange: (v: string) => void
  numberOnly?: boolean
  options?: { value: string; label: string }[]
  mode?: 'text' | 'select'
}) {
  if (mode === 'select') {
    return (
      <Select
        size="small"
        allowClear
        placeholder={t('common.all')}
        style={{ width: '100%' }}
        value={value || undefined}
        options={options ?? []}
        onChange={(v) => onValueChange(v == null ? '' : String(v))}
      />
    )
  }
  const disabled = op === 'empty' || op === 'notEmpty'
  return (
    <div className="erp-op-filter">
      <FilterOpPicker value={op} onChange={onOpChange} numberOnly={numberOnly} />
      <Input
        size="small"
        className="erp-op-input"
        placeholder={numberOnly ? '0' : '[A]'}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
      />
    </div>
  )
}
