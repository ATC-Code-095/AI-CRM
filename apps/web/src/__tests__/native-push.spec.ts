import { describe, expect, it } from 'vitest'
import { pushTarget } from '../utils/nativePush'

describe('pushTarget', () => {
  it('routes a tapped push to the related record', () => {
    expect(pushTarget({ entityType: 'LEAD', entityId: 'l1' })).toBe('/leads/l1')
    expect(pushTarget({ entityType: 'OPPORTUNITY', entityId: 'o1' })).toBe('/opportunities/o1')
    expect(pushTarget({ entityType: 'QUOTE', entityId: 'q1' })).toBe('/quotes/q1')
    expect(pushTarget({ entityType: 'CONTRACT', entityId: 'c1' })).toBe('/contracts')
    expect(pushTarget({ type: 'APPROVAL_TODO' })).toBe('/approvals')
    expect(pushTarget({ type: 'API_USAGE_ALERT' })).toBe('/notifications')
  })
})
