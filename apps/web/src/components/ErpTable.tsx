import { App, Button, Checkbox, Dropdown, Input, Modal, Table } from 'antd'
import type { TableColumnsType } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isLoggedIn } from '../api/client'
import { ColumnFilterInput } from './FilterOpPicker'
import { t } from '../i18n'

/** 与 Infor / AG Grid 一致的筛选运算符 */
export type FilterOp =
  | 'eq'
  | 'ne'
  | 'startsWith'
  | 'contains'
  | 'notContains'
  | 'endsWith'
  | 'empty'
  | 'notEmpty'
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'

export interface ErpColumn<T> {
  title: string
  dataIndex: string
  width?: number
  filterType?: 'text' | 'select' | 'number'
  filterOptions?: { value: string; label: string }[]
  render?: (v: unknown, row: T, index: number) => React.ReactNode
  sorter?: boolean
  /** 固定不可隐藏 */
  fixed?: boolean
}

interface CellFilter {
  op: FilterOp
  value: string
}

function cellText(raw: unknown): string {
  return raw == null ? '' : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
}

function matchFilter(raw: unknown, f: CellFilter): boolean {
  const text = cellText(raw)
  const val = f.value.trim()
  const lt = text.toLowerCase()
  const lv = val.toLowerCase()
  switch (f.op) {
    case 'empty':
      return text === ''
    case 'notEmpty':
      return text !== ''
    case 'eq':
      return lt === lv
    case 'ne':
      return lt !== lv
    case 'startsWith':
      return lt.startsWith(lv)
    case 'endsWith':
      return lt.endsWith(lv)
    case 'notContains':
      return val ? !lt.includes(lv) : true
    case 'gte':
      return Number(text) >= Number(val)
    case 'lte':
      return Number(text) <= Number(val)
    case 'gt':
      return Number(text) > Number(val)
    case 'lt':
      return Number(text) < Number(val)
    case 'contains':
    default:
      return val ? lt.includes(lv) : true
  }
}

function loadColState(storageKey?: string): {
  order: string[]
  hidden: string[]
  widths: Record<string, number>
} {
  if (!storageKey) return { order: [], hidden: [], widths: {} }
  try {
    const raw = localStorage.getItem(`erp.cols.${storageKey}`)
    if (!raw) return { order: [], hidden: [], widths: {} }
    const v = JSON.parse(raw) as {
      order?: string[]
      hidden?: string[]
      widths?: Record<string, number>
    }
    return { order: v.order ?? [], hidden: v.hidden ?? [], widths: v.widths ?? {} }
  } catch {
    return { order: [], hidden: [], widths: {} }
  }
}

function saveColState(
  storageKey: string | undefined,
  order: string[],
  hidden: string[],
  widths?: Record<string, number>,
) {
  if (!storageKey) return
  try {
    localStorage.setItem(
      `erp.cols.${storageKey}`,
      JSON.stringify({ order, hidden, widths: widths ?? {} }),
    )
  } catch {
    /* ignore */
  }
}

/** 保存的列表视图（对标 Salesforce List Views：可跨设备、可共享给团队） */
type SavedView = {
  id: string
  name: string
  filters: Record<string, CellFilter>
  order: string[]
  hidden: string[]
  widths: Record<string, number>
  /** 共享给团队（写入 shared.list_views.*，同事只读可见） */
  shared?: boolean
  ownerName?: string
}

/** 离线兜底：服务端不可用时仍可在本机保存视图 */
function loadLocalViews(storageKey?: string): SavedView[] {
  if (!storageKey) return []
  try {
    const raw = localStorage.getItem(`erp.views.${storageKey}`)
    return raw ? (JSON.parse(raw) as SavedView[]) : []
  } catch {
    return []
  }
}

function saveLocalViews(storageKey: string | undefined, views: SavedView[]) {
  if (!storageKey) return
  try {
    localStorage.setItem(`erp.views.${storageKey}`, JSON.stringify(views))
  } catch {
    /* ignore */
  }
}

/** 视图偏好键：list_views.<列表>；共享键：shared.list_views.<列表> */
function viewPrefKeys(storageKey?: string) {
  const k = `list_views.${storageKey ?? 'default'}`
  return { mine: k, shared: `shared.${k}` }
}

/**
 * AG Grid / Infor 风格数据网格
 * - 表头筛选（运算符 + 值）
 * - 列拖拽排序、列显示/隐藏（记忆）
 * - 全选 / 行选 / 行跳转
 */
