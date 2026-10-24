import type { Prisma, PrismaClient } from '@prisma/client'

/** 审批定义中的一步，如 { type: 'MANAGER', levels: 2 } 表示申请人的上级的上级 */
export interface ApprovalStepRule {
  type: string
  levels?: number
}

export interface ApproverUser {
  id: string
  managerId: string | null
  status: string
  deletedAt: Date | null
}

/** 解析审批人所需的最小数据访问（便于单测注入） */
export interface ApproverLookup {
  findUser(id: string): Promise<ApproverUser | null>
  /** 租户内在职的超级管理员 id，按固定顺序 */
  superAdmins(): Promise<string[]>
}

const isActive = (u: ApproverUser | null): u is ApproverUser => !!u && u.status === 'ACTIVE' && !u.deletedAt

/** 沿上级链向上走 levels 级；中途遇到停用 / 删除的上级时继续向上，不计入级数 */
async function managerAt(lookup: ApproverLookup, applicantId: string, levels: number): Promise<string | null> {
  let cur = await lookup.findUser(applicantId)
  let found = 0
  const seen = new Set<string>([applicantId])
  while (cur?.managerId && !seen.has(cur.managerId)) {
    seen.add(cur.managerId)
    const mgr = await lookup.findUser(cur.managerId)
    if (isActive(mgr)) {
      found++
      if (found === levels) return mgr.id
    }
    cur = mgr
  }
  return null
}

/**
 * 按审批定义解析各级审批人：
 * - MANAGER 第 n 级 = 申请人沿上级链向上第 n 位在职主管；
 * - 找不到（上级链不够长、未知步骤类型）时交给尚未安排的在职超级管理员；
 * - 申请人不能审批自己的单，同一人不重复审批（重复的级别合并）。
 * 返回空数组表示找不到任何可用审批人，由调用方拒绝提交。
 */
export async function resolveApproverChain(
  lookup: ApproverLookup,
  applicantId: string,
  rules: ApprovalStepRule[],
): Promise<string[]> {
  const chain: string[] = []
  const used = new Set<string>([applicantId])
  let admins: string[] | null = null
  for (const rule of rules.length ? rules : [{ type: 'MANAGER', levels: 1 }]) {
    let approver: string | null = null
    if (rule.type === 'MANAGER') {
      approver = await managerAt(lookup, applicantId, Math.max(1, rule.levels ?? 1))
    }
    if (!approver || used.has(approver)) {
      if (approver && used.has(approver)) continue // 同一人已在链中：合并该级
      admins ??= await lookup.superAdmins()
      approver = admins.find((id) => !used.has(id)) ?? null
    }
    if (!approver) continue
    used.add(approver)
    chain.push(approver)
  }
  return chain
}

/** 基于数据库的 ApproverLookup：用户按租户过滤；超级管理员按创建时间排序 */
export function prismaApproverLookup(db: PrismaClient | Prisma.TransactionClient, tenantId: string): ApproverLookup {
  return {
    findUser: (uid) =>
      db.user.findFirst({
        where: { id: uid, tenantId },
        select: { id: true, managerId: true, status: true, deletedAt: true },
      }),
    superAdmins: async () =>
      (
        await db.user.findMany({
          where: {
            tenantId,
            status: 'ACTIVE',
            deletedAt: null,
            userRoles: { some: { role: { code: 'SUPER_ADMIN', deletedAt: null } } },
          },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      ).map((u) => u.id),
  }
}
