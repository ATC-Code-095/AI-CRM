import { Prisma } from '@prisma/client'

type AuditClient = {
  auditLog: {
    create: (args: {
      data: {
        tenantId: string
        userId: string
        action: string
        entity: string
        entityId: string
        before?: unknown
        after?: unknown
      }
    }) => Promise<unknown>
  }
}

export async function writeAudit(
  db: AuditClient | Prisma.TransactionClient,
  input: {
    tenantId: string
    userId: string
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'STATUS'
    entity: string
    entityId: string
    before?: unknown
    after?: unknown
  },
) {
  await db.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: (input.before ?? null) as never,
      after: (input.after ?? null) as never,
    },
  })
}
