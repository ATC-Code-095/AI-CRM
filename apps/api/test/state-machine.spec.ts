import { describe, expect, it } from 'vitest'

/** 与 leads.service.canTransit / ticket ALLOWED 对齐的纯函数（契约） */
function canTransitLead(from: string, to: string): boolean {
  const map: Record<string, string[]> = {
    NEW: ['ACCEPTED', 'CULTIVATING', 'CLOSED_LOST'],
    ACCEPTED: ['CULTIVATING', 'CLOSED_LOST', 'CONVERTED'],
    CULTIVATING: ['CONVERTED', 'CLOSED_LOST'],
    CONVERTED: [],
    CLOSED_LOST: [],
  }
  return (map[from] ?? []).includes(to)
}

function canTransitTicket(from: string, to: string): boolean {
  const map: Record<string, string[]> = {
    NEW: ['PROCESSING', 'CLOSED'],
    PROCESSING: ['WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'],
    WAITING_CUSTOMER: ['PROCESSING', 'RESOLVED', 'CLOSED'],
    RESOLVED: ['CLOSED', 'PROCESSING'],
    CLOSED: [],
  }
  return (map[from] ?? []).includes(to)
}

describe('lead state machine', () => {
  it('allows accept → convert', () => {
    expect(canTransitLead('ACCEPTED', 'CONVERTED')).toBe(true)
    expect(canTransitLead('NEW', 'CONVERTED')).toBe(false)
  })
  it('terminal states cannot move', () => {
    expect(canTransitLead('CONVERTED', 'NEW')).toBe(false)
    expect(canTransitLead('CLOSED_LOST', 'CULTIVATING')).toBe(false)
  })
})

describe('ticket state machine', () => {
  it('process → resolve → close', () => {
    expect(canTransitTicket('NEW', 'PROCESSING')).toBe(true)
    expect(canTransitTicket('PROCESSING', 'RESOLVED')).toBe(true)
    expect(canTransitTicket('RESOLVED', 'CLOSED')).toBe(true)
    expect(canTransitTicket('CLOSED', 'PROCESSING')).toBe(false)
  })
})
