import { Checkbox, Popover, Button } from 'antd'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface ColumnPref {
  key: string
  title: string
  defaultOn?: boolean
}

/** 简单列设置：localStorage 持久化 */
export function useColumnPrefs(storageKey: string, columns: ColumnPref[]) {
  const [hidden, setHidden] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const toggle = (k: string) => {
    setHidden((prev) => {
      const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }
  const visible = useMemo(
    () => columns.filter((c) => !hidden.includes(c.key)),
    [columns, hidden],
  )
  return { hidden, toggle, visible }
}

export function ColumnSettingsButton({
  columns,
  hidden,
  onToggle,
}: {
  columns: ColumnPref[]
  hidden: string[]
  onToggle: (k: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Popover
      trigger="click"
      content={
        <div style={{ display: 'grid', gap: 6 }}>
          {columns.map((c) => (
            <Checkbox
              key={c.key}
              checked={!hidden.includes(c.key)}
              onChange={() => onToggle(c.key)}
            >
              {c.title}
            </Checkbox>
          ))}
        </div>
      }
    >
      <Button size="small">{t('common.edit')}</Button>
    </Popover>
  )
}
