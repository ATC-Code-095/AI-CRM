import { useQuery } from '@tanstack/react-query'
import { api, isLoggedIn } from '../api/client'

export type FeatureKey =
  | 'feature.ai'
  | 'feature.webhooks'
  | 'feature.checkin'
  | 'feature.import'

export function useFeature(key: FeatureKey, defaultValue = true): boolean {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ key: string; value: unknown }[]>('/settings'),
    enabled: isLoggedIn(),
    staleTime: 60_000,
    retry: false,
  })
  const row = (data ?? []).find((x) => x.key === key)
  if (!row) return defaultValue
  return Boolean(row.value)
}
