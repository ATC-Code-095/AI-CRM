import { Empty, Input, Modal, Tag } from 'antd'
import type { InputRef } from 'antd'
import {
  ArrowRightOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  RobotOutlined,
  PhoneOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, isLoggedIn } from '../api/client'
import { NAV_SEARCH_ITEMS } from '../navigation'
import { requestCreate, type CreateEntity } from '../utils/quickCreate'
import { t } from '../i18n'

interface Hit {
  type: string
  id: string
  title: string
  subtitle?: string
}

const ROUTE: Record<string, (id: string) => string> = {
  account: (id) => `/accounts/${id}`,
  lead: (id) => `/leads/${id}`,
  opportunity: (id) => `/opportunities/${id}`,
  contact: () => `/contacts`,
  contract: () => `/contracts`,
  quote: (id) => `/quotes/${id}`,
  ticket: () => `/tickets`,
  product: () => `/products`,
}

const TYPE_LABEL: Record<string, string> = {
  account: t('nav.accounts'),
  lead: t('nav.leads'),
  opportunity: t('nav.opportunities'),
  contact: t('nav.contacts'),
  contract: t('nav.contracts'),
  quote: t('nav.quotes'),
  ticket: t('common.tickets'),
  product: t('common.products'),
}

interface Row {
  key: string
  group: string
  label: string
  hint?: string
  icon?: React.ReactNode
  run: () => void
}

const RECENT_KEY = 'crm.recentRoutes'

export function pushRecent(path: string, label: string) {
  if (!path || path === '/' || !label || label === path) return
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const list = raw ? (JSON.parse(raw) as { path: string; label: string }[]) : []
    const next = [{ path, label }, ...list.filter((x) => x.path !== path)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

export function readRecent(): { path: string; label: string }[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as { path: string; label: string }[]) : []
  } catch {
    return []
  }
}

/**
 * 全局命令面板（⌘K / Ctrl+K）
 * 一屏完成：跳转页面、快速新建、搜索客户/线索/商机等记录。
 * 对标 Salesforce「Global Actions + Search」、HubSpot「⌘K」、纷享销客「快捷导航」。
 */
