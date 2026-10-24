/** 金额一律用十进制字符串进出；内部用整数分或 Decimal 库，禁止裸 float 累计 */

export type Money = string

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/

export function parseMoney(input: string | number): Money {
  const s = typeof input === 'number' ? input.toFixed(2) : input.trim()
  if (!MONEY_RE.test(s)) {
    throw new Error(`Invalid money: ${input}`)
  }
  // normalize to 2 decimal places
  const [i, f = ''] = s.split('.')
  const neg = i.startsWith('-')
  const intPart = neg ? i.slice(1) : i
  const frac = (f + '00').slice(0, 2)
  return `${neg ? '-' : ''}${intPart}.${frac}`
}

export function addMoney(a: Money, b: Money): Money {
  const [ai, af] = split(a)
  const [bi, bf] = split(b)
  const cents = toCents(ai, af) + toCents(bi, bf)
  return fromCents(cents)
}

export function mulMoney(a: Money, qty: string, discountRate = '0'): Money {
  // amount = qty * unitPrice * (1 - discountRate)
  const unit = toCents(...split(a))
  const q = Math.round(Number(qty) * 10000) // qty up to 4 decimals
  const disc = Math.round(Number(discountRate) * 10000)
  if (disc < 0 || disc > 10000) throw new Error('discountRate out of range')
  // unit_cents * qty / 10000 * (10000-disc) / 10000
  const cents = Math.round((unit * q * (10000 - disc)) / 10000 / 10000)
  return fromCents(cents)
}

export function formatMoney(
  value: Money,
  locale: string,
  currency = 'CNY',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function split(m: Money): [string, string] {
  const [i, f = '00'] = parseMoney(m).split('.')
  return [i, f]
}

function toCents(i: string, f: string): number {
  const neg = i.startsWith('-')
  const abs = Number(i.replace('-', '') + f)
  return neg ? -abs : abs
}

function fromCents(cents: number): Money {
  const neg = cents < 0
  const abs = Math.abs(cents)
  const i = String(Math.floor(abs / 100))
  const f = String(abs % 100).padStart(2, '0')
  return `${neg ? '-' : ''}${i}.${f}`
}
