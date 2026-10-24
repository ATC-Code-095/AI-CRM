import { describe, expect, it } from 'vitest'
import { addMoney, mulMoney, parseMoney } from '../../packages/shared/src/money'

describe('money edge cases', () => {
  it('normalizes zeros and rejects garbage', () => {
    expect(parseMoney('0')).toBe('0.00')
    expect(() => parseMoney('abc')).toThrow()
    expect(() => parseMoney('1.234')).toThrow()
  })
  it('adds negatives', () => {
    expect(addMoney('10.00', '-3.50')).toBe('6.50')
  })
  it('discount bounds', () => {
    expect(mulMoney('10.00', '3', '0')).toBe('30.00')
    expect(() => mulMoney('10.00', '1', '1.5')).toThrow()
  })
})
