/**
 * 报表列宽自适应算法（纯函数，便于单测）
 *
 * 目标：让报表表格的列宽「跟内容走、跟容器走」，不出现
 *  - 某一列被浏览器撑得极宽、其它列被压到文字换行；
 *  - 表格右侧留出大片空白。
 *
 * 规则：
 * 1. 每列自然宽度 = max(表头宽, 该列所有单元格文本宽) + 单元格内边距；
 * 2. 自然宽度先按 [minWidth, maxWidth]（或列定义 width 作为下限）夹紧；
 * 3. 若总和 ≤ 容器宽：把富余宽度「均分」给各列（等量摊薄，避免马太效应），
 *    触顶 maxWidth 的列不再增长，余量继续分给其它列；
 * 4. 若总和 > 容器宽：保留自然宽度并让外层横向滚动（不压缩到换行）。
 */

export interface FitColumn {
  key: string
  /** 表头文字 */
  title: string
  /** 采样到的单元格文本（已在调用方转为字符串） */
  samples: string[]
  /** 列定义里显式声明的宽度：作为下限使用 */
  providedWidth?: number
  /** 该列是数字列：右对齐、允许更窄 */
  numeric?: boolean
  /** 该列不可收缩（如操作列） */
  fixed?: boolean
}

export interface FitOptions {
  /** 表格容器可用宽度（px），<=0 时返回自然宽度 */
  containerWidth: number
  /** 文本测量函数（注入以便测试） */
  measure: (text: string, bold?: boolean) => number
  /** 单元格左右内边距合计 */
  padding?: number
  /** 表头排序图标占位 */
  sortIcon?: number
  /** 全局最小列宽 */
  minWidth?: number
  /** 全局最大列宽 */
  maxWidth?: number
  /** 渲染函数列的内容补偿宽度 */
  renderFudge?: number
}

export interface FitResult {
  /** 与入参顺序一致的列宽 */
  widths: number[]
  /** 列宽合计 */
  totalWidth: number
  /** 是否需要横向滚动 */
  overflow: boolean
}

export function computeFitWidths(cols: FitColumn[], opts: FitOptions): FitResult {
  const padding = opts.padding ?? 24
  const sortIcon = opts.sortIcon ?? 0
  const globalMin = opts.minWidth ?? 72
  const globalMax = opts.maxWidth ?? 420

  const natural = cols.map((c) => {
    const head = opts.measure(c.title, true) + padding + sortIcon
    let body = 0
    for (const s of c.samples) {
      const w = opts.measure(s, false)
      if (w > body) body = w
    }
    if (body === 0) body = opts.measure('—', false)
    const min = Math.max(globalMin, c.providedWidth ?? 0)
    const max = Math.max(min, globalMax)
    const fudge = c.samples.length ? 0 : (opts.renderFudge ?? 0)
    const raw = Math.max(head, body + padding) + fudge
    return { natural: clamp(raw, min, max), min, max, fixed: !!c.fixed }
  })

  const total = natural.reduce((a, b) => a + b.natural, 0)
  const container = Math.max(0, Math.floor(opts.containerWidth))

  // 容器宽度未知（首帧）：先按自然宽度渲染，不做横向滚动
  if (container <= 0) {
    return { widths: natural.map((n) => Math.round(n.natural)), totalWidth: total, overflow: false }
  }

  if (total > container) {
    return { widths: natural.map((n) => Math.round(n.natural)), totalWidth: total, overflow: true }
  }

  const widths = natural.map((n) => n.natural)
  let spare = container - total
  // 等量摊薄 + 触顶回收，最多 12 轮，保证收敛
  for (let round = 0; round < 12 && spare > 0.5; round++) {
    const open = widths.map((w, i) => (natural[i].fixed ? -1 : natural[i].max - w)).map((r) => (r > 0.5 ? r : 0))
    const openSum = open.reduce((a, b) => a + b, 0)
    if (openSum <= 0.5) break
    const share = spare / cols.filter((c, i) => open[i] > 0).length
    let used = 0
    for (let i = 0; i < widths.length; i++) {
      if (open[i] <= 0) continue
      const add = Math.min(share, open[i])
      widths[i] += add
      used += add
    }
    spare -= used
  }

  // 归一化到容器宽度，避免累积误差留下空隙
  const rounded = widths.map((w) => Math.round(w))
  const diff = container - rounded.reduce((a, b) => a + b, 0)
  if (rounded.length && diff !== 0) rounded[rounded.length - 1] += diff

  return {
    widths: rounded,
    totalWidth: rounded.reduce((a, b) => a + b, 0),
    overflow: false,
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** 把任意单元格值转成用于测量的文本 */
export function cellToText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toLocaleDateString()
  return ''
}
