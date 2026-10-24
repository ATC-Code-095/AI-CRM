import { describe, expect, it } from 'vitest'
import { createLeadAssigner } from '../src/modules/lead/lead-assign'
import { nextDocNo } from '../src/common/doc-no'

/** 最小内存版 Prisma：只实现分配器与单号用到的方法 */
function fakeDb(opts: { settings?: Record<string, unknown>; sales?: string[]; openLeads?: Record<string, number> }) {
  const settings = new Map(Object.entries(opts.settings ?? {}).map(([k, v], i) => [k, { id: `s${i}`, key: k, value: v }]))
  const seq = new Map<string, number>()
  const db = {
    setting: {
      findFirst: async ({ where }: { where: { key: string } }) => settings.get(where.key) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { value: unknown } }) => {
        for (const s of settings.values()) if (s.id === where.id) s.value = data.value
      },
      create: async ({ data }: { data: { key: string; value: unknown } }) => {
        settings.set(data.key, { id: `s${settings.size}`, key: data.key, value: data.value })
      },
    },
    user: { findMany: async () => (opts.sales ?? []).map((id) => ({ id })) },
    lead: {
      groupBy: async () =>
        Object.entries(opts.openLeads ?? {}).map(([ownerId, n]) => ({ ownerId, _count: { _all: n } })),
    },
    docSequence: {
      upsert: async ({ create }: { create: { prefix: string; dayKey: string } }) => {
        const k = create.prefix + create.dayKey
        seq.set(k, (seq.get(k) ?? 0) + 1)
        return { current: seq.get(k)! }
      },
    },
  }
  return { db: db as never, settings }
}

describe('lead assigner', () => {
  it('默认 LOAD_BALANCE：分给未关闭线索最少的销售，并在内存中累加', async () => {
    const { db } = fakeDb({ sales: ['a', 'b', 'c'], openLeads: { a: 5, b: 1, c: 1 } })
    const as = await createLeadAssigner(db, 't')
    expect(as.rule).toBe('LOAD_BALANCE')
    expect([await as.next(), await as.next(), await as.next()]).toEqual(['b', 'c', 'b'])
  })

  it('ROUND_ROBIN：按游标轮流并写回游标', async () => {
    const { db, settings } = fakeDb({ sales: ['a', 'b', 'c'], settings: { 'lead.assign_rule': 'ROUND_ROBIN', 'lead.assign_cursor': 2 } })
    const as = await createLeadAssigner(db, 't')
    expect([await as.next(), await as.next(), await as.next()]).toEqual(['c', 'a', 'b'])
    await as.save()
    expect(settings.get('lead.assign_cursor')?.value).toBe(2)
  })

  it('MANUAL 或没有销售时不分配', async () => {
    expect(await (await createLeadAssigner(fakeDb({ sales: ['a'], settings: { 'lead.assign_rule': 'MANUAL' } }).db, 't')).next()).toBeNull()
    expect(await (await createLeadAssigner(fakeDb({ sales: [] }).db, 't')).next()).toBeNull()
  })

  it('assign_on_create 默认开启，可关闭；isSales 判断销售身份', async () => {
    const on = await createLeadAssigner(fakeDb({ sales: ['a'] }).db, 't')
    expect(on.onCreate).toBe(true)
    expect(on.isSales('a')).toBe(true)
    expect(on.isSales('admin')).toBe(false)
    const off = await createLeadAssigner(fakeDb({ sales: ['a'], settings: { 'lead.assign_on_create': false } }).db, 't')
    expect(off.onCreate).toBe(false)
  })
})

describe('nextDocNo prefixes', () => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  it('未配置时使用默认前缀', async () => {
    expect(await nextDocNo(fakeDb({}).db, 't', 'QT')).toBe(`QT${day}0001`)
  })

  it('使用业务参数中的前缀，非法前缀被忽略', async () => {
    const { db } = fakeDb({ settings: { 'quote.no_prefix': 'BJ', 'contract.no_prefix': 'bad prefix!' } })
    expect(await nextDocNo(db, 't', 'QT')).toBe(`BJ${day}0001`)
    expect(await nextDocNo(db, 't', 'HT')).toBe(`HT${day}0001`)
  })

  it('未列入可配置清单的单据保持原前缀', async () => {
    expect(await nextDocNo(fakeDb({ settings: { 'quote.no_prefix': 'BJ' } }).db, 't', 'ST')).toBe(`ST${day}0001`)
  })
})
