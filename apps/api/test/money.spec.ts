import { describe, expect, it } from 'vitest'
import { addMoney, mulMoney, parseMoney, formatMoney } from '../../packages/shared/src/money'

describe('money', () => {
  it('parses and normalizes', () => {
    expect(parseMoney('10')).toBe('10.00')
    expect(parseMoney('10.5')).toBe('10.50')
    expect(parseMoney('-3.2')).toBe('-3.20')
  })

  it('adds', () => {
    expect(addMoney('10.10', '20.20')).toBe('30.30')
  })

  it('multiplies with discount', () => {
    // 100 * 2 * (1-0.5) = 100
    expect(mulMoney('100.00', '2', '0.5')).toBe('100.00')
  })

  it('formats by locale', () => {
    expect(formatMoney('1234.50', 'zh-CN', 'CNY')).toContain('1,234.50')
    expect(formatMoney('1234.50', 'en-US', 'USD')).toContain('1,234.50')
  })
})
