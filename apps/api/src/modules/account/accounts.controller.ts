import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { AccountsService } from './accounts.service'

class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  shortName?: string

  @IsOptional()
  @IsString()
  industry?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  region?: string

  @IsOptional()
  @IsString()
  level?: string

  @IsOptional()
  @IsString()
  parentAccountId?: string

  @IsOptional()
  @IsString()
  remark?: string
}

class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  industry?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  website?: string

  @IsOptional()
  @IsString()
  address?: string

  @IsOptional()
  @IsString()
  level?: string

  @IsOptional()
  @IsString()
  stage?: string

  @IsOptional()
  @IsString()
  parentAccountId?: string

  @IsOptional()
  @IsString()
  remark?: string

  @IsOptional()
  customValues?: Record<string, unknown>
}

class CreateContactDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  mobile?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  decisionRole?: string

  @IsOptional()
  isPrimary?: boolean
}

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({ summary: '客户列表' })
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  async list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('q') q?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: { set: (h: Record<string, string>) => void },
  ) {
    if (exp === 'csv') {
      const rows = await this.accounts.list(me, 1, 5000, q)
      const items = rows.items as Array<Record<string, unknown>>
      const header = ['name', 'industry', 'level', 'stage', 'phone', 'website']
      const csv = [
        header.join(','),
        ...items.map((r) =>
          header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','),
        ),
      ].join('\n')
      res?.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="accounts_${Date.now()}.csv"`,
      })
      return '﻿' + csv
    }
    return this.accounts.list(me, Number(page), Number(pageSize), q)
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.detail(me, id)
  }

  @Get(':id/decision-chain')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  decisionChain(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.decisionChain(me, id)
  }

  @Get(':id/overview')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  overview(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.overview(me, id)
  }

  @Get(':id/journey')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  journey(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.journey(me, id)
  }

  @Get(':id/hierarchy')
  @Permissions(PERMISSIONS.ACCOUNT_READ)
  hierarchy(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.hierarchy(me, id)
  }

  @Post()
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(me, dto as unknown as Record<string, unknown>)
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(me, id, dto as unknown as Record<string, unknown>)
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ACCOUNT_DELETE)
  remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.remove(me, id)
  }

  @Post('batch-assign')
  @ApiOperation({ summary: '批量分配负责人' })
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  batchAssign(
    @CurrentUser() me: AuthUser,
    @Body() body: { ids: string[]; ownerId: string },
  ) {
    return this.accounts.batchAssign(me, body.ids ?? [], body.ownerId)
  }

  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除（有开放商机/合同会跳过）' })
  @Permissions(PERMISSIONS.ACCOUNT_DELETE)
  batchDelete(@CurrentUser() me: AuthUser, @Body() body: { ids: string[] }) {
    return this.accounts.batchRemove(me, body.ids ?? [])
  }

  @Post(':id/restore')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  restore(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.accounts.restore(me, id)
  }

  @Post(':id/contacts')
  @Permissions(PERMISSIONS.CONTACT_WRITE)
  addContact(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: CreateContactDto) {
    return this.accounts.addContact(me, id, dto)
  }
}
