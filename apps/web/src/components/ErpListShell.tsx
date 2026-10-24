import { Button, Dropdown, Input, Space, Tag, Typography } from 'antd'
import {
  SearchOutlined,
  ColumnHeightOutlined,
  PlusOutlined,
  ReloadOutlined,
  ExportOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { t } from '../i18n'

/** Infor LN 风格列表外框：程序条 + 工具栏 + 数据区 */
export function ErpListShell({
  program,
  title,
  subtitle,
  onSearch,
  search,
  density,
  onDensityChange,
  onRefresh,
  onCreate,
  createLabel,
  onExport,
  extraActions,
  children,
}: {
  program?: string
  title: string
  subtitle?: string
  search?: string
  onSearch?: (v: string) => void
  density?: 'small' | 'middle'
  onDensityChange?: (d: 'small' | 'middle') => void
  onRefresh?: () => void
  onCreate?: () => void
  createLabel?: string
  onExport?: () => void
  extraActions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="erp-list">
      <div className="erp-program-bar">
        <span className="erp-program-id">{program || 'list0001'}</span>
        <span className="erp-program-title">{title}</span>
        {subtitle && <span className="erp-program-sub">{subtitle}</span>}
      </div>
      <div className="erp-toolbar">
        {onCreate && (
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            aria-label={createLabel || t('common.create')}
            title={createLabel || t('common.create')}
            onClick={onCreate}
          >
            {createLabel || t('common.create')}
          </Button>
        )}
        {onRefresh && (
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>{t('common.refresh')}</Button>
        )}
        {onExport && (
          <Button size="small" icon={<ExportOutlined />} onClick={onExport}>{t('common.export')}</Button>
        )}
        {extraActions}
        <Dropdown
          menu={{
            items: [
              { key: 'print', label: t('cmp.erpListShell.printList') },
              { key: 'export', label: t('common.exportCsv') },
              { key: 'cols', label: t('cmp.erpListShell.columnSettingsInTable') },
            ],
            onClick: ({ key }) => {
              if (key === 'print') window.print()
              else if (key === 'export') onExport?.()
              else if (key === 'cols') {
                document.querySelector<HTMLElement>('.erp-tool-btn')?.click()
              }
            },
          }}
        >
          <Button size="small">{t('common.actions')}{' '}<DownOutlined />
          </Button>
        </Dropdown>
        <span style={{ flex: 1 }} />
        {onSearch && (
          <Input
            allowClear
            size="small"
            prefix={<SearchOutlined />}
            placeholder={t('cmp.erpListShell.find')}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{ width: 200 }}
          />
        )}
        {onDensityChange && density && (
          <Button
            size="small"
            icon={<ColumnHeightOutlined />}
            onClick={() => onDensityChange(density === 'small' ? 'middle' : 'small')}
          >
            {density === 'small' ? t('common.compact') : t('common.comfortable')}
          </Button>
        )}
      </div>
      <div className="erp-grid">{children}</div>
      <div className="erp-grid-status">
        <Space size={12}>
          <Tag color="blue">{t('cmp.erpListShell.ready')}</Tag>
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('cmp.erpListShell.filterBelowHeadersSort')}</Typography.Text>
        </Space>
      </div>
    </div>
  )
}
