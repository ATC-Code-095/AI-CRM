import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export type EntityScope = {
  entities: { id: string; name: string }[]
  accountEntity: Record<string, string>
  allowedIds: string[] | null
  entityOf: (accountId?: string | null) => string
  filterByEntity: <T extends { id?: string; accountId?: string }>(
    rows: T[],
    entityId?: string | null,
  ) => T[]
}

/** 集团法人主体：可见范围 + 客户归属，用于列表过滤 */
export function useEntityScope(): EntityScope {
  const entsQ = useQuery({
    queryKey: ['group-entities-mini'],
    queryFn: () => api<{ items: { id: string; name: string }[] }>('/group/entities'),
    retry: false,
    staleTime: 60_000,
  })
  const mapQ = useQuery({
    queryKey: ['group-account-entities'],
    queryFn: () => api<{ map: Record<string, string> }>('/group/account-entities'),
    retry: false,
    staleTime: 60_000,
  })
  const scopesQ = useQuery({
    queryKey: ['group-user-scopes'],
    queryFn: () => api<{ map: Record<string, string[]> }>('/group/user-scopes'),
    retry: false,
    staleTime: 60_000,
  })

  const entities = entsQ.data?.items ?? []
  const accountEntity = mapQ.data?.map ?? {}
  const map = scopesQ.data?.map ?? {}
  let meId = ''
  try {
    meId = String((JSON.parse(localStorage.getItem('me_cache') || '{}') as { id?: string }).id ?? '')
  } catch {
    meId = ''
  }
  // 未配置则不限制；配置了则按主体白名单过滤
  const raw = meId ? map[meId] : undefined
  const allowedIds = raw === undefined ? null : raw

  const entityOf = (accountId?: string | null) =>
    (accountId && accountEntity[accountId]) || ''

  const filterByEntity = <T extends { id?: string; accountId?: string }>(
    rows: T[],
    entityId?: string | null,
  ): T[] => {
    let out = rows
    if (entityId) {
      out = out.filter((r) => {
        const accId = r.accountId ?? r.id
        return accountEntity[String(accId)] === entityId
      })
    }
    if (allowedIds) {
      const allow = new Set(allowedIds)
      out = out.filter((r) => {
        const accId = r.accountId ?? r.id
        const e = accountEntity[String(accId)]
        // 未归属主体的记录：仅 ALL 范围可见；已归属则按范围
        return e ? allow.has(e) : allow.size === 0
      })
    }
    return out
  }

  return { entities, accountEntity, allowedIds, entityOf, filterByEntity }
}
