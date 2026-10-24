import { useEffect, useState } from 'react'
import { Button, InputNumber, Select, Slider, Tag } from 'antd'
import { api } from '../api/client'
import { t } from '../i18n'

/** 采购决策链（Buying Committee）：按决策角色可视化联系人，支持影响力/角色编辑 */
export type DecisionContact = {
  id: string
  name: string
  title?: string | null
  decisionRole?: string | null
  isPrimary?: boolean
  mobile?: string | null
  influence?: number | null
}

const ROLE_META: Record<string, { label: string; color: string; desc: string }> = {
  ECONOMIC: { label: t('common.economicBuyer'), color: '#dc2626', desc: t('cmp.decisionChainChart.approvesBudgetSigns') },
  TECH: { label: t('common.technicalGatekeeper'), color: '#2563eb', desc: t('cmp.decisionChainChart.evaluatesSolutionFeasibility') },
  USER: { label: t('common.userDepartment'), color: '#0d9488', desc: t('cmp.decisionChainChart.dailyUseAndFeedback') },
  CHAMPION: { label: t('common.internalCoach'), color: '#7c3aed', desc: t('cmp.decisionChainChart.drivesInternalConsensus') },
  OTHER: { label: t('cmp.decisionChainChart.otherInfluencer'), color: '#64748b', desc: t('cmp.decisionChainChart.advisorObserver') },
}

const ORDER = ['ECONOMIC', 'CHAMPION', 'TECH', 'USER', 'OTHER']

