/**
 * 欧洲央行参考汇率（经 Frankfurter 公开接口获取，免费、无需密钥，工作日每天更新一次）。
 * https://frankfurter.dev
 */
export const ECB_URL = 'https://api.frankfurter.dev/v1/latest'

/** 欧洲央行公布的币种 */
export const ECB_CURRENCIES = [
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR',
  'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]

export interface FetchedRates {
  /** 汇率所属日期（YYYY-MM-DD） */
  date: string
  /** 1 单位外币 = rate 单位本位币 */
  rates: Record<string, number>
}

/** 取「外币 → 本位币」汇率：接口返回 1 本位币 = x 外币，取倒数 */
export async function fetchEcbRates(base: string, currencies: string[], fetchImpl: typeof fetch = fetch): Promise<FetchedRates> {
  const symbols = currencies.filter((c) => c !== base)
  if (!symbols.length) return { date: new Date().toISOString().slice(0, 10), rates: {} }
  const url = `${ECB_URL}?base=${encodeURIComponent(base)}&symbols=${symbols.map(encodeURIComponent).join(',')}`
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`rate source HTTP ${res.status}`)
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> }
  if (!json.date || !json.rates) throw new Error('rate source returned no rates')
  const rates: Record<string, number> = {}
  for (const [cur, perBase] of Object.entries(json.rates)) {
    if (perBase > 0) rates[cur] = Number((1 / perBase).toFixed(8))
  }
  return { date: json.date, rates }
}
