import { createHash } from 'crypto'
import { BizException, ErrorCodes } from '@ai-crm/shared'

/**
 * 简易幂等：Redis 不可用时用内存 Map（单实例开发）
 * 生产应换 Redis，TTL 24h（docs/13 §2.1）
 */
const store = new Map<string, { at: number; hash: string; response: unknown }>()

function hashBody(body: unknown) {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex')
}

export function idempotentGuard(
  tenantId: string,
  key: string | undefined,
  body: unknown,
): { replay?: unknown } {
  if (!key) return {}
  const id = `${tenantId}:${key}`
  const h = hashBody(body)
  const hit = store.get(id)
  const now = Date.now()
  if (hit && now - hit.at < 24 * 3600_000) {
    if (hit.hash !== h) {
      throw new BizException(ErrorCodes.CONFLICT, 'idempotency key reused with different body')
    }
    return { replay: hit.response }
  }
  return {}
}

export function idempotentStore(tenantId: string, key: string | undefined, body: unknown, response: unknown) {
  if (!key) return
  store.set(`${tenantId}:${key}`, { at: Date.now(), hash: hashBody(body), response })
}

export function clearIdempotentCache() {
  store.clear()
}
