import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 列表筛选状态写入 URL query（docs/06-ui-spec.md §5.7）
 *
 * 好处：刷新/分享/回退都保留筛选条件；`?q=华为` 可直接发给同事。
 * 默认值不写进 URL，保持地址干净。
 */
export function useUrlState(key: string, initial = ''): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? initial

  const set = useCallback(
    (v: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!v || v === initial) next.delete(key)
          else next.set(key, v)
          return next
        },
        { replace: true },
      )
    },
    [key, initial, setParams],
  )

  return [value, set]
}