export function ErpTable<T extends Record<string, unknown>>({
  columns,
  dataSource,
  rowKey,
  loading,
  pageSize: pageSizeProp = 12,
  onRowClick,
  storageKey,
  onSelectionChange,
  batchBar,
  flashId,
}: {
  columns: ErpColumn<T>[]
  dataSource: T[]
  rowKey: string
  loading?: boolean
  pageSize?: number
  onRowClick?: (row: T) => void
  storageKey?: string
  /** 勾选变化回调，用于批量操作 */
  onSelectionChange?: (ids: string[], rows: T[]) => void
  /** 选中时显示的批量工具条 */
  batchBar?: (ids: string[], rows: T[], clear: () => void) => React.ReactNode
  /** 保存后闪绿的行 id */
  flashId?: string | null
}) {
  const saved = useMemo(() => loadColState(storageKey), [storageKey])
  const [pageSize, setPageSize] = useState(pageSizeProp)
  const [filters, setFilters] = useState<Record<string, CellFilter>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [order, setOrder] = useState<string[]>(saved.order)
  const [hidden, setHidden] = useState<string[]>(saved.hidden)
  const [widths, setWidths] = useState<Record<string, number>>(saved.widths)
  const [dragCol, setDragCol] = useState<string | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const resizeStart = useRef<{ key: string; x: number; w: number } | null>(null)
  const { message } = App.useApp()
  const qc = useQueryClient()
  const prefKeys = useMemo(() => viewPrefKeys(storageKey), [storageKey])
  const [views, setViews] = useState<SavedView[]>(() => loadLocalViews(storageKey))
  const [viewOpen, setViewOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewShared, setViewShared] = useState(false)
  const [activeView, setActiveView] = useState<string>('')

  // 我的视图（服务端优先，失败回落本地）
  const viewsQ = useQuery({
    queryKey: ['list-views', prefKeys.mine],
    queryFn: () =>
      api<{ value: SavedView[] | null }>(`/preferences?key=${encodeURIComponent(prefKeys.mine)}`),
    enabled: !!storageKey && isLoggedIn(),
    retry: false,
    staleTime: 30_000,
  })

  // 团队共享视图（只读）
  const sharedQ = useQuery({
    queryKey: ['shared-views', prefKeys.shared],
    queryFn: () =>
      api<{ items: { ownerName: string; value: SavedView[]; mine: boolean }[] }>(
        `/preferences/shared?key=${encodeURIComponent(prefKeys.shared)}`,
      ),
    enabled: !!storageKey && isLoggedIn(),
    retry: false,
    staleTime: 30_000,
  })

  const sharedViews = useMemo<SavedView[]>(() => {
    const out: SavedView[] = []
    for (const it of sharedQ.data?.items ?? []) {
      if (it.mine) continue
      for (const v of it.value ?? []) {
        out.push({ ...v, id: `shared-${it.ownerName}-${v.id}`, ownerName: it.ownerName, shared: true })
      }
    }
    return out
  }, [sharedQ.data])

  // 服务端视图同步到本地状态（首次为空时把本地旧视图迁移上去）
  useEffect(() => {
    const remote = viewsQ.data?.value
    if (!viewsQ.isFetched) return
    if (remote && remote.length) {
      setViews(remote)
      saveLocalViews(storageKey, remote)
      return
    }
    const local = loadLocalViews(storageKey)
    if (local.length) {
      setViews(local)
      void api('/preferences', {
        method: 'PUT',
        body: JSON.stringify({ key: prefKeys.mine, value: local }),
      }).catch(() => undefined)
    } else {
      setViews([])
    }
  }, [viewsQ.isFetched, viewsQ.data, storageKey, prefKeys.mine])

  const persistViews = (next: SavedView[], shared?: SavedView) => {
    setViews(next)
    saveLocalViews(storageKey, next)
    void api('/preferences', {
      method: 'PUT',
      body: JSON.stringify({ key: prefKeys.mine, value: next }),
    }).catch(() => message.warning(t('cmp.erpTable.viewSavedLocallyServer')))
    if (shared) {
      void api('/preferences', {
        method: 'PUT',
        body: JSON.stringify({ key: prefKeys.shared, value: [shared] }),
      }).then(() => void qc.invalidateQueries({ queryKey: ['shared-views', prefKeys.shared] }))
    }
  }

  const allKeys = columns.map((c) => c.dataIndex)
  const orderedKeys = useMemo(() => {
    const rest = allKeys.filter((k) => !order.includes(k))
    return [...order.filter((k) => allKeys.includes(k)), ...rest]
  }, [order, allKeys])

  const visibleColumns = useMemo(() => {
    return orderedKeys
      .map((k) => columns.find((c) => c.dataIndex === k))
      .filter((c): c is ErpColumn<T> => !!c && !hidden.includes(c.dataIndex))
  }, [orderedKeys, columns, hidden])

  const filtered = useMemo(() => {
    return dataSource.filter((row) =>
      columns.every((c) => {
        const f = filters[c.dataIndex]
        if (!f) return true
        if (f.op === 'empty' || f.op === 'notEmpty') return matchFilter(row[c.dataIndex], f)
        if (!f.value) return true
        return matchFilter(row[c.dataIndex], f)
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, filters])

  const ids = filtered.map((r) => String(r[rowKey]))
  const selectedCount = ids.filter((id) => selected[id]).length
  const allChecked = ids.length > 0 && selectedCount === ids.length
  const selectedIds = ids.filter((id) => selected[id])
  const selectedRows = filtered.filter((r) => selected[String(r[rowKey])])

  const clearSelection = () => setSelected({})

  // 选中变化时通知父组件
  useEffect(() => {
    onSelectionChange?.(selectedIds, selectedRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, filtered])

  const setFilter = (key: string, patch: Partial<CellFilter>) => {
    setFilters((prev) => {
      const cur = prev[key] ?? { op: 'contains' as FilterOp, value: '' }
      return {
        ...prev,
        [key]: { op: patch.op ?? cur.op, value: patch.value ?? cur.value },
      }
    })
  }

  const persist = (
    nextOrder: string[],
    nextHidden: string[],
    nextWidths?: Record<string, number>,
  ) => {
    saveColState(storageKey, nextOrder, nextHidden, nextWidths ?? widths)
  }

  const onResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const w = widths[key] ?? columns.find((c) => c.dataIndex === key)?.width ?? 120
    resizeStart.current = { key, x: e.clientX, w }
    setResizing(key)
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeStart.current) return
      const { key, x, w } = resizeStart.current
      const nextW = Math.max(56, Math.round(w + (e.clientX - x)))
      setWidths((prev) => ({ ...prev, [key]: nextW }))
    }
    const onUp = () => {
      if (resizeStart.current) {
        setWidths((prev) => {
          persist(order, hidden, prev)
          return prev
        })
      }
      resizeStart.current = null
      setResizing(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, hidden])

  const onDropCol = (targetKey: string) => {
    if (!dragCol || dragCol === targetKey) return
    const keys = [...orderedKeys]
    const from = keys.indexOf(dragCol)
    const to = keys.indexOf(targetKey)
    if (from < 0 || to < 0) return
    keys.splice(from, 1)
    keys.splice(to, 0, dragCol)
    setOrder(keys)
    persist(keys, hidden)
    setDragCol(null)
  }

  const toggleHide = (key: string) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
    setHidden(next)
    persist(order, next)
  }

  const applyView = (v: SavedView) => {
    setFilters(v.filters ?? {})
    setOrder(v.order ?? [])
    setHidden(v.hidden ?? [])
    setWidths(v.widths ?? {})
    saveColState(storageKey, v.order ?? [], v.hidden ?? [], v.widths ?? {})
    setActiveView(v.name)
    message.success(t('cmp.erpTable.switchedToView', { name: v.name }))
  }

  const saveCurrentView = () => {
    const name = viewName.trim()
    if (!name) {
      message.warning(t('cmp.erpTable.pleaseEnterAView'))
      return
    }
    const item: SavedView = {
      id: `v-${Date.now()}`,
      name,
      filters,
      order,
      hidden,
      widths,
      shared: viewShared,
    }
    const next = [...views.filter((x) => x.name !== name), item]
    persistViews(next, viewShared ? item : undefined)
    setActiveView(name)
    setViewName('')
    setViewShared(false)
    setViewOpen(false)
    message.success(viewShared ? t('cmp.erpTable.viewSavedAndShared') : t('cmp.erpTable.viewSaved'))
  }

  const deleteView = (id: string) => {
    persistViews(views.filter((v) => v.id !== id))
    message.success(t('cmp.erpTable.viewDeleted'))
  }

  const clearView = () => {
    setFilters({})
    setActiveView('')
    message.success(t('cmp.erpTable.filtersCleared'))
  }

  const antColumns: TableColumnsType<T> = [
    {
      title: (
        <Checkbox
          onClick={(e) => e.stopPropagation()}
          checked={allChecked}
          indeterminate={selectedCount > 0 && !allChecked}
          onChange={(e) => {
            const next: Record<string, boolean> = { ...selected }
            ids.forEach((id) => {
              if (e.target.checked) next[id] = true
              else delete next[id]
            })
            setSelected(next)
          }}
        />
      ),
      key: '__sel',
      width: 40,
      className: 'erp-col-sel',
      onHeaderCell: () => ({
        style: { width: 40, minWidth: 40, maxWidth: 40, padding: '4px 4px' },
      }),
      onCell: () => ({
        style: { width: 40, minWidth: 40, maxWidth: 40, padding: '4px 4px' },
      }),
      render: (_: unknown, row: T) => {
        const id = String(row[rowKey])
        return (
          <Checkbox
            // 阻止冒泡：点勾选不应触发「行点击进详情」
            onClick={(e) => e.stopPropagation()}
            checked={!!selected[id]}
            onChange={(e) => {
              setSelected((prev) => {
                const next = { ...prev }
                if (e.target.checked) next[id] = true
                else delete next[id]
                return next
              })
            }}
          />
        )
      },
    },
    // 可编辑列表才显示 → 编辑 列
    ...(onRowClick
      ? [
          {
            title: '',
            key: '__go',
            width: 28,
            className: 'erp-col-go',
            onHeaderCell: () => ({
              style: {
                width: 28,
                minWidth: 28,
                maxWidth: 28,
                padding: '4px 0',
                textAlign: 'center' as const,
              },
            }),
            onCell: () => ({
              style: {
                width: 28,
                minWidth: 28,
                maxWidth: 28,
                padding: '4px 0',
                textAlign: 'center' as const,
              },
            }),
            render: (_: unknown, row: T) => (
              <span
                className="erp-row-go"
                title={t('cmp.erpTable.openRowEditor')}
                onClick={(e) => {
                  e.stopPropagation()
                  onRowClick?.(row)
                }}
              >
                <span className="erp-row-go-arrow">→</span>
                <span className="erp-row-go-label">{t('common.edit')}</span>
              </span>
            ),
          },
        ]
      : []),
    ...visibleColumns.map((c, colIdx) => {
      const f = filters[c.dataIndex] ?? { op: 'contains' as FilterOp, value: '' }
      // 最后一列吃掉剩余宽度，避免 sel/go 被撑开
      const isLast = colIdx === visibleColumns.length - 1
      const colWidth = isLast ? undefined : (widths[c.dataIndex] ?? c.width)
      return {
        title: (
          <div
            className="erp-col-head"
            draggable
            onDragStart={() => setDragCol(c.dataIndex)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropCol(c.dataIndex)}
            title={t('cmp.erpTable.dragTheHandleOn')}
          >
            <div className="erp-col-title">
              <span className="erp-drag-grip" title={t('cmp.erpTable.dragToSort')}>⠿</span>
              <span>{c.title}</span>
            </div>
            <div
              className={`erp-col-resizer${resizing === c.dataIndex ? ' active' : ''}`}
              onMouseDown={(e) => onResizeStart(c.dataIndex, e)}
            />
            <div className="erp-col-filter">
              <ColumnFilterInput
                mode={c.filterType === 'select' ? 'select' : 'text'}
                op={f.op}
                value={f.value}
                numberOnly={c.filterType === 'number'}
                options={c.filterOptions}
                onOpChange={(op) => setFilter(c.dataIndex, { op })}
                onValueChange={(value) =>
                  setFilter(c.dataIndex, {
                    op: c.filterType === 'select' ? 'eq' : f.op,
                    value,
                  })
                }
              />
            </div>
          </div>
        ),
        dataIndex: c.dataIndex as string,
        key: c.dataIndex,
        width: colWidth,
        sorter: c.sorter
          ? (a: T, b: T) => cellText(a[c.dataIndex]).localeCompare(cellText(b[c.dataIndex]))
          : undefined,
        render: (v: unknown, row: T, i: number) =>
          c.render ? c.render(v, row, i) : v == null ? '-' : String(v),
      }
    }),
  ]

  const colMenu = {
    items: columns.map((c) => ({
      key: c.dataIndex,
      label: (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={!hidden.includes(c.dataIndex)}
            onChange={() => toggleHide(c.dataIndex)}
          >
            {c.title}
          </Checkbox>
        </span>
      ),
    })),
  }

  return (
    <div className="erp-grid-wrap">
      <div className="erp-table-tools">
        <Dropdown
          menu={{
            items: [
              ...views.map((v) => ({
                key: v.id,
                label: (
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                      onClick={() => applyView(v)}
                      style={{ flex: 1, cursor: 'pointer', color: activeView === v.name ? '#0026ff' : undefined }}
                    >
                      {activeView === v.name ? '● ' : ''}
                      {v.name}
                    </span>
                    <Button
                      size="small"
                      type="text"
                      danger
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteView(v.id)
                      }}
                    >{t('common.del')}</Button>
                  </span>
                ),
              })),
              ...(sharedViews.length
                ? [
                    { type: 'divider' as const },
                    ...sharedViews.map((v) => ({
                      key: v.id,
                      label: (
                        <span onClick={() => applyView(v)} style={{ cursor: 'pointer' }}>{t('cmp.erpTable.shared', { name: v.name })}
                          <span style={{ color: '#8b919a', fontSize: 11 }}> @ {v.ownerName}</span>
                        </span>
                      ),
                    })),
                  ]
                : []),
              ...(views.length || sharedViews.length ? [{ type: 'divider' as const }] : []),
              { key: '__save', label: t('cmp.erpTable.saveCurrentView') },
              { key: '__clear', label: t('cmp.erpTable.clearFilters') },
            ],
            onClick: ({ key }) => {
              if (key === '__save') setViewOpen(true)
              else if (key === '__clear') clearView()
            },
          }}
          trigger={['click']}
        >
          <button type="button" className="erp-tool-btn">{t('cmp.erpTable.view', { v: activeView ? `：${activeView}` : '' })}
          </button>
        </Dropdown>
        <Dropdown menu={colMenu} trigger={['click']}>
          <button type="button" className="erp-tool-btn">{t('cmp.erpTable.showHideColumns')}</button>
        </Dropdown>
        <button
          type="button"
          className="erp-tool-btn"
          title={t('cmp.erpTable.exportCsvWithVisible')}
          onClick={() => {
            const cols = visibleColumns.filter((c) => c.dataIndex !== '__op' && c.dataIndex !== '__sel')
            const header = cols.map((c) => String(c.title ?? c.dataIndex)).join(',')
            const lines = filtered.map((row) =>
              cols
                .map((c) => {
                  const raw = (row as Record<string, unknown>)[c.dataIndex as string]
                  let v = raw == null ? '' : String(raw)
                  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                    v = '"' + v.replace(/"/g, '""') + '"'
                  }
                  return v
                })
                .join(','),
            )
            const csv = [header, ...lines].join('\n')
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${storageKey || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >{t('cmp.erpTable.exportColumns')}</button>
        <span className="erp-tool-hint">{t('cmp.erpTable.dragHeadersToReorder')}</span>
        {selectedCount > 0 && (
          <span className="erp-batch-count">{t('cmp.erpTable.selected')}{' '}<b>{selectedCount}</b>{' '}{t('cmp.erpTable.rows')}</span>
        )}
      </div>
      {selectedCount > 0 && batchBar && (
        <div className="erp-batch-bar">{batchBar(selectedIds, selectedRows, clearSelection)}</div>
      )}
      <Table
        rowKey={(r) => String((r as T)[rowKey])}
        size="small"
        tableLayout="fixed"
        loading={loading}
        dataSource={filtered}
        pagination={{
          pageSize: pageSize,
          showSizeChanger: true,
          pageSizeOptions: [10, 15, 20, 50, 100],
          showTotal: (total) => t('cmp.erpTable.total', { total }),
          onShowSizeChange: (_cur, size) => setPageSize(size),
        }}
        onRow={(row) => ({
          onClick: () => onRowClick?.(row),
          className:
            flashId && String((row as T)[rowKey]) === flashId ? 'erp-row-flash' : undefined,
          style: { cursor: onRowClick ? 'pointer' : 'default' },
        })}
        columns={antColumns}
      />
      <Modal
        title={t('cmp.erpTable.saveListView')}
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        onOk={saveCurrentView}
        width={400}
        okText={t('common.save')}
      >
        <Input
          placeholder={t('cmp.erpTable.viewNameEG')}
          value={viewName}
          onChange={(e) => setViewName(e.target.value)}
          onPressEnter={saveCurrentView}
        />
        <div style={{ marginTop: 8 }}>
          <Checkbox checked={viewShared} onChange={(e) => setViewShared(e.target.checked)}>{t('cmp.erpTable.shareWithTeamColleagues')}</Checkbox>
        </div>
        <div style={{ marginTop: 8, color: 'var(--crm-muted)', fontSize: 12 }}>{t('cmp.erpTable.savesCurrentFiltersColumn')}</div>
      </Modal>
    </div>
  )
}
