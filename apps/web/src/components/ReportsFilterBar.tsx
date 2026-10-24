import { Button, DatePicker, Drawer, Grid, Select, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import { useState } from 'react'
import { getAccessToken, apiUrl } from '../api/client'
import { t } from '../i18n'

export type ReportDays = 7 | 30 | 90 | 180

/** 报表通用筛选条：时间范围 + 导出（移动端折叠为抽屉） */
export function ReportsFilterBar({
  days,
  onDaysChange,
  month,
  onMonthChange,
  exportPath,
  exportName,
  extra,
}: {
  days?: ReportDays
  onDaysChange?: (d: ReportDays) => void
  month?: string
  onMonthChange?: (m: string) => void
  exportPath?: string
  exportName?: string
  extra?: React.ReactNode
}) {
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const [open, setOpen] = useState(false)

  const exportCsv = () => {
    if (!exportPath) return
    void fetch(apiUrl(`/api/v1${exportPath}`), {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = exportName || `report-${Date.now()}.csv`
        a.click()
        URL.revokeObjectURL(url)
      })
  }

  const controls = (
    <Space wrap>
      {onDaysChange && (
        <Select
          size="small"
          style={{ width: 110 }}
          value={days}
          onChange={(v) => {
            onDaysChange(v as ReportDays)
            if (isMobile) setOpen(false)
          }}
          options={[
            { value: 7, label: t('cmp.reportsFilterBar.last7Days') },
            { value: 30, label: t('cmp.reportsFilterBar.last30Days') },
            { value: 90, label: t('cmp.reportsFilterBar.last90Days') },
            { value: 180, label: t('cmp.reportsFilterBar.last180Days') },
          ]}
        />
      )}
      {onMonthChange && (
        <DatePicker
          size="small"
          picker="month"
          value={month ? dayjs(month) : undefined}
          onChange={(d) => onMonthChange(d ? d.format('YYYY-MM') : '')}
          allowClear
        />
      )}
      {extra}
    </Space>
  )

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
          padding: '8px 12px',
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e8edf5',
        }}
      >
        <Tag color="blue">{t('cmp.reportsFilterBar.filter')}</Tag>
        {isMobile ? (
          <Button size="small" onClick={() => setOpen(true)}>{t('cmp.reportsFilterBar.setConditions')}</Button>
        ) : (
          controls
        )}
        <span style={{ flex: 1 }} />
        {exportPath && (
          <Button size="small" onClick={exportCsv}>{t('common.exportCsv')}</Button>
        )}
      </div>
      <Drawer
        title={t('cmp.reportsFilterBar.filters')}
        placement="bottom"
        open={open}
        onClose={() => setOpen(false)}
        height={220}
      >
        {controls}
        {exportPath && (
          <Button
            block
            style={{ marginTop: 12 }}
            onClick={() => {
              exportCsv()
              setOpen(false)
            }}
          >{t('common.exportCsv')}</Button>
        )}
      </Drawer>
    </>
  )
}

/** SVG 图表导出为 PNG */
export function exportSvgAsPng(svg: SVGSVGElement, filename: string) {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const bbox = svg.getBoundingClientRect()
  clone.setAttribute('width', String(bbox.width || 360))
  clone.setAttribute('height', String(bbox.height || 120))
  const xml = new XMLSerializer().serializeToString(clone)
  const svg64 = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = (bbox.width || 360) * 2
    canvas.height = (bbox.height || 120) * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }
  img.src = svg64
}
