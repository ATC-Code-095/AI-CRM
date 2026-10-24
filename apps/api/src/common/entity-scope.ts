import { PrismaService } from './prisma/prisma.service'

/**
 * 集团法人主体数据权限：
 * GroupUserScope(userId → entityId) 有行表示仅可见这些主体的数据
 * GroupAccountEntity(accountId → entityId) 表示客户归属主体
 * 未配置的用户不限制；配置后仅可见白名单主体的客户及其业务单据
 */
export async function entityVisibleAccountIds(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
): Promise<string[] | null> {
  const scopes = await prisma.groupUserScope.findMany({
    where: { tenantId, userId },
    select: { entityId: true },
  })
  if (!scopes.length) return null // 不限制
  const rows = await prisma.groupAccountEntity.findMany({
    where: { tenantId, entityId: { in: scopes.map((x) => x.entityId) } },
    select: { accountId: true },
  })
  return rows.map((r) => r.accountId)
}

/** 将主体可见范围并入 where（AND 条件）；null 表示不限制 */
export function withEntityScope<T extends Record<string, unknown>>(
  where: T,
  visibleAccountIds: string[] | null,
  accountField = 'accountId',
): T {
  if (visibleAccountIds === null) return where
  return {
    ...where,
    ...(visibleAccountIds.length
      ? { [accountField]: { in: visibleAccountIds } }
      : { [accountField]: { in: [] } }),
  } as T
}

/** 客户列表：直接按客户 id 过滤 */
export function withAccountEntityScope<T extends Record<string, unknown>>(
  where: T,
  visibleAccountIds: string[] | null,
): T {
  if (visibleAccountIds === null) return where
  return {
    ...where,
    ...(visibleAccountIds.length
      ? { id: { in: visibleAccountIds } }
      : { id: { in: [] } }),
  } as T
}
