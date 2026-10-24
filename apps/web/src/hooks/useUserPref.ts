import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isLoggedIn } from '../api/client'

/**
 * 用户级偏好（服务端 scope=USER），替代纯 localStorage：
 * 换设备 / 清缓存后列表视图、星标关注仍然在。
 */
export function useUserPref<T>(key: string, fallback: T) {
  const q = useQuery({
    queryKey: ['pref', key],
    queryFn: () => api<{ value: T | null }>(`/preferences?key=${encodeURIComponent(key)}`),
    enabled: isLoggedIn(),
    retry: false,
    staleTime: 30_000,
  })
  return {
    value: (q.data?.value ?? fallback) as T,
    loading: q.isLoading,
    ready: q.isFetched,
  }
}

export function useSetUserPref() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { key: string; value: unknown }) =>
      api('/preferences', { method: 'PUT', body: JSON.stringify(p) }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['pref', v.key] })
    },
  })
}

/** 团队共享项（key 需以 shared. 开头） */
export interface SharedItem<T> {
  userId: string
  ownerName: string
  value: T
  mine: boolean
}

export function useSharedPref<T>(key: string, enabled = true) {
  const q = useQuery({
    queryKey: ['pref-shared', key],
    queryFn: () =>
      api<{ items: SharedItem<T>[] }>(`/preferences/shared?key=${encodeURIComponent(key)}`),
    enabled: isLoggedIn() && enabled,
    retry: false,
  })
  return { items: q.data?.items ?? [], loading: q.isLoading }
}

/** 星标关注（跨设备） */
export interface StarItem {
  type: 'ACCOUNT' | 'OPPORTUNITY' | 'LEAD' | 'CONTACT'
  id: string
  name: string
  at: string
}

export const STARS_KEY = 'stars'

export function useStars() {
  const { value, loading, ready } = useUserPref<StarItem[]>(STARS_KEY, [])
  const set = useSetUserPref()

  const toggle = (item: Omit<StarItem, 'at'>) => {
    const exists = value.some((s) => s.id === item.id)
    const next = exists
      ? value.filter((s) => s.id !== item.id)
      : [{ ...item, at: new Date().toISOString() }, ...value].slice(0, 100)
    set.mutate({ key: STARS_KEY, value: next })
  }

  const remove = (id: string) => {
    set.mutate({ key: STARS_KEY, value: value.filter((s) => s.id !== id) })
  }

  const has = (id: string) => value.some((s) => s.id === id)

  return { stars: value, loading, ready, toggle, remove, has, saving: set.isPending }
}
