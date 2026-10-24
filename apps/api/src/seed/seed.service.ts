import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { randomBytes } from 'crypto'
import { hashPassword } from '../common/password'
import {
  PERMISSIONS,
  ROLE_PERMISSION_SEED,
  PermissionCode,
} from '@ai-crm/shared'
import { PrismaService } from '../common/prisma/prisma.service'

/** 开发环境的演示密码（测试与本地开发使用）；生产环境不使用 */
const DEV_PASSWORD = 'Demo@12345'

/**
 * 新建账号的初始密码：
 * - 设置了 SEED_PASSWORD → 使用它（不打印）
 * - NODE_ENV=production → 随机生成，只在本次初始化的日志中显示一次
 * - 其他（本地开发、测试）→ 开发演示密码
 */
function initialPassword(): { value: string; generated: boolean } {
  if (process.env.SEED_PASSWORD) return { value: process.env.SEED_PASSWORD, generated: false }
  if (process.env.NODE_ENV === 'production') return { value: randomBytes(12).toString('base64url'), generated: true }
  return { value: DEV_PASSWORD, generated: false }
}

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger('Seed')

  constructor(private readonly prisma: PrismaService) {}

  /** 仅开发环境；生产禁用 auto seed */
  async onModuleInit() {
    if (process.env.AUTO_SEED !== 'true') return
    await this.seed()
  }

  async seed() {
    const password = initialPassword()
    const passwordHash = await hashPassword(password.value)
    const createdAccounts: string[] = []
    const t1 = await this.upsertTenant('demo', '演示租户')
    const t2 = await this.upsertTenant('acme', 'Acme 租户')

    await this.seedPermissions()
    for (const tenant of [t1, t2]) {
      await this.seedRoles(tenant.id)
      await this.seedPipeline(tenant.id)
    }

    await this.seedUsers(t1, passwordHash, createdAccounts, [
      { email: 'admin@demo.com', name: '管理员', dataScope: 'ALL', roles: ['SUPER_ADMIN'] },
      { email: 'manager@demo.com', name: '销售经理', dataScope: 'TEAM', roles: ['SALES_MANAGER'], managerEmail: 'admin@demo.com' },
      { email: 'rep@demo.com', name: '销售张三', dataScope: 'SELF', roles: ['SALES_REP'], managerEmail: 'manager@demo.com' },
      { email: 'finance@demo.com', name: '财务', dataScope: 'DEPARTMENT', roles: ['FINANCE'] },
    ])

    await this.seedUsers(t2, passwordHash, createdAccounts, [
      { email: 'admin@acme.com', name: 'Acme Admin', dataScope: 'ALL', roles: ['SUPER_ADMIN'] },
      { email: 'rep@acme.com', name: 'Acme Rep', dataScope: 'SELF', roles: ['SALES_REP'] },
    ])

    await this.seedExtras(t1)

    // 演示自定义字段
    await this.prisma.fieldDefinition.upsert({
      where: { tenantId_entity_apiName: { tenantId: t1.id, entity: 'ACCOUNT', apiName: 'industryCode' } },
      update: {},
      create: {
        tenantId: t1.id,
        entity: 'ACCOUNT',
        apiName: 'industryCode',
        label: '行业编码',
        dataType: 'string',
        required: false,
        isActive: true,
      },
    })
    await this.prisma.fieldDefinition.upsert({
      where: { tenantId_entity_apiName: { tenantId: t1.id, entity: 'LEAD', apiName: 'budgetRange' } },
      update: {},
      create: {
        tenantId: t1.id,
        entity: 'LEAD',
        apiName: 'budgetRange',
        label: '预算区间',
        dataType: 'string',
        required: false,
        isActive: true,
      },
    })

    // 只有本次新建了账号才有初始密码；已存在的账号保持原密码
    if (createdAccounts.length) {
      this.logger.log(`已创建账号：${createdAccounts.join('、')}`)
      if (password.generated) {
        this.logger.warn(`初始密码（所有新账号相同，只显示这一次，登录后立即修改）：${password.value}`)
      }
    }
    return {
      ok: true,
      createdAccounts,
      password: createdAccounts.length && password.generated ? password.value : null,
    }
  }

  private async seedExtras(tenant: { id: string }) {
    // 产品
    const products = [
      { code: 'CRM-BASE', name: 'CRM 标准版', unit: '套', standardPrice: '19800' },
      { code: 'CRM-PRO', name: 'CRM 专业版', unit: '套', standardPrice: '49800' },
      { code: 'SVC-IMP', name: '实施服务', unit: '项', standardPrice: '10000' },
    ]
    for (const p of products) {
      await this.prisma.product.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
        update: {},
        create: {
          tenantId: tenant.id,
          code: p.code,
          name: p.name,
          unit: p.unit,
          standardPrice: p.standardPrice,
          isActive: true,
          taxRate: 0,
          createdById: 'system',
          updatedById: 'system',
        },
      })
    }

    // 审批定义
    await this.prisma.approvalDefinition.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: 'QUOTE_DISCOUNT' } },
      update: { isActive: true },
      create: {
        tenantId: tenant.id,
        code: 'QUOTE_DISCOUNT',
        name: '报价折扣审批',
        entityType: 'QUOTE',
        isActive: true,
        rules: {
          steps: [
            { type: 'MANAGER', levels: 1 },
            { type: 'MANAGER', levels: 2 },
          ],
          when: { all: [{ field: 'discountRateMax', op: '>', value: 0.2 }] },
        },
      },
    })

    // 本月目标（给 admin）
    const admin = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, email: 'admin@demo.com' },
    })
    if (admin) {
      const now = new Date()
      const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const metrics: Array<[string, string]> = [
        ['WON_AMOUNT', '100000'],
        ['REVENUE', '50000'],
        ['NEW_OPP', '20000'],
      ]
      for (const [metric, target] of metrics) {
        const exists = await this.prisma.goal.findFirst({
          where: {
            tenantId: tenant.id,
            userId: admin.id,
            metric,
            periodKey,
            periodType: 'MONTH',
            deletedAt: null,
          },
        })
        if (!exists) {
          await this.prisma.goal.create({
            data: {
              tenantId: tenant.id,
              userId: admin.id,
              periodType: 'MONTH',
              periodKey,
              metric,
              targetAmount: target,
              createdById: admin.id,
            },
          })
        }
      }
    }
  }

  private async upsertTenant(code: string, name: string) {
    return this.prisma.tenant.upsert({
      where: { code },
      update: {},
      create: { code, name, defaultLocale: 'zh-CN', status: 'ACTIVE' },
    })
  }

  private async seedPermissions() {
    for (const [key, code] of Object.entries(PERMISSIONS)) {
      await this.prisma.permission.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name: key,
          module: code.split(':')[0],
        },
      })
    }
  }

  private async seedRoles(tenantId: string) {
    for (const [roleCode, perms] of Object.entries(ROLE_PERMISSION_SEED) as [
      string,
      PermissionCode[],
    ][]) {
      const role = await this.prisma.role.upsert({
        where: { tenantId_code: { tenantId, code: roleCode } },
        update: {},
        create: {
          tenantId,
          code: roleCode,
          name: roleCode,
          isSystem: true,
        },
      })
      const permRows = await this.prisma.permission.findMany({
        where: { code: { in: perms } },
      })
      await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
      await this.prisma.rolePermission.createMany({
        data: permRows.map((p: { id: string }) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      })
    }
  }

  private async seedPipeline(tenantId: string) {
    const pipeline = await this.prisma.pipeline.upsert({
      where: { tenantId_code: { tenantId, code: 'STD_B2B' } },
      update: {},
      create: { tenantId, code: 'STD_B2B', name: '标准B2B管道', isDefault: true, isActive: true },
    })
    const stages = [
      { code: 'PROSPECTING', name: '初步接洽', winRate: 10, sortOrder: 1 },
      { code: 'DISCOVERY', name: '需求确认', winRate: 25, sortOrder: 2 },
      { code: 'PROPOSAL', name: '方案/报价', winRate: 50, sortOrder: 3 },
      { code: 'NEGOTIATION', name: '谈判', winRate: 75, sortOrder: 4 },
      { code: 'WON', name: '赢单', winRate: 100, sortOrder: 5, isClosing: true },
      { code: 'LOST', name: '输单', winRate: 0, sortOrder: 6, isClosing: true },
    ] as const
    for (const s of stages) {
      await this.prisma.pipelineStage.upsert({
        where: {
          tenantId_pipelineId_code: {
            tenantId,
            pipelineId: pipeline.id,
            code: s.code,
          },
        },
        update: { name: s.name, winRate: s.winRate, sortOrder: s.sortOrder },
        create: {
          tenantId,
          pipelineId: pipeline.id,
          code: s.code,
          name: s.name,
          winRate: s.winRate,
          sortOrder: s.sortOrder,
          isClosing: 'isClosing' in s && s.isClosing,
        },
      })
    }
  }

  private async seedUsers(
    tenant: { id: string },
    passwordHash: string,
    createdAccounts: string[],
    users: Array<{
      email: string
      name: string
      dataScope: string
      roles: string[]
      managerEmail?: string
    }>,
  ) {
    const created: Record<string, string> = {}
    for (const u of users) {
      const email = u.email.toLowerCase()
      const exists = await this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email } },
        select: { id: true },
      })
      if (!exists) createdAccounts.push(email)
      const user = await this.prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email } },
        update: { name: u.name },
        create: {
          tenantId: tenant.id,
          email,
          passwordHash,
          name: u.name,
          status: 'ACTIVE',
          dataScope: u.dataScope as never,
          locale: 'zh-CN',
          timezone: 'Asia/Shanghai',
        },
      })
      created[email] = user.id
    }
    for (const u of users) {
      const email = u.email.toLowerCase()
      const userId = created[email]
      if (u.managerEmail && created[u.managerEmail.toLowerCase()]) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { managerId: created[u.managerEmail.toLowerCase()] },
        })
      }
      const roles = await this.prisma.role.findMany({
        where: { tenantId: tenant.id, code: { in: u.roles } },
      })
      await this.prisma.userRole.deleteMany({ where: { userId } })
      await this.prisma.userRole.createMany({
        data: roles.map((r: { id: string }) => ({ userId, roleId: r.id })),
        skipDuplicates: true,
      })
    }
  }
}
