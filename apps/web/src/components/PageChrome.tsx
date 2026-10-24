import { Button, Input, Space, Typography } from 'antd'
import { SearchOutlined, ColumnHeightOutlined } from '@ant-design/icons'
import { t } from '../i18n'

/** 列表页标题栏：标题 + 说明 + 主操作 */
export function PageHeader({
  title,
  subtitle,
  actions,
  extra,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
        alignItems: 'center',
      }}
    >
      <div>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {subtitle && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {subtitle}
          </Typography.Text>
        )}
      </div>
      <Space wrap>
        {actions}
        {extra}
      </Space>
    </div>
  )
}

/** 列表工具条：搜索 + 密度 + 自定义列 + 主按钮 */
export function ListToolbar({
  search,
  onSearch,
  density,
  onDensityChange,
  actions,
  extra,
}: {
  search?: string
  onSearch?: (v: string) => void
  density?: 'small' | 'middle'
  onDensityChange?: (d: 'small' | 'middle') => void
  actions?: React.ReactNode
  extra?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        marginBottom: 12,
        padding: '8px 10px',
        background: '#fff',
        borderRadius: 10,
        border: '1px solid rgba(15,23,42,0.05)',
      }}
    >
      {onSearch && (
        <Input
          allowClear
          size="small"
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder={t('cmp.pageChrome.search')}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ width: 200 }}
        />
      )}
      {extra}
      <span style={{ flex: 1 }} />
      {onDensityChange && density && (
        <Button
          size="small"
          type="text"
          icon={<ColumnHeightOutlined />}
          onClick={() => onDensityChange(density === 'small' ? 'middle' : 'small')}
        >
          {density === 'small' ? t('common.compact') : t('common.comfortable')}
        </Button>
      )}
      {actions}
    </div>
  )
}
