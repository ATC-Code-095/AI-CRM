/** 移动端离线草稿：断网时暂存表单，恢复联网后可同步 */
const KEY = 'crm.offline.drafts'
const LAST_SYNC_KEY = 'crm.offline.lastSync'

export type Draft = {
  id: string
  kind: string
  payload: Record<string, unknown>
  createdAt: string
  status?: 'pending' | 'failed'
  error?: string
}

export function loadDrafts(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as Draft[]
  } catch {
    return []
  }
}

export function saveDraft(kind: string, payload: Record<string, unknown>): Draft {
  const drafts = loadDrafts()
  const draft: Draft = {
    id: `d-${Date.now()}`,
    kind,
    payload,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }
  drafts.push(draft)
  localStorage.setItem(KEY, JSON.stringify(drafts))
  return draft
}

export function removeDraft(id: string) {
  localStorage.setItem(
    KEY,
    JSON.stringify(loadDrafts().filter((d) => d.id !== id)),
  )
}

export function clearDrafts() {
  localStorage.removeItem(KEY)
}

export function getLastSync(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

export async function syncDrafts(
  send: (kind: string, payload: Record<string, unknown>) => Promise<unknown>,
): Promise<{ ok: number; failed: number }> {
  const drafts = loadDrafts()
  let ok = 0
  let failed = 0
  const next: Draft[] = []
  for (const d of drafts) {
    try {
      await send(d.kind, d.payload)
      ok++
    } catch (e) {
      failed++
      next.push({
        ...d,
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  localStorage.setItem(KEY, JSON.stringify(next))
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString())
  return { ok, failed }
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export function onNetworkChange(cb: (online: boolean) => void) {
  if (typeof window === 'undefined') return () => undefined
  const on = () => cb(true)
  const off = () => cb(false)
  window.addEventListener('online', on)
  window.addEventListener('offline', off)
  return () => {
    window.removeEventListener('online', on)
    window.removeEventListener('offline', off)
  }
}
