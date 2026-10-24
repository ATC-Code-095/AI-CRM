import { t } from '../i18n'
/** 轻量 SVG 图表：折线 / 条形，无外部依赖 */
export function Sparkline({
  points,
  height = 72,
  color = '#2f6bff',
  labelKey = 'avg',
}: {
  points: Array<Record<string, number | string>> & Array<{ date: string }>
  height?: number
  color?: string
  labelKey?: string
}) {
  if (!points?.length) {
    return <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('common.empty')}</div>
  }
  const values = points.map((p) => Number(p[labelKey] ?? 0))
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const w = 280
  const pad = 12
  const step = (w - pad * 2) / Math.max(points.length - 1, 1)
  const coords = values.map((v, i) => {
    const x = pad + i * step
    const y = height - pad - ((v - min) / Math.max(max - min, 1)) * (height - pad * 2)
    return { x, y, v }
  })
  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ')
  const area = `${line} L${coords[coords.length - 1].x},${height - pad} L${coords[0].x},${height - pad} Z`

  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="none">
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={3} fill={color} />
      ))}
      <text x={pad} y={height - 2} fontSize="9" fill="#94a3b8">
        {String(points[0].date ?? '').slice(5)}
      </text>
      <text
        x={w - pad}
        y={height - 2}
        fontSize="9"
        fill="#94a3b8"
        textAnchor="end"
      >
        {String(points[points.length - 1].date ?? '').slice(5)}
      </text>
    </svg>
  )
}

