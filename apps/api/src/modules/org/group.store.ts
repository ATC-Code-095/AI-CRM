import { Injectable } from '@nestjs/common'
import type {
  GroupBudget,
  GroupEntity,
  GroupExpenseAlloc,
  GroupExpenseAllocLine,
  GroupExpenseClaim,
  GroupFundTransfer,
  GroupSettlement,
} from '@prisma/client'
import { PrismaService } from '../../common/prisma/prisma.service'

export type Entity = {
  id: string
  code: string
  name: string
  shortName?: string
  parentId?: string | null
  type: 'GROUP' | 'SUBSIDIARY' | 'BRANCH'
  region?: string
  industry?: string
  status: 'ACTIVE' | 'INACTIVE'
}

/** 无主体配置时的「集团总部」占位主体 */
export const HQ_ENTITY: Entity = {
  id: '__hq__',
  code: 'HQ',
  name: '集团总部',
  type: 'GROUP',
  status: 'ACTIVE',
  region: '',
  industry: '',
  parentId: null,
}

const money = (v: { toString(): string } | null | undefined) => Number(v ?? 0).toFixed(2)
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined)

export function toEntity(e: GroupEntity): Entity {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    shortName: e.shortName,
    parentId: e.parentId,
    type: e.type as Entity['type'],
    region: e.region,
    industry: e.industry,
    status: e.status as Entity['status'],
  }
}

export function toBudget(b: GroupBudget) {
  return {
    id: b.id,
    entityId: b.entityId,
    year: b.year,
    budgetAmount: money(b.budgetAmount),
    expenseAmount: money(b.expenseAmount),
    note: b.note,
    updatedAt: b.updatedAt.toISOString(),
  }
}

export function toClaim(c: GroupExpenseClaim) {
  return {
    id: c.id,
    entityId: c.entityId,
    category: c.category,
    amount: money(c.amount),
    title: c.title,
    status: c.status,
    note: c.note,
    createdBy: c.createdByName,
    createdAt: c.createdAt.toISOString(),
    decidedBy: c.decidedByName ?? undefined,
    decidedAt: iso(c.decidedAt),
    level2By: c.level2ByName ?? undefined,
    level2At: iso(c.level2At),
  }
}

export function toTransfer(t: GroupFundTransfer) {
  return {
    id: t.id,
    fromEntityId: t.fromEntityId,
    toEntityId: t.toEntityId,
    amount: money(t.amount),
    note: t.note,
    status: t.status,
    createdBy: t.createdByName,
    createdAt: t.createdAt.toISOString(),
    decidedBy: t.decidedByName ?? undefined,
    decidedAt: iso(t.decidedAt),
  }
}

export function toSettlement(s: GroupSettlement) {
  return {
    id: s.id,
    settleNo: s.settleNo,
    fromEntityId: s.fromEntityId,
    toEntityId: s.toEntityId,
    amount: money(s.amount),
    category: s.category,
    title: s.title,
    status: s.status,
    createdBy: s.createdByName,
    createdAt: s.createdAt.toISOString(),
    decidedBy: s.decidedByName ?? undefined,
    decidedAt: iso(s.decidedAt),
  }
}

export function toAlloc(a: GroupExpenseAlloc & { lines: GroupExpenseAllocLine[] }) {
  return {
    id: a.id,
    totalAmount: money(a.totalAmount),
    note: a.note,
    rows: [...a.lines]
      .sort((x, y) => x.sort - y.sort)
      .map((l) => ({
        entityId: l.entityId,
        entityName: l.entityName,
        weight: Number(l.weight),
        amount: money(l.amount),
      })),
    createdAt: a.createdAt.toISOString(),
  }
}

/** 集团财务数据访问：读取正式表并输出与原接口一致的结构 */
@Injectable()
export class GroupStore {
  constructor(private readonly prisma: PrismaService) {}

  async entities(tenantId: string): Promise<Entity[]> {
    const rows = await this.prisma.groupEntity.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toEntity)
  }

  /** 主体列表；无主体时返回总部占位 */
  async entitiesOrHq(tenantId: string): Promise<Entity[]> {
    const list = await this.entities(tenantId)
    return list.length ? list : [HQ_ENTITY]
  }

  async budgets(tenantId: string) {
    const rows = await this.prisma.groupBudget.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toBudget)
  }

  /** 按创建时间正序（与原 JSON 追加顺序一致） */
  async allocs(tenantId: string) {
    const rows = await this.prisma.groupExpenseAlloc.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      include: { lines: true },
    })
    return rows.map(toAlloc)
  }

  async transfers(tenantId: string) {
    const rows = await this.prisma.groupFundTransfer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(toTransfer)
  }

  async accountEntityMap(tenantId: string): Promise<Record<string, string>> {
    const rows = await this.prisma.groupAccountEntity.findMany({ where: { tenantId } })
    return Object.fromEntries(rows.map((r) => [r.accountId, r.entityId]))
  }

  async userScopeMap(tenantId: string): Promise<Record<string, string[]>> {
    const rows = await this.prisma.groupUserScope.findMany({ where: { tenantId } })
    const map: Record<string, string[]> = {}
    for (const r of rows) (map[r.userId] ??= []).push(r.entityId)
    return map
  }
}
