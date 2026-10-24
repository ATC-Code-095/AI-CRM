import { useQuery } from '@tanstack/react-query'
import { AutoComplete, Input, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, isLoggedIn } from '../api/client'
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
  contact: () => `/accounts`,
  contract: () => `/contracts`,
  quote: (id) => `/quotes/${id}`,
  ticket: () => `/tickets`,
  product: () => `/products`,
}

const TYPE_COLOR: Record<string, string> = {
  account: 'blue',
  lead: 'cyan',
  opportunity: 'purple',
  contact: 'geekblue',
  contract: 'green',
  quote: 'orange',
  ticket: 'red',
  product: 'gold',
}

export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 280)
    return () => clearTimeout(t)
  }, [q])

  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () =>
      api<{ items: Hit[] }>(
        `/search?q=${encodeURIComponent(debounced)}&types=account,contact,opportunity,lead,contract,quote,ticket,product`,
      ),
    enabled: isLoggedIn() && debounced.length >= 2,
    retry: false,
  })

  const options = useMemo(
    () =>
      (data?.items ?? []).map((h) => ({
        value: `${h.type}:${h.id}`,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={TYPE_COLOR[h.type] ?? 'default'} style={{ marginRight: 0 }}>
              {h.type}
            </Tag>
            <span style={{ flex: 1 }}>{h.title}</span>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{h.subtitle ?? ''}</span>
          </div>
        ),
      })),
    [data],
  )

  return (
    <AutoComplete
      style={{ width: compact ? '100%' : 280 }}
      open={open}
      options={options}
      onOpenChange={setOpen}
      onSelect={(val) => {
        const [type, id] = val.split(':')
        const builder = ROUTE[type]
        if (builder) {
          nav(type === 'contact' || type === 'ticket' || type === 'product' ? builder(id) : builder(id))
        } else {
          nav('/home')
        }
        setOpen(false)
        setQ('')
      }}
    >
      <Input.Search
        id="crm-global-search"
        placeholder={t('cmp.globalSearch.searchAccountsLeadsDeals')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        size={compact ? 'middle' : 'small'}
        allowClear
      />
    </AutoComplete>
  )
}
