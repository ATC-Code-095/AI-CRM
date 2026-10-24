import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import type { Response } from 'express'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { scopeWhere } from '../../common/data-scope'
import { PrismaService } from '../../common/prisma/prisma.service'
import { BizException, ErrorCodes } from '@ai-crm/shared'
import { tr } from '../../common/locale'

class UpdateContactDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  mobile?: string

  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  email?: string

  @IsOptional()
  @IsString()
  decisionRole?: string

  @IsOptional()
  isPrimary?: boolean

  /** 决策影响力 0-100（Setting JSON 存储，无 schema 迁移） */
  @IsOptional()
  influence?: number | string | null
}

@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 联系人列表（客户与联系人 M03）
   * 支持关键词、客户过滤与 CSV 导出；行级数据权限跟随所属客户。
   */
  @Get()
  @ApiOperation({ summary: '联系人列表' })
  @Permissions(PERMISSIONS.CONTACT_READ)
  async list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('q') q?: string,
    @Query('accountId') accountId?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const p = Math.max(Number(page) || 1, 1)
    const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100)
    const accountScope = {
      is: { tenantId: me.tenantId, deletedAt: null, ...(scopeWhere(me, 'ownerId') as object) },
    }
    const where = {
      tenantId: me.tenantId,
      deletedAt: null,
      ...(accountId ? { accountId } : {}),
      account: accountScope,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { mobile: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { title: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }
    const select = {
      id: true,
      name: true,
      title: true,
      mobile: true,
      phone: true,
      email: true,
      wechat: true,
      isPrimary: true,
      decisionRole: true,
      birthDate: true,
      createdAt: true,
      accountId: true,
      account: { select: { id: true, name: true, level: true } },
    }

    if (exp === 'csv') {
      const rows = await this.prisma.contact.findMany({
        where,
        select,
        orderBy: { createdAt: 'desc' },
        take: 5000,
      })
      const header = ['name', 'title', 'account', 'mobile', 'phone', 'email', 'wechat', 'decisionRole']
      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.name,
            r.title,
            r.account?.name,
            r.mobile,
            r.phone,
            r.email,
            r.wechat,
            r.decisionRole,
          ]
            .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
            .join(','),
        ),
      ].join('\n')
      res?.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="contacts_${Date.now()}.csv"`,
      })
      return '\ufeff' + csv
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.contact.count({ where }),
      this.prisma.contact.findMany({
        where,
        select,
        skip: (p - 1) * size,
        take: size,
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
      }),
    ])
    return { items, page: p, pageSize: size, total, hasMore: p * size < total }
  }

  /**
   * 批量操作（列表页多选后）
   * - setPrimary: 把选中联系人设为其所属客户的主联系人（同客户其它联系人自动取消主标记）
   * - delete: 批量软删除
   */
  @Post('batch')
  @Permissions(PERMISSIONS.CONTACT_WRITE)
  async batch(
    @CurrentUser() me: AuthUser,
    @Body() body: { ids?: string[]; action?: 'setPrimary' | 'delete' },
  ) {
    const ids = (body.ids ?? []).filter(Boolean).slice(0, 200)
    if (!ids.length) throw new BizException(ErrorCodes.VALIDATION_FAILED, 'ids required')
    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: ids }, tenantId: me.tenantId, deletedAt: null },
      select: { id: true, accountId: true },
    })
    if (!contacts.length) throw new BizException(ErrorCodes.NOT_FOUND, 'no contact found')

    if (body.action === 'setPrimary') {
      // 同一客户仅保留一个主联系人
      const accountIds = [...new Set(contacts.map((c) => c.accountId))]
      await this.prisma.$transaction([
        this.prisma.contact.updateMany({
          where: { tenantId: me.tenantId, accountId: { in: accountIds }, deletedAt: null },
          data: { isPrimary: false, updatedById: me.id },
        }),
        this.prisma.contact.updateMany({
          where: { tenantId: me.tenantId, id: { in: contacts.map((c) => c.id) } },
          data: { isPrimary: true, updatedById: me.id },
        }),
      ])
      return { ok: contacts.length, action: 'setPrimary' }
    }

    const res = await this.prisma.contact.updateMany({
      where: { tenantId: me.tenantId, id: { in: contacts.map((c) => c.id) }, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: me.id },
    })
    return { ok: res.count, action: 'delete' }
  }

  /** 导出 vCard 名片（.vcf） */
  @Get(':id/vcard')
  @Permissions(PERMISSIONS.CONTACT_READ)
  async vcard(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const c = await this.prisma.contact.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
      include: { account: { select: { name: true } } },
    })
    if (!c) throw new BizException(ErrorCodes.NOT_FOUND, 'contact not found')
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${c.name};;;;`,
      `FN:${c.name}`,
      ...(c.title ? [`TITLE:${c.title}`] : []),
      ...(c.account?.name ? [`ORG:${c.account.name}`] : []),
      ...(c.mobile ? [`TEL;TYPE=CELL:${c.mobile}`] : []),
      ...(c.phone ? [`TEL;TYPE=WORK:${c.phone}`] : []),
      ...(c.email ? [`EMAIL;TYPE=WORK:${c.email}`] : []),
      ...(c.wechat ? [`X-WECHAT:${c.wechat}`] : []),
      ...(c.remark ? [`NOTE:${c.remark}`] : []),
      'END:VCARD',
    ]
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contact-${encodeURIComponent(c.name)}.vcf"`,
    )
    res.send(lines.join('\r\n'))
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CONTACT_WRITE)
  async update(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    const c = await this.prisma.contact.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!c) throw new BizException(ErrorCodes.NOT_FOUND, 'contact not found')

    let influence: number | null | undefined
    if (dto.influence !== undefined) {
      influence = dto.influence === null ? null : Number(dto.influence)
      if (influence !== null && (!Number.isFinite(influence) || influence < 0 || influence > 100)) {
        throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('影响力需在 0-100 之间', 'Influence must be between 0 and 100'))
      }
      if (influence !== null) influence = Math.round(influence)
    }

    if (dto.isPrimary === true) {
      await this.prisma.contact.updateMany({
        where: { tenantId: me.tenantId, accountId: c.accountId, deletedAt: null, id: { not: id } },
        data: { isPrimary: false },
      })
    }

    const updated = await this.prisma.contact.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.mobile !== undefined ? { mobile: dto.mobile } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.decisionRole !== undefined ? { decisionRole: dto.decisionRole || null } : {}),
        ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        ...(influence !== undefined ? { influence } : {}),
        updatedById: me.id,
      },
    })
    return updated
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.CONTACT_DELETE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.contact.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!c) throw new BizException(ErrorCodes.NOT_FOUND, 'contact not found')
    await this.prisma.contact.update({
      where: { id },
      data: { deletedAt: new Date(), updatedById: me.id },
    })
    return { ok: true }
  }
}
