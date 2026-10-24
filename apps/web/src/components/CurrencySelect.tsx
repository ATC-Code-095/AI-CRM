import { useQuery } from '@tanstack/react-query'
import { Select } from 'antd'
import { api } from '../api/client'
import { t } from '../i18n'

export interface CurrencyOverview {
  base: string
  currencies: string[]
  latest: Record<string, { rate: string; effectiveDate: string }>
  rates: { id: string; currency: string; rate: string; effectiveDate: string; source?: string }[]
}

/** 本位币与已录入汇率的币种（单据只能选这些） */
export function useCurrencies() {
  return useQuery({
    queryKey: ['currency'],
    queryFn: () => api<CurrencyOverview>('/currency'),
    staleTime: 60_000,
  })
}

/** 单据币种选择：留空表示本位币（报价、合同不填时沿用关联商机的币种） */
export function CurrencySelect(props: { value?: string; onChange?: (v?: string) => void; disabled?: boolean }) {
  const q = useCurrencies()
  const base = q.data?.base
  return (
    <Select
      allowClear
      disabled={props.disabled}
      value={props.value}
      onChange={props.onChange}
      placeholder={base ? t('currency.defaultBase', { v: base }) : undefined}
      options={(q.data?.currencies ?? []).map((c) => ({
        value: c,
        label: c === base ? `${c} · ${t('currency.base')}` : `${c} · 1 = ${q.data?.latest[c]?.rate ?? '?'} ${base}`,
      }))}
    />
  )
}

/** 外币金额旁标注币种代码；本位币不标 */
export function currencySuffix(currency: string | undefined, base: string | undefined) {
  return currency && base && currency !== base ? ` ${currency}` : ''
}
