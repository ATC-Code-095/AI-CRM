import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { IS_PUBLIC_KEY, RequestWithUser } from '../decorators'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const req = context.switchToHttp().getRequest<RequestWithUser & { headers: Record<string, string | undefined> }>()
    const header = req.headers['authorization']
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('missing token')

    let payload: { sub: string; tid: string; type: string }
    try {
      payload = await this.jwt.verifyAsync(header.slice(7))
    } catch {
      throw new UnauthorizedException('invalid token')
    }
    if (payload.type !== 'access') throw new UnauthorizedException('wrong token type')

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tid, deletedAt: null },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
    })
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('user inactive')

    const permissions = new Set<string>()
    for (const ur of user.userRoles) {
      for (const rp of ur.role.rolePermissions) permissions.add(rp.permission.code)
    }

    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      dataScope: user.dataScope,
      departmentId: user.departmentId,
      managerId: user.managerId,
      permissions: [...permissions],
      locale: user.locale,
      timezone: user.timezone,
    }
    return true
  }
}
