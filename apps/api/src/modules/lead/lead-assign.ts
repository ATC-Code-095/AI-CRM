import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * 线索自动分配（docs/13-spec-supplements.md §分配规则）：
 * - 只分给角色为 SALES_REP 且在职的用户
 * - lead.assign_rule：LOAD_BALANCE（默认，未关闭线索最少者优先，并列取 id 较小）/ ROUND_ROBIN（按 id 顺序轮流，游标存 lead.assign_cursor）/ MANUAL（关闭自动分配）
 * - lead.assign_on_create（默认 true）：非销售人员创建的线索（官网表单、导入、管理员录入）创建时即分配给销售
 */
export type AssignRule = 'MANUAL' | 'ROUND_ROBIN' | 'LOAD_BALANCE'

type Db = PrismaClient | Prisma.TransactionClient

const OPEN_STATUSES = ['NEW', 'ACCEPTED', 'CULTIVATING']

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

async function readSetting(db: Db, tenantId: string, key: string) {
  return db.setting.findFirst({ where: { tenantId, scope: 'TENANT', key, userId: null } })
}

export interface LeadAssigner {
  rule: AssignRule
  onCreate: boolean
  /** 在职销售 id（按 id 排序） */
  pool: string[]
  /** 该用户是否属于销售分配池 */
  isSales(userId: string): boolean
  /** 按规则选下一位负责人；MANUAL 或无销售时返回 null */
  next(): Promise<string | null>
  /** 写回轮询游标（ROUND_ROBIN） */
  save(): Promise<void>
}

export async function createLeadAssigner(db: Db, tenantId: string): Promise<LeadAssigner> {
  const ruleRow = await readSetting(db, tenantId, 'lead.assign_rule')
  const raw = asText(ruleRow?.value).toUpperCase()
  const rule: AssignRule = raw === 'MANUAL' || raw === 'ROUND_ROBIN' ? raw : 'LOAD_BALANCE'
  const onCreateRow = await readSetting(db, tenantId, 'lead.assign_on_create')
  const onCreate = !['false', '0', 'no'].includes(asText(onCreateRow?.value).toLowerCase())

  const pool = (
    await db.user.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        deletedAt: null,
        userRoles: { some: { role: { code: 'SALES_REP', deletedAt: null } } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
  ).map((u) => u.id)
  const poolSet = new Set(pool)

  // LOAD_BALANCE：一次性统计负载，之后在内存中累加，避免批量分配时反复查询
  let load: Map<string, number> | null = null
  const loadMap = async () => {
    if (load) return load
    load = new Map(pool.map((id) => [id, 0]))
    const rows = await db.lead.groupBy({
      by: ['ownerId'],
      where: { tenantId, deletedAt: null, status: { in: OPEN_STATUSES }, ownerId: { in: pool } },
      _count: { _all: true },
    })
    for (const r of rows) load.set(r.ownerId, r._count._all)
    return load
  }

  const cursorRow = rule === 'ROUND_ROBIN' ? await readSetting(db, tenantId, 'lead.assign_cursor') : null
  let cursor = Number(asText(cursorRow?.value)) || 0
  let cursorDirty = false

  return {
    rule,
    onCreate,
    pool,
    isSales: (userId) => poolSet.has(userId),
    async next() {
      if (rule === 'MANUAL' || !pool.length) return null
      if (rule === 'ROUND_ROBIN') {
        const id = pool[cursor % pool.length]
        cursor = (cursor + 1) % pool.length
        cursorDirty = true
        return id
      }
      const m = await loadMap()
      let best = pool[0]
      for (const id of pool) if ((m.get(id) ?? 0) < (m.get(best) ?? 0)) best = id
      m.set(best, (m.get(best) ?? 0) + 1)
      return best
    },
    async save() {
      if (!cursorDirty) return
      if (cursorRow) {
        await db.setting.update({ where: { id: cursorRow.id }, data: { value: cursor } })
      } else {
        await db.setting.create({ data: { tenantId, scope: 'TENANT', key: 'lead.assign_cursor', value: cursor } })
      }
      cursorDirty = false
    },
  }
}
