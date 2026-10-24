import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS, PERMISSIONS as P } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { BizException, ErrorCodes } from '@ai-crm/shared'

class CreateRoleDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  description?: string
}

class UpdatePermsDto {
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[]
}

@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.ORG_ROLE_READ)
  async list(@CurrentUser() me: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      include: {
        rolePermissions: { include: { permission: { select: { code: true } } } },
      },
      orderBy: { code: 'asc' },
    })
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionCodes: r.rolePermissions.map((x) => x.permission.code),
    }))
  }

  @Get('permissions')
  @Permissions(PERMISSIONS.ORG_ROLE_READ)
  allPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    })
  }

  @Post()
  @Permissions(PERMISSIONS.ORG_ROLE_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateRoleDto) {
    return this.prisma.role.create({
      data: {
        tenantId: me.tenantId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
      },
    })
  }

  @Patch(':id/permissions')
  @Permissions(PERMISSIONS.ORG_ROLE_WRITE)
  async setPermissions(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePermsDto,
  ) {
    const role = await this.prisma.role.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!role) throw new BizException(ErrorCodes.NOT_FOUND, 'role not found')
    const perms = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissionCodes } },
    })
    return this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ])
  }
}

void P
