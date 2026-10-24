import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const PERMISSIONS_KEY = 'permissions'
export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms)

export interface AuthUser {
  id: string
  tenantId: string
  email: string
  name: string
  dataScope: string
  departmentId: string | null
  managerId: string | null
  permissions: string[]
  locale: string
  timezone: string
}

export interface RequestWithUser extends Request {
  user: AuthUser
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>()
    return req.user
  },
)
