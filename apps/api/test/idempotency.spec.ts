import { describe, expect, it } from 'vitest'
import {
  clearIdempotentCache,
  idempotentGuard,
  idempotentStore,
} from '../src/common/idempotency'

describe('idempotency', () => {
  it('replays same body', () => {
    clearIdempotentCache()
    const body = { amount: '10' }
    expect(idempotentGuard('t1', 'k1', body).replay).toBeUndefined()
    idempotentStore('t1', 'k1', body, { id: 'p1' })
    const r = idempotentGuard('t1', 'k1', body)
    expect(r.replay).toEqual({ id: 'p1' })
  })

  it('rejects different body with same key', () => {
    clearIdempotentCache()
    idempotentStore('t1', 'k2', { a: 1 }, { ok: true })
    expect(() => idempotentGuard('t1', 'k2', { a: 2 })).toThrow()
  })
})