export function BarChart({
  items,
  height = 120,
  color = '#22a06b',
}: {
  items: { label: string; value: number }[]
  height?: number
  color?: string
}) {
  if (!items?.length) {
    return <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('common.empty')}</div>
  }
  const max = Math.max(...items.map((i) => i.value), 1)
  // 视口按容器比例铺满：柱宽随列数自适应，图表不再挤在左侧
  const w = 720
  const padX = 24
  const slot = (w - padX * 2) / items.length
  const barW = Math.max(10, Math.min(76, slot - 16))
  return (
    <svg viewBox={`0 0 ${w} ${height + 30}`} style={{ width: '100%', height: 'auto' }} role="img">
      <line
        x1={padX}
        y1={height - 4}
        x2={w - padX}
        y2={height - 4}
        stroke="#e8ecf2"
        strokeWidth="1"
      />
      {items.map((it, i) => {
        const h = ((it.value / max) * (height - 24)) | 0
        const x = padX + slot * i + (slot - barW) / 2
        const y = height - 4 - h
        return (
          <g key={it.label + i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 2)}
              rx={5}
              fill={color}
              opacity={0.9}
            />
            <text x={x + barW / 2} y={y - 5} fontSize="11" fill="#64748b" textAnchor="middle">
              {it.value}
            </text>
            <text x={x + barW / 2} y={height + 16} fontSize="11" fill="#94a3b8" textAnchor="middle">
              {it.label.slice(0, 6)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** 主体雷达图（多维 0-100 分） */
export function RadarChart({
  items,
  axes,
  size = 220,
  color = '#2b5fd9',
}: {
  items: { name: string; scores: number[]; color?: string }[]
  axes: string[]
  size?: number
  color?: string
}) {
  if (!items?.length || !axes?.length) {
    return <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('common.empty')}</div>
  }
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 28
  const n = axes.length
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    const rr = (Math.max(0, Math.min(100, v)) / 100) * r
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size * 1.6 }}>
      {[25, 50, 75, 100].map((lv) => (
        <polygon
          key={lv}
          points={axes.map((_, i) => pt(i, lv).join(',')).join(' ')}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {axes.map((label, i) => {
        const [x, y] = pt(i, 100)
        const [lx, ly] = pt(i, 118)
        return (
          <g key={label}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" />
            <text x={lx} y={ly} fontSize="11" fill="#64748b" textAnchor="middle">
              {label}
            </text>
          </g>
        )
      })}
      {items.map((it, idx) => {
        const c = it.color ?? (idx === 0 ? color : idx === 1 ? '#0d9488' : '#d97706')
        const points = axes.map((_, i) => pt(i, it.scores[i] ?? 0).join(',')).join(' ')
        return (
          <polygon
            key={it.name}
            points={points}
            fill={c}
            fillOpacity={0.15}
            stroke={c}
            strokeWidth={2}
          />
        )
      })}
    </svg>
  )
}

/** 配额瀑布图：目标 / 已达成 / 在途 / 缺口 */
export function WaterfallChart({
  items,
  height = 140,
}: {
  items: { label: string; value: number; type: 'total' | 'positive' | 'negative' | 'info' }[]
  height?: number
}) {
  if (!items?.length) return <div style={{ color: '#94a3b8', fontSize: 12 }}>{t('common.empty')}</div>
  const max = Math.max(...items.map((i) => i.value), 1)
  const w = 400
  const barW = 48
  const gap = 28
  const colors: Record<string, string> = {
    total: '#334155',
    positive: '#22a06b',
    negative: '#e5484d',
    info: '#2f6bff',
  }
  return (
    <svg viewBox={`0 0 ${w} ${height + 36}`} style={{ width: '100%', height: 'auto' }}>
      {items.map((it, i) => {
        const h = Math.max(((it.value / max) * (height - 28)) | 0, 2)
        const x = 16 + i * (barW + gap)
        const y = height - h
        return (
          <g key={it.label + i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={4}
              fill={colors[it.type] ?? colors.info}
              opacity={0.88}
            />
            <text x={x + barW / 2} y={y - 6} fontSize="11" fill="#475569" textAnchor="middle">
              {it.value >= 10000
                ? t('cmp.simpleCharts.n10k', { v: (it.value / 10000).toFixed(1) })
                : it.value.toFixed(0)}
            </text>
            <text x={x + barW / 2} y={height + 16} fontSize="11" fill="#64748b" textAnchor="middle">
              {it.label}
            </text>
            {i < items.length - 1 && (
              <line
                x1={x + barW}
                y1={y + h / 2}
                x2={x + barW + gap}
                y2={y + h / 2}
                stroke="#cbd5e1"
                strokeDasharray="3 3"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function GaugeRing({
  value,
  size = 88,
  color = '#2f6bff',
  label,
}: {
  value: number
  size?: number
  color?: string
  label?: string
}) {
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="16"
        fontWeight="700"
        fill="#334155"
      >
        {Math.round(value)}
      </text>
      {label ? (
        <text x={size / 2} y={size / 2 + 18} textAnchor="middle" fontSize="10" fill="#94a3b8">
          {label}
        </text>
      ) : null}
    </svg>
  )
}

/** 图表卡片：标题 + 导出 PNG */
export function ChartFrame({
  title,
  children,
  filename,
}: {
  title?: string
  children: React.ReactNode
  filename?: string
}) {
  return (
    <div>
      {(title || filename) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          {title ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{title}</span>
          ) : (
            <span />
          )}
          {filename ? (
            <button
              type="button"
              style={{
                fontSize: 11,
                border: '1px solid #e2e8f0',
                background: '#fff',
                borderRadius: 6,
                padding: '2px 8px',
                cursor: 'pointer',
                color: '#64748b',
              }}
              onClick={() => {
                const root = document.getElementById(filename) as HTMLElement | null
                const svg = root?.querySelector('svg')
                if (svg) {
                  // 动态引入导出函数，避免循环依赖问题
                  void import('./ReportsFilterBar').then((m) => m.exportSvgAsPng(svg, `${filename}.png`))
                }
              }}
            >{t('cmp.simpleCharts.exportChart')}</button>
          ) : null}
        </div>
      )}
      <div id={filename}>{children}</div>
    </div>
  )
}
