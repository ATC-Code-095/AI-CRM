import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY, RequestWithUser } from '../decorators'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!required?.length) return true

    const req = context.switchToHttp().getRequest<RequestWithUser>()
    const owned = new Set(req.user?.permissions ?? [])
    const ok = required.every((p) => owned.has(p))
    if (!ok) throw new ForbiddenException('missing permission')
    return true
  }
}
