import { Empty, Skeleton, Tag } from 'antd'
import { RightOutlined } from '@ant-design/icons'
import { useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { t } from '../i18n'

export interface MobileCardField {
  label: string
  value: ReactNode
}

export interface MobileSwipeAction {
  key: string
  label: string
  color?: string
  danger?: boolean
  onClick: () => void
}

export interface MobileCardItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  tags?: ReactNode
  amount?: ReactNode
  fields?: MobileCardField[]
  to?: string
  onClick?: () => void
  actions?: ReactNode
  /** 左滑显示的快捷操作 */
  swipeActions?: MobileSwipeAction[]
}

/** 单卡：支持左滑露出快捷操作 */
function MobileCard({
  it,
  nav,
}: {
  it: MobileCardItem
  nav: ReturnType<typeof useNavigate>
}) {
  const startX = useRef(0)
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState(false)

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!it.swipeActions?.length) return
    const dx = e.touches[0].clientX - startX.current
    if (dx < 0) {
      setOffset(Math.max(dx, -120))
    } else if (open) {
      setOffset(Math.min(0, -120 + dx))
    }
  }
  const onTouchEnd = () => {
    if (!it.swipeActions?.length) return
    if (offset < -50) {
      setOpen(true)
      setOffset(-120)
    } else {
      setOpen(false)
      setOffset(0)
    }
  }

  const body = (
    <>
      <div className="crm-mobile-card-head">
        <span className="crm-mobile-card-title">{it.title}</span>
        {it.tags}
      </div>
      {it.subtitle ? <div className="crm-mobile-card-sub">{it.subtitle}</div> : null}
      {it.amount ? <div className="crm-mobile-card-amount">{it.amount}</div> : null}
      {it.fields?.length ? (
        <div className="crm-mobile-card-fields">
          {it.fields.map((f) => (
            <div className="crm-mobile-card-field" key={f.label}>
              <span className="crm-mobile-card-field-label">{f.label}</span>
              <span className="crm-mobile-card-field-value">{f.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {it.actions ? (
        <div className="crm-mobile-card-actions" onClick={(e) => e.stopPropagation()}>
          {it.actions}
        </div>
      ) : null}
    </>
  )

  const cls = 'crm-mobile-card'
  const swipe = it.swipeActions?.length ? (
    <div
      key={it.id}
      style={{ position: 'relative', overflow: 'hidden', marginBottom: 8, borderRadius: 8 }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {it.swipeActions.map((a) => (
          <button
            key={a.key}
            type="button"
            style={{
              width: 60,
              border: 'none',
              color: '#fff',
              background: a.danger ? '#dc2626' : a.color || '#2b5fd9',
              fontSize: 12,
              cursor: 'pointer',
            }}
            onClick={() => {
              setOpen(false)
              setOffset(0)
              a.onClick()
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: open ? 'transform .18s' : 'none',
          background: '#fff',
          position: 'relative',
          zIndex: 1,
        }}
        onClick={() => {
          if (open) {
            setOpen(false)
            setOffset(0)
            return
          }
          it.onClick?.()
          if (it.to) nav(it.to)
        }}
      >
        {body}
      </div>
    </div>
  ) : null

  if (swipe) return swipe

  if (it.to && !it.actions) {
    return (
      <Link key={it.id} to={it.to} className={cls}>
        {body}
        <RightOutlined className="crm-mobile-card-arrow" />
      </Link>
    )
  }
  const go = it.onClick ?? (it.to ? () => nav(it.to as string) : undefined)
  return (
    <div key={it.id} className={cls} onClick={go} role={go ? 'button' : undefined}>
      {body}
      {go ? <RightOutlined className="crm-mobile-card-arrow" /> : null}
    </div>
  )
}

/**
 * 手机端卡片列表（docs/06 §2：`<768` 列表降级为卡片列表）
 * 支持左滑快捷操作（swipeActions）。
 */
export function MobileCardList({
  items,
  loading,
  emptyText = t('common.empty'),
}: {
  items: MobileCardItem[]
  loading?: boolean
  emptyText?: string
}) {
  const nav = useNavigate()

  if (loading) {
    return (
      <div className="crm-mobile-list">
        {[0, 1, 2].map((i) => (
          <div className="crm-mobile-card" key={i}>
            <Skeleton active paragraph={{ rows: 2 }} title={{ width: '60%' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="crm-mobile-list">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} style={{ padding: 24 }} />
      </div>
    )
  }

  return (
    <div className="crm-mobile-list">
      {items.map((it) => (
        <MobileCard key={it.id} it={it} nav={nav} />
      ))}
    </div>
  )
}

/** 常用状态标签着色 */
export function mobileStatusTag(text: string, color?: string) {
  return (
    <Tag color={color} bordered={false} style={{ marginInlineEnd: 0 }}>
      {text}
    </Tag>
  )
}

export default MobileCardList
