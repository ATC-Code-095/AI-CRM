import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { BizException, ErrorCodes } from '@zhixiao-crm/shared'

class CreateDeptDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  parentId?: string

  @IsOptional()
  @IsString()
  code?: string

  @IsOptional()
  @IsString()
  managerId?: string
}

class UpdateDeptDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  managerId?: string

  @IsOptional()
  sortOrder?: number
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.ORG_DEPARTMENT_READ)
  async tree(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.department.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        parentId: true,
        code: true,
        path: true,
        managerId: true,
        sortOrder: true,
      },
    })
    return rows
  }

  @Post()
  @Permissions(PERMISSIONS.ORG_DEPARTMENT_WRITE)
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateDeptDto) {
    let path = `/${dto.name}`
    if (dto.parentId) {
      const parent = await this.prisma.department.findFirst({
        where: { id: dto.parentId, tenantId: me.tenantId, deletedAt: null },
      })
      if (!parent) throw new BizException(ErrorCodes.NOT_FOUND, 'parent not found')
      path = `${parent.path}/${dto.name}`
    }
    return this.prisma.department.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        parentId: dto.parentId ?? null,
        code: dto.code ?? null,
        managerId: dto.managerId ?? null,
        path,
        sortOrder: 0,
      },
    })
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ORG_DEPARTMENT_WRITE)
  async update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateDeptDto) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!dept) throw new BizException(ErrorCodes.NOT_FOUND, 'not found')
    return this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.managerId !== undefined ? { managerId: dto.managerId } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: Number(dto.sortOrder) } : {}),
      },
    })
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ORG_DEPARTMENT_WRITE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const children = await this.prisma.department.count({
      where: { parentId: id, deletedAt: null },
    })
    const users = await this.prisma.user.count({
      where: { departmentId: id, deletedAt: null },
    })
    if (children > 0 || users > 0) {
      throw new BizException(ErrorCodes.UNPROCESSABLE, 'department in use')
    }
    await this.prisma.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }
}
