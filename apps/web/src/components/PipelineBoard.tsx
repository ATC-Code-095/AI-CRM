import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { App, Button, Space, Tag, Tooltip, Typography } from 'antd'
import { ClockCircleOutlined, HolderOutlined, UserOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'

export interface BoardStage {
  id: string
  code: string
  name: string
  winRate: number
  isClosing: boolean
}

export interface BoardOpp {
  id: string
  name: string
  amount: string
  winRate: number
  expectedCloseDate: string
  account?: { id: string; name: string }
  owner?: { id: string; name: string }
  stage: BoardStage
}

export interface BoardColumnData {
  stage: BoardStage
  cards: BoardOpp[]
  count: number
  amount: string
}

const DEFAULT_LIMIT = 8

/**
 * 商机看板（签名交互）
 * 对标 Salesforce/Pipedrive/纷享销客：列 = 阶段，卡片可拖拽换阶段，
 * 列高固定 + 列内滚动，避免几百条商机把页面撑成几万像素。
 */
export function PipelineBoard({
  columns,
  onMove,
  onWon,
  onLost,
}: {
  columns: BoardColumnData[]
  onMove: (oppId: string, stageId: string) => void
  onWon?: (oppId: string) => void
  onLost?: (oppId: string) => void
}) {
  const { modal } = App.useApp()
  const [dragging, setDragging] = useState<BoardOpp | null>(null)
  const [limits, setLimits] = useState<Record<string, number>>({})
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const stageById = useMemo(() => {
    const m = new Map<string, BoardStage>()
    columns.forEach((c) => m.set(c.stage.id, c.stage))
    return m
  }, [columns])

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id)
    for (const c of columns) {
      const hit = c.cards.find((x) => x.id === id)
      if (hit) {
        setDragging(hit)
        return
      }
    }
  }

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    const oppId = String(e.active.id)
    const targetStage = e.over ? stageById.get(String(e.over.id)) : undefined
    if (!targetStage) return
    let from: BoardStage | undefined
    let opp: BoardOpp | undefined
    for (const c of columns) {
      const hit = c.cards.find((x) => x.id === oppId)
      if (hit) {
        from = c.stage
        opp = hit
        break
      }
    }
    if (!opp || !from || from.id === targetStage.id) return
    modal.confirm({
      title: t('cmp.pipelineBoard.confirmStageChange'),
      content: (
        <span>{t('cmp.pipelineBoard.moveDeal')}{' '}<b>{opp.name}</b>{t('cmp.pipelineBoard.fromTo', { amount: opp.amount, name: from.name, name2: targetStage.name })}</span>
      ),
      okText: t('cmp.pipelineBoard.confirmMove'),
      cancelText: t('common.cancel'),
      onOk: () => onMove(oppId, targetStage.id),
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="crm-kanban">
        {columns.map((col) => (
          <BoardColumn
            key={col.stage.id}
            col={col}
            limit={limits[col.stage.id] ?? DEFAULT_LIMIT}
            onMore={() =>
              setLimits((prev) => ({
                ...prev,
                [col.stage.id]: (prev[col.stage.id] ?? DEFAULT_LIMIT) + 20,
              }))
            }
            onWon={onWon}
            onLost={onLost}
          />
        ))}
        {columns.length === 0 && (
          <div className="crm-kanban-empty">
            <Typography.Text type="secondary">{t('common.noStageData')}</Typography.Text>
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging ? <OppCardView opp={dragging} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  col,
  limit,
  onMore,
  onWon,
  onLost,
}: {
  col: BoardColumnData
  limit: number
  onMore: () => void
  onWon?: (id: string) => void
  onLost?: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.stage.id })
  const shown = col.cards.slice(0, limit)
  const restCount = col.cards.length - shown.length

  return (
    <div className={`crm-kanban-col${isOver ? ' over' : ''}`}>
      <div className="crm-kanban-col-head" style={{ borderTopColor: stageColor(col.stage) }}>
        <div className="crm-kanban-col-title">
          <span>{col.stage.name}</span>
          <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
            {col.count}
          </Tag>
        </div>
        <div className="crm-kanban-col-amount">{col.amount}</div>
        <div className="crm-kanban-col-rate">{t('common.winRate', { winRate: col.stage.winRate })}</div>
      </div>
      <div className="crm-kanban-col-body" ref={setNodeRef}>
        {shown.map((c) => (
          <DraggableCard key={c.id} opp={c} onWon={onWon} onLost={onLost} />
        ))}
        {restCount > 0 && (
          <Button block size="small" type="text" onClick={onMore}>{t('cmp.pipelineBoard.moreClickToExpand', { restCount })}</Button>
        )}
        {col.cards.length === 0 && <div className="crm-kanban-drophint">{t('cmp.pipelineBoard.dragDealsToThis')}</div>}
      </div>
    </div>
  )
}

function DraggableCard({
  opp,
  onWon,
  onLost,
}: {
  opp: BoardOpp
  onWon?: (id: string) => void
  onLost?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: opp.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={`crm-kanban-card${isDragging ? ' dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <OppCardView opp={opp} onWon={onWon} onLost={onLost} />
    </div>
  )
}

function OppCardView({
  opp,
  overlay,
  onWon,
  onLost,
}: {
  opp: BoardOpp
  overlay?: boolean
  onWon?: (id: string) => void
  onLost?: (id: string) => void
}) {
  return (
    <div className={`crm-kanban-card-inner${overlay ? ' overlay' : ''}`}>
      <div className="crm-kanban-card-top">
        <HolderOutlined className="crm-kanban-grip" />
        <Link to={`/opportunities/${opp.id}`} className="crm-kanban-card-name">
          {opp.name}
        </Link>
      </div>
      <div className="crm-kanban-card-account">
        {opp.account?.id ? <Link to={`/accounts/${opp.account.id}`}>{opp.account.name}</Link> : '—'}
      </div>
      <div className="crm-kanban-card-meta">
        <span className="crm-kanban-amount">{opp.amount}</span>
        <Tag color={opp.winRate >= 60 ? 'green' : opp.winRate >= 30 ? 'blue' : 'default'}>
          {opp.winRate}%
        </Tag>
      </div>
      <div className="crm-kanban-card-foot">
        <Tooltip title={t('cmp.pipelineBoard.owner', { v: opp.owner?.name ?? '—' })}>
          <span>
            <UserOutlined /> {opp.owner?.name ?? '—'}
          </span>
        </Tooltip>
        <Tooltip title={t('common.expectedCloseDate')}>
          <span>
            <ClockCircleOutlined /> {opp.expectedCloseDate ? String(opp.expectedCloseDate).slice(0, 10) : '—'}
          </span>
        </Tooltip>
        {onWon || onLost ? (
          <Space size={2}>
            {onWon && (
              <Button
                size="small"
                type="link"
                onClick={(e) => {
                  e.stopPropagation()
                  onWon(opp.id)
                }}
              >{t('enum.stage.WON')}</Button>
            )}
            {onLost && (
              <Button
                size="small"
                type="link"
                danger
                onClick={(e) => {
                  e.stopPropagation()
                  onLost(opp.id)
                }}
              >{t('enum.stage.LOST')}</Button>
            )}
          </Space>
        ) : null}
      </div>
    </div>
  )
}

const STAGE_COLORS = ['#2f6bff', '#0ea5e9', '#22a06b', '#7c5cf0', '#f59e0b', '#e5484d']

function stageColor(stage: BoardStage): string {
  if (stage.isClosing) return stage.code === 'WON' ? '#22a06b' : '#e5484d'
  const idx = Math.abs(hash(stage.code)) % STAGE_COLORS.length
  return STAGE_COLORS[idx]
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

export default PipelineBoard
