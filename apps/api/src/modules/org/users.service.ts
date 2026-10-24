import {
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { ErrorCodes, BizException, PageResult, SUPPORTED_LOCALES } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { settingText, tenantSetting } from '../../common/tenant-setting'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 在职用户的 id 与姓名：用于负责人显示、分配与筛选，任何登录用户都可读取（不含邮箱、电话等） */
  async options(me: AuthUser) {
    const items = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return { items }
  }

  async list(me: AuthUser, page: number, pageSize: number, q?: string): Promise<PageResult<unknown>> {
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }
    const safeSize = Math.min(Math.max(pageSize, 1), 100)
    const safePage = Math.max(page, 1)
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (safePage - 1) * safeSize,
        take: safeSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          status: true,
          dataScope: true,
          locale: true,
          departmentId: true,
          managerId: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
    ])
    return {
      items,
      page: safePage,
      pageSize: safeSize,
      total,
      hasMore: safePage * safeSize < total,
    }
  }

  async detail(me: AuthUser, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        status: true,
        dataScope: true,
        locale: true,
        timezone: true,
        departmentId: true,
        managerId: true,
        title: true,
        lastLoginAt: true,
        createdAt: true,
        userRoles: { select: { role: { select: { code: true, name: true } } } },
      },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    return {
      ...user,
      roles: user.userRoles.map((ur) => ur.role),
      userRoles: undefined,
    }
  }

  async create(
    me: AuthUser,
    data: {
      email: string
      passwordHash: string
      name: string
      phone?: string
      departmentId?: string
      managerId?: string
      dataScope?: string
    },
  ) {
    const email = data.email.toLowerCase().trim()
    const exists = await this.prisma.user.findFirst({
      where: { tenantId: me.tenantId, email },
    })
    if (exists) throw new BadRequestException('email already exists')
    const localeSetting = settingText(await tenantSetting(this.prisma, me.tenantId, 'i18n.default_locale'))
    const defaultLocale = (SUPPORTED_LOCALES as readonly string[]).includes(localeSetting) ? localeSetting : null

    const user = await this.prisma.user.create({
      data: {
        tenantId: me.tenantId,
        email,
        passwordHash: data.passwordHash,
        name: data.name,
        phone: data.phone,
        departmentId: data.departmentId,
        managerId: data.managerId,
        dataScope: (data.dataScope as never) ?? 'SELF',
        // 业务参数 i18n.default_locale：新用户默认语言（仅支持 zh-CN / en-US）
        ...(defaultLocale ? { locale: defaultLocale } : {}),
      },
      select: { id: true, email: true, name: true, status: true, createdAt: true },
    })
    return user
  }

  /** 管理员重置他人密码（忘记密码时使用）；只限本租户，用户须存在且未删除 */
  async resetPassword(me: AuthUser, id: string, passwordHash: string) {
    await this.detail(me, id)
    await this.prisma.user.update({ where: { id }, data: { passwordHash } })
    return { ok: true }
  }

  async update(me: AuthUser, id: string, data: Record<string, unknown>) {
    await this.detail(me, id)
    const patch: Record<string, unknown> = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.phone !== undefined) patch.phone = data.phone
    if (data.status !== undefined) patch.status = data.status
    if (data.departmentId !== undefined) patch.departmentId = data.departmentId
    if (data.managerId !== undefined) patch.managerId = data.managerId
    if (data.dataScope !== undefined) patch.dataScope = data.dataScope
    if (data.locale !== undefined) patch.locale = data.locale
    return this.prisma.user.update({
      where: { id },
      data: patch as never,
      select: { id: true, email: true, name: true, status: true },
    })
  }

  async assignRoles(me: AuthUser, id: string, roleCodes: string[]) {
    await this.detail(me, id)
    const roles = await this.prisma.role.findMany({
      where: { tenantId: me.tenantId, code: { in: roleCodes }, deletedAt: null },
    })
    if (roles.length !== roleCodes.length) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'unknown role code')
    }
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: id, roleId: r.id })),
      }),
    ])
    return { ok: true }
  }
}