export function DecisionChainChart({
  contacts,
  compact = false,
  editable = false,
  onChanged,
}: {
  contacts: DecisionContact[]
  compact?: boolean
  editable?: boolean
  onChanged?: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [local, setLocal] = useState<DecisionContact[]>(contacts)

  useEffect(() => {
    setLocal(contacts)
  }, [contacts])

  const patchContact = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id)
    try {
      await api(`/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setLocal((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...body } as DecisionContact : c)),
      )
      onChanged?.()
    } finally {
      setBusyId(null)
    }
  }

  const data = editable ? local : contacts
  const grouped = ORDER.map((role) => ({
    role,
    ...(ROLE_META[role] ?? ROLE_META.OTHER),
    items: (data ?? []).filter(
      (c) => (c.decisionRole ?? (c.isPrimary ? 'ECONOMIC' : 'OTHER')) === role,
    ),
  })).filter((g) => g.items.length > 0)

  if (!grouped.length) {
    return (
      <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>{t('cmp.decisionChainChart.noContactsTheDecision')}</div>
    )
  }

  const rowH = compact ? 36 : 44
  const nodeW = compact ? 120 : 150
  const gapX = 28
  const width = Math.max(520, grouped.length * (nodeW + gapX) + 40)
  const height = 28 + rowH * 2 + 56

  return (
    <div className="decision-chain-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', maxWidth: '100%', height: 'auto' }}
        role="img"
        aria-label={t('common.buyingDecisionChain')}
      >
        {/* 中心账户 */}
        <rect
          x={width / 2 - 70}
          y={4}
          width={140}
          height={28}
          rx={6}
          fill="#0026ff"
          opacity={0.12}
          stroke="#0026ff"
          strokeWidth={1}
        />
        <text
          x={width / 2}
          y={18}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill="#0026ff"
          fontFamily="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
        >{t('common.buyingDecisionChain')}</text>

        {grouped.map((g, gi) => {
          const x = 20 + gi * (nodeW + gapX)
          const cy = 48
          return (
            <g key={g.role}>
              {/* 角色节点 */}
              <rect
                x={x}
                y={cy}
                width={nodeW}
                height={rowH}
                rx={8}
                fill={g.color}
                opacity={0.12}
                stroke={g.color}
                strokeWidth={1}
              />
              <text
                x={x + nodeW / 2}
                y={cy + rowH / 2 - (compact ? 6 : 8)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fill={g.color}
                fontWeight={600}
                fontFamily="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
              >
                {g.label}
              </text>
              <text
                x={x + nodeW / 2}
                y={cy + rowH / 2 + (compact ? 8 : 10)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={10}
                fill="#64748b"
                fontFamily="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
              >
                {g.desc}
              </text>

              {/* 连接到中心 */}
              <line
                x1={width / 2}
                y1={32}
                x2={x + nodeW / 2}
                y2={cy}
                stroke={g.color}
                strokeWidth={1}
                opacity={0.35}
              />

              {/* 联系人 */}
              {g.items.slice(0, 3).map((c, i) => {
                const ny = cy + rowH + 22 + i * 18
                return (
                  <g key={c.id}>
                    <line
                      x1={x + nodeW / 2}
                      y1={cy + rowH}
                      x2={x + nodeW / 2}
                      y2={ny}
                      stroke={g.color}
                      strokeWidth={1}
                      opacity={0.25}
                    />
                    <circle cx={x + nodeW / 2} cy={ny} r={3.5} fill={g.color} opacity={0.8} />
                    <text
                      x={x + nodeW / 2 + 8}
                      y={ny}
                      dominantBaseline="central"
                      fontSize={11}
                      fill="#3b3b3f"
                      fontFamily="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
                    >
                      {c.name}
                      {c.isPrimary ? t('cmp.decisionChainChart.primary') : ''}
                      {c.title ? ` ·${c.title}` : ''}
                    </text>
                  </g>
                )
              })}
              {g.items.length > 3 && (
                <text
                  x={x + nodeW / 2}
                  y={cy + rowH + 22 + 3 * 18 + 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#94a3b8"
                  fontFamily="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
                >
                  +{g.items.length - 3}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {!compact ? (
        <div style={{ marginTop: 10 }}>
          {ORDER.map((role) => {
            const meta = ROLE_META[role] ?? ROLE_META.OTHER
            const items = (data ?? []).filter(
              (c) => (c.decisionRole ?? (c.isPrimary ? 'ECONOMIC' : 'OTHER')) === role,
            )
            if (!items.length) return null
            return (
              <div key={role} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: meta.color, fontWeight: 600, marginBottom: 4 }}>
                  {meta.label} · {meta.desc}
                </div>
                {items.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 0',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <b style={{ minWidth: 80 }}>{c.name}</b>
                    {c.isPrimary && <Tag color="blue">{t('common.primary')}</Tag>}
                    <span style={{ color: '#64748b', flex: 1, minWidth: 80 }}>{c.title ?? ''}</span>
                    {editable ? (
                      <>
                        <Select
                          size="small"
                          style={{ width: 110 }}
                          value={c.decisionRole ?? (c.isPrimary ? 'ECONOMIC' : 'OTHER')}
                          options={ORDER.map((r) => ({ value: r, label: ROLE_META[r].label }))}
                          onChange={(v) => void patchContact(c.id, { decisionRole: v })}
                          disabled={busyId === c.id}
                        />
                        <Slider
                          style={{ width: 100, margin: '0 8px' }}
                          min={0}
                          max={100}
                          value={Number(c.influence ?? 0)}
                          onChange={(v) =>
                            setLocal((prev) =>
                              prev.map((x) => (x.id === c.id ? { ...x, influence: v } : x)),
                            )
                          }
                          onChangeComplete={(v) => void patchContact(c.id, { influence: v })}
                          disabled={busyId === c.id}
                        />
                        <InputNumber
                          size="small"
                          style={{ width: 64 }}
                          min={0}
                          max={100}
                          value={c.influence ?? 0}
                          onChange={(v) =>
                            setLocal((prev) =>
                              prev.map((x) => (x.id === c.id ? { ...x, influence: Number(v ?? 0) } : x)),
                            )
                          }
                          onBlur={() => void patchContact(c.id, { influence: Number(c.influence ?? 0) })}
                          disabled={busyId === c.id}
                        />
                        <Button
                          size="small"
                          type={c.isPrimary ? 'default' : 'link'}
                          loading={busyId === c.id}
                          onClick={() => void patchContact(c.id, { isPrimary: true })}
                        >
                          {c.isPrimary ? t('contacts.primary') : t('cmp.decisionChainChart.setPrimary')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Tag>{ROLE_META[c.decisionRole ?? (c.isPrimary ? 'ECONOMIC' : 'OTHER')]?.label ?? t('common.other')}</Tag>
                        {c.influence != null ? (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 60,
                              height: 4,
                              background: '#e2e8f0',
                              borderRadius: 2,
                              position: 'relative',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                height: 4,
                                width: `${Math.min(100, Number(c.influence) || 0)}%`,
                                background: meta.color,
                                borderRadius: 2,
                              }}
                            />
                          </span>
                        ) : null}
                      </>
                    )}
                    {c.mobile ? (
                      <a href={`tel:${c.mobile}`} style={{ color: '#2b5fd9' }}>
                        {c.mobile}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
