import { describe, expect, it, vi } from 'vitest'
import { fetchEcbRates } from '../src/modules/currency/ecb-rates'

describe('ECB reference rates', () => {
  it('requests rates for the base currency and inverts them to "1 foreign = x base"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ amount: 1, base: 'CNY', date: '2026-10-22', rates: { USD: 0.14, EUR: 0.125 } }), { status: 200 }),
    )
    const r = await fetchEcbRates('CNY', ['USD', 'EUR', 'CNY'], fetchImpl as unknown as typeof fetch)
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.frankfurter.dev/v1/latest?base=CNY&symbols=USD,EUR')
    expect(r).toEqual({ date: '2026-10-22', rates: { USD: 7.14285714, EUR: 8 } })
  })

  it('fails clearly on an error response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"message":"not found"}', { status: 404 }))
    await expect(fetchEcbRates('CNY', ['XYZ'], fetchImpl as unknown as typeof fetch)).rejects.toThrow('HTTP 404')
  })

  it('does not call the source when only the base currency is requested', async () => {
    const fetchImpl = vi.fn()
    const r = await fetchEcbRates('CNY', ['CNY'], fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(r.rates).toEqual({})
  })
})
