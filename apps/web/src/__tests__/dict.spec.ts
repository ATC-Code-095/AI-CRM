import { describe, expect, it } from 'vitest'
import { parseMoney, addMoney } from '@zhixiao-crm/shared'
import zh from '../locales/zh-CN.json'
import en from '../locales/en-US.json'

describe('web shared money', () => {
  it('parses money', () => {
    expect(parseMoney('1.2')).toBe('1.20')
    expect(addMoney('1.00', '2.00')).toBe('3.00')
  })
})

describe('i18n dictionaries', () => {
  it('zh and en have same keys', () => {
    const zk = Object.keys(zh).sort()
    const ek = Object.keys(en).sort()
    const onlyZh = zk.filter((k) => !ek.includes(k))
    const onlyEn = ek.filter((k) => !zk.includes(k))
    expect(onlyZh, `only in zh: ${onlyZh}`).toEqual([])
    expect(onlyEn, `only in en: ${onlyEn}`).toEqual([])
    expect(zk.length).toBeGreaterThan(30)
  })

  it('has core nav keys', () => {
    for (const k of ['nav.home', 'nav.accounts', 'common.save', 'error.code.40100']) {
      expect((zh as Record<string, string>)[k]).toBeTruthy()
    }
  })
})
