import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator'
import { hashPassword } from '../../common/password'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { UsersService } from './users.service'

class CreateUserDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string

  @IsString()
  name!: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  managerId?: string

  @IsOptional()
  @IsIn(['SELF', 'TEAM', 'DEPARTMENT', 'ALL', 'CUSTOM'])
  dataScope?: string
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: string

  @IsOptional()
  @IsString()
  departmentId?: string

  @IsOptional()
  @IsString()
  managerId?: string

  @IsOptional()
  @IsIn(['SELF', 'TEAM', 'DEPARTMENT', 'ALL', 'CUSTOM'])
  dataScope?: string

  @IsOptional()
  @IsString()
  locale?: string
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string
}

class AssignRolesDto {
  @IsString({ each: true })
  roleCodes!: string[]
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions(PERMISSIONS.ORG_USER_READ)
  list(@CurrentUser() me: AuthUser, @Query('page') page = '1', @Query('pageSize') pageSize = '20', @Query('q') q?: string) {
    return this.users.list(me, Number(page), Number(pageSize), q)
  }

  // 须在 ':id' 之前声明。不设权限点：只返回 id 与姓名，供非管理员显示负责人、分配与筛选
  @Get('options')
  options(@CurrentUser() me: AuthUser) {
    return this.users.options(me)
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ORG_USER_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.users.detail(me, id)
  }

  @Post()
  @Permissions(PERMISSIONS.ORG_USER_WRITE)
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateUserDto) {
    const passwordHash = await hashPassword(dto.password)
    return this.users.create(me, { ...dto, passwordHash })
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ORG_USER_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(me, id, dto as Record<string, unknown>)
  }

  /** 管理员为他人重置密码；用户本人改密码走 POST /auth/change-password */
  @Post(':id/reset-password')
  @Permissions(PERMISSIONS.ORG_USER_WRITE)
  async resetPassword(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(me, id, await hashPassword(dto.newPassword))
  }

  @Post(':id/roles')
  @Permissions(PERMISSIONS.ORG_ROLE_WRITE)
  assignRoles(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: AssignRolesDto) {
    return this.users.assignRoles(me, id, dto.roleCodes)
  }
}