export function CommandPalette() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<InputRef>(null)

  // 快捷键：⌘K / Ctrl+K 打开，Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      setHits([])
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  // 记录搜索
  useEffect(() => {
    const kw = q.trim()
    if (!open || kw.length < 2) {
      setHits([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      void api<{ items: Hit[] }>(
        `/search?q=${encodeURIComponent(kw)}&types=account,contact,opportunity,lead,contract,quote,ticket,product`,
      )
        .then((r) => {
          if (!cancelled) setHits(r.items ?? [])
        })
        .catch(() => {
          if (!cancelled) setHits([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 260)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [q, open])

  const go = useCallback(
    (path: string, label: string) => {
      pushRecent(path, label)
      setOpen(false)
      nav(path)
    },
    [nav],
  )

  const rows = useMemo<Row[]>(() => {
    const kw = q.trim().toLowerCase()
    const match = (text: string) => !kw || text.toLowerCase().includes(kw)
    const list: Row[] = []

    // 1. 快速新建（对齐主流 CRM 的 Global Actions）
    const creates: Array<{
      label: string
      path: string
      entity: CreateEntity
      icon: React.ReactNode
      keywords: string
    }> = [
      { label: t('common.newLead'), path: '/leads', entity: 'lead', icon: <PlusOutlined />, keywords: 'new lead xiansuo' },
      { label: t('common.newAccount'), path: '/accounts', entity: 'account', icon: <TeamOutlined />, keywords: 'new account kehu' },
      {
        label: t('common.newContact'),
        path: '/contacts',
        entity: 'contact',
        icon: <UserAddOutlined />,
        keywords: 'new contact lianxiren',
      },
      {
        label: t('common.newDeal'),
        path: '/opportunities',
        entity: 'opportunity',
        icon: <ThunderboltOutlined />,
        keywords: 'new deal shangji',
      },
      { label: t('common.newFollowUp'), path: '/activities', entity: 'activity', icon: <PhoneOutlined />, keywords: 'new activity genjin' },
      { label: t('cmp.commandPalette.newQuote'), path: '/quotes', entity: 'quote', icon: <FileTextOutlined />, keywords: 'new quote baojia' },
    ]
    for (const c of creates) {
      if (match(c.label) || match(c.keywords)) {
        list.push({
          key: `create:${c.entity}`,
          group: t('command.quickCreate'),
          label: c.label,
          icon: c.icon,
          run: () => {
            pushRecent(c.path, c.label)
            setOpen(false)
            nav(c.path)
            requestCreate(c.entity)
          },
        })
      }
    }

    // 1.5 AI 助手
    if (match(t('feature.ai')) || match('ai assistant copilot zhushou')) {
      list.push({
        key: 'ai:assistant',
        group: t('cmp.commandPalette.ai'),
        label: t('common.aiAssistantSummaryNext'),
        icon: <RobotOutlined />,
        run: () => {
          setOpen(false)
          window.dispatchEvent(new CustomEvent('crm:ai-open'))
        },
      })
    }

    // 2. 最近访问
    for (const r of readRecent()) {
      if (match(r.label)) {
        list.push({
          key: `recent:${r.path}`,
          group: t('command.recent'),
          label: r.label,
          hint: r.path,
          icon: <ArrowRightOutlined />,
          run: () => go(r.path, r.label),
        })
      }
    }

    // 3. 导航
    for (const item of NAV_SEARCH_ITEMS) {
      if (match(item.label) || match(item.keywords ?? '') || match(item.key)) {
        list.push({
          key: `nav:${item.key}`,
          group: t('command.navigate'),
          label: item.label,
          hint: item.key,
          icon: item.icon,
          run: () => go(item.key, item.label),
        })
      }
    }

    // 4. 记录搜索结果
    for (const h of hits) {
      const label = `${TYPE_LABEL[h.type] ?? h.type} · ${h.title}`
      if (!match(label) && !match(h.subtitle ?? '')) continue
      list.push({
        key: `hit:${h.type}:${h.id}`,
        group: t('command.results'),
        label,
        hint: h.subtitle,
        icon: <SearchOutlined />,
        run: () => go((ROUTE[h.type] ?? (() => '/home'))(h.id), label),
      })
    }

    return list
  }, [q, hits, go, nav])

  useEffect(() => {
    if (active >= rows.length) setActive(0)
  }, [rows.length, active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      rows[active]?.run()
    }
  }

  // 分组渲染
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>()
    rows.forEach((r) => {
      const arr = map.get(r.group) ?? []
      arr.push(r)
      map.set(r.group, arr)
    })
    return [...map.entries()]
  }, [rows])

  let flatIndex = -1

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      closable={false}
      width={580}
      styles={{ body: { padding: 0 }, content: { padding: 0, borderRadius: 14 } }}
      style={{ top: 96 }}
      destroyOnHidden
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--crm-border)' }}>
        <Input
          ref={inputRef}
          size="large"
          variant="borderless"
          prefix={<SearchOutlined style={{ color: 'var(--crm-muted-2)' }} />}
          placeholder={t('command.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div style={{ maxHeight: 420, overflow: 'auto', padding: 8 }}>
        {!isLoggedIn() || (rows.length === 0 && !searching) ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={q ? t('cmp.commandPalette.noMatches') : t('cmp.commandPalette.typeToSearchOr')}
            style={{ padding: '24px 0' }}
          />
        ) : (
          grouped.map(([group, items]) => (
            <div key={group}>
              <div className="crm-command-group">{group}</div>
              {items.map((r) => {
                flatIndex += 1
                const idx = flatIndex
                return (
                  <div
                    key={r.key}
                    className={`crm-command-item${idx === active ? ' active' : ''}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={r.run}
                  >
                    <span style={{ color: 'var(--crm-accent)', width: 16 }}>{r.icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
                    {r.hint ? (
                      <Tag bordered={false} style={{ marginRight: 0, color: 'var(--crm-muted)' }}>
                        {r.hint}
                      </Tag>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '8px 14px',
          borderTop: '1px solid var(--crm-border)',
          color: 'var(--crm-muted-2)',
          fontSize: 11,
        }}
      >
        <span>{t('cmp.commandPalette.select')}</span>
        <span>{t('cmp.commandPalette.enterOpen')}</span>
        <span>{t('cmp.commandPalette.escClose')}</span>
      </div>
    </Modal>
  )
}

/** 头部触发器：点击或 ⌘K 打开 */
export function CommandTrigger() {
  return (
    <button
      type="button"
      className="crm-command-trigger"
      onClick={() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
      }}
    >
      <SearchOutlined />
      <span>{t('cmp.commandPalette.searchOrJumpTo')}</span>
      <kbd>⌘K</kbd>
    </button>
  )
}

export default CommandPalette
