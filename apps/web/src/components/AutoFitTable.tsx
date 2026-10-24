import { Table } from 'antd'
import type { TableColumnsType, TableProps } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cellToText, computeFitWidths, type FitColumn } from '../utils/autoFit'

/** 稳定的空数组，避免 `?? []` 每次渲染生成新引用导致 useMemo 失效 */
const EMPTY: readonly never[] = []

type AnyCol = NonNullable<TableColumnsType<Record<string, unknown>>>[number]

let canvasCtx: CanvasRenderingContext2D | null | undefined

function getCtx(): CanvasRenderingContext2D | null {
  if (canvasCtx !== undefined) return canvasCtx
  try {
    const c = document.createElement('canvas')
    canvasCtx = c.getContext('2d')
  } catch {
    canvasCtx = null
  }
  return canvasCtx
}

function bodyFont(): string {
  try {
    const f = getComputedStyle(document.body).font
    if (f && f !== '') return f
  } catch {
    /* ignore */
  }
  return '13px -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif'
}

/** 用 canvas 测量文本宽度；失败时退化为「字符数 × 字号」的估算 */
function measureText(text: string, bold = false): number {
  const str = text ?? ''
  if (!str) return 0
  const ctx = getCtx()
  const font = bodyFont()
  if (ctx) {
    try {
      ctx.font = font
      const w = ctx.measureText(str).width
      if (w > 0) return bold ? w * 1.06 : w
    } catch {
      /* fallthrough */
    }
  }
  // 估算：中文按 1em、ASCII 按 0.55em
  let units = 0
  for (const ch of str) units += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 1 : 0.55
  return units * 13 * (bold ? 1.06 : 1)
}

function resolvePath(row: Record<string, unknown>, path: unknown): unknown {
  if (typeof path === 'string') return row[path]
  if (Array.isArray(path)) {
    let cur: unknown = row
    for (const p of path) {
      if (cur == null || typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[String(p)]
    }
    return cur
  }
  return undefined
}

/**
 * 报表/Auto 表格：列宽按内容与容器自适应。
 *
 * - 传入与 antd Table 完全相同的 props，额外可用 `fitMaxWidth` / `fitMinWidth` 调整边界；
 * - 列已有 `width` 时作为「下限」使用，不会被压到文字换行；
 * - 内容总宽超出容器时自动开启横向滚动，而不是把列挤扁。
 */
export function AutoFitTable<T extends object = Record<string, unknown>>({
  fitMinWidth = 72,
  fitMaxWidth = 420,
  sampleRows = 60,
  className,
  ...rest
}: TableProps<T> & {
  fitMinWidth?: number
  fitMaxWidth?: number
  sampleRows?: number
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapWidth, setWrapWidth] = useState(0)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => setWrapWidth(Math.round(el.clientWidth))
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = (rest.columns ?? EMPTY) as TableColumnsType<T>
  const dataSource = (rest.dataSource ?? EMPTY) as readonly Record<string, unknown>[]

  const fitCols: FitColumn[] = useMemo(
    () =>
      (columns as AnyCol[]).map((c, i) => {
        const col = c as AnyCol & { dataIndex?: unknown; width?: number; title?: unknown }
        const key = String(col.key ?? col.dataIndex ?? `col-${i}`)
        const title = cellToText(col.title) || String(col.dataIndex ?? '')
        const samples: string[] = []
        if (col.dataIndex != null) {
          for (let r = 0; r < Math.min(dataSource.length, sampleRows); r++) {
            samples.push(cellToText(resolvePath(dataSource[r], col.dataIndex)))
          }
        }
        return {
          key,
          title,
          samples,
          providedWidth: typeof col.width === 'number' ? col.width : undefined,
          fixed: (col as { fixed?: unknown }).fixed === 'left' || (col as { fixed?: unknown }).fixed === 'right',
        }
      }),
    [columns, dataSource, sampleRows],
  )

  const { widths, overflow } = useMemo(
    () =>
      computeFitWidths(fitCols, {
        containerWidth: wrapWidth,
        measure: measureText,
        minWidth: fitMinWidth,
        maxWidth: fitMaxWidth,
        padding: 26,
        sortIcon: 16,
      }),
    [fitCols, wrapWidth, fitMinWidth, fitMaxWidth],
  )

  const fitted = useMemo<TableColumnsType<T>>(
    () =>
      (columns as AnyCol[]).map((c, i) => {
        const col = c as AnyCol & { dataIndex?: unknown; align?: string }
        const hasData = col.dataIndex != null
        const numeric =
          hasData &&
          !col.align &&
          dataSource.length > 0 &&
          dataSource.every((row) => {
            const v = resolvePath(row, col.dataIndex)
            return v == null || v === '' || typeof v === 'number' || /^-?[\d,]+(\.\d+)?%?$/.test(String(v))
          })
        const align = col.align ?? (numeric ? 'right' : undefined)
        return {
          ...c,
          width: widths[i],
          align,
          className: numeric ? 'ant-table-cell-num' : (c as { className?: string }).className,
        } as unknown as AnyCol
      }) as unknown as TableColumnsType<T>,
    [columns, widths, dataSource],
  )

  return (
    <div className="crm-autofit" ref={wrapRef}>
      <Table<T>
        {...rest}
        columns={fitted}
        tableLayout="fixed"
        scroll={overflow ? { x: widths.reduce((a, b) => a + b, 0) } : rest.scroll}
        className={className}
      />
    </div>
  )
}

export default AutoFitTable
