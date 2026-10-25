import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { verifyPassword } from '../../common/password'
import { ErrorCodes, BizException } from '@zhixiao-crm/shared'
import { PrismaService } from '../../common/prisma/prisma.service'

export interface JwtAccessPayload {
  sub: string
  tid: string
  type: 'access'
}

export interface JwtRefreshPayload {
  sub: string
  tid: string
  type: 'refresh'
  jti: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
      },
    })
    // 不区分用户不存在/密码错
    if (!user) throw new UnauthorizedException('invalid credentials')
    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) throw new UnauthorizedException('invalid credentials')
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('user inactive')

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'LOGIN',
        entity: 'USER',
        entityId: user.id,
      },
    })

    const permissions = this.collectPermissions(user)
    const tokens = await this.issueTokens(user.id, user.tenantId)
    return {
      ...tokens,
      user: this.profile(user, permissions),
      tenantCode: await this.tenantCode(user.tenantId),
    }
  }

  /**
   * 已由第三方（企业微信 / 钉钉 / 飞书扫码）确认身份后登录：只允许本租户在职用户。
   * action 记入审计，如 LOGIN_SSO_WECHAT_WORK。
   */
  async loginAsUser(userId: string, tenantId: string, action: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
      },
    })
    if (!user) throw new UnauthorizedException('invalid credentials')
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('user inactive')
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await this.prisma.auditLog.create({
      data: { tenantId, userId: user.id, action, entity: 'USER', entityId: user.id },
    })
    const tokens = await this.issueTokens(user.id, user.tenantId)
    return {
      ...tokens,
      user: this.profile(user, this.collectPermissions(user)),
      tenantCode: await this.tenantCode(tenantId),
    }
  }

  private async tenantCode(tenantId: string) {
    return (await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { code: true } }))?.code ?? null
  }

  async refresh(refreshToken: string) {
    let payload: JwtRefreshPayload
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-change-me',
      })
    } catch {
      throw new UnauthorizedException('invalid refresh token')
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('wrong token type')

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, deletedAt: null, status: 'ACTIVE' },
    })
    if (!user) throw new UnauthorizedException('user inactive')

    return this.issueTokens(user.id, user.tenantId)
  }

  async me(userId: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
      },
    })
    if (!user) throw new BizException(ErrorCodes.NOT_FOUND, 'user not found')
    return this.profile(user, this.collectPermissions(user))
  }

  private collectPermissions(user: {
    userRoles: { role: { rolePermissions: { permission: { code: string } }[] } }[]
  }): string[] {
    const set = new Set<string>()
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) set.add(rp.permission.code)
    }
    return [...set]
  }

  private profile(
    user: {
      id: string
      email: string
      name: string
      departmentId: string | null
      managerId: string | null
      dataScope: string
      locale: string
      timezone: string
      userRoles: { role: { code: string } }[]
    },
    permissions: string[],
  ) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      departmentId: user.departmentId,
      managerId: user.managerId,
      dataScope: user.dataScope,
      locale: user.locale,
      timezone: user.timezone,
      roles: user.userRoles.map((ur) => ur.role.code),
      permissions,
    }
  }

  private async issueTokens(userId: string, tenantId: string) {
    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m'
    const refreshTtl = process.env.JWT_REFRESH_TTL ?? '7d'
    const accessToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId, type: 'access' } satisfies JwtAccessPayload,
      {
        secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-change-me',
        expiresIn: accessTtl,
      },
    )
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId, type: 'refresh', jti: `${Date.now()}` } satisfies JwtRefreshPayload,
      {
        secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-change-me',
        expiresIn: refreshTtl,
      },
    )
    return { accessToken, refreshToken }
  }
}
