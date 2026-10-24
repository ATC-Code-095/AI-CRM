import { Prisma } from '@prisma/client'
import { AuthUser } from './decorators'

/**
 * 行级数据权限（docs/03 §6）
 * SELF: owner=me | createdBy=me
 * TEAM/DEPARTMENT: + 同部门
 * ALL: 不过滤
 * 共享: entity_shares.userId = me 一律可见
 */
export function scopeWhere(me: AuthUser, ownerField = 'ownerId') {
  if (me.dataScope === 'ALL') {
    return {}
  }

  const or: Record<string, unknown>[] = [
    { [ownerField]: me.id },
    { createdById: me.id },
  ]

  if (me.dataScope === 'TEAM' || me.dataScope === 'DEPARTMENT') {
    if (me.departmentId) {
      or.push({ departmentId: me.departmentId })
    }
  }

  return { OR: or }
}

/** 无 DB 的基础可见性（不含共享） */
export function canReadRow(
  me: AuthUser,
  row: { ownerId?: string; createdById?: string; departmentId?: string | null },
): boolean {
  if (me.dataScope === 'ALL') return true
  if (row.ownerId === me.id || row.createdById === me.id) return true
  if (me.dataScope === 'TEAM' || me.dataScope === 'DEPARTMENT') {
    if (row.departmentId && me.departmentId && row.departmentId === me.departmentId) return true
  }
  return false
}

/** 含 entity_shares 的可见性 */
export async function canReadRowWithShare(
  prisma: {
    entityShare: {
      findFirst: (args: {
        where: { entityType: string; entityId: string; userId: string }
        select?: { id: boolean }
      }) => Promise<{ id: string } | null>
    }
  },
  me: AuthUser,
  row: {
    id: string
    ownerId?: string
    createdById?: string
    departmentId?: string | null
  },
  entityType: string,
): Promise<boolean> {
  if (canReadRow(me, row)) return true
  const share = await prisma.entityShare.findFirst({
    where: { entityType, entityId: row.id, userId: me.id },
    select: { id: true },
  })
  return !!share
}

export type { Prisma }