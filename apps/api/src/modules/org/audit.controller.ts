import { Controller, Get, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_READ)
  list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('entity') entity?: string,
    @Query('q') q?: string,
    @Query('export') exportFmt?: string,
    // passthrough：导出 CSV 时手动设置响应头，其余情况仍由 Nest 自动返回 JSON
    @Res({ passthrough: true }) res?: Response,
  ) {
    const p = Math.max(Number(page), 1)
    const size = Math.min(Math.max(Number(pageSize), 1), 100)
    const where = {
      tenantId: me.tenantId,
      ...(entity ? { entity } : {}),
      ...(q ? { entityId: q } : {}),
    }

    if (exportFmt === 'csv') {
      return this.prisma.auditLog
        .findMany({
          where,
          orderBy: { at: 'desc' },
          take: 5000,
        })
        .then((rows) => {
          const header = [tr('时间', 'Time'), tr('用户', 'User'), tr('动作', 'Action'), tr('实体', 'Entity'), tr('实体ID', 'Entity ID'), tr('说明', 'Details')]
          const body = rows.map((r) => [
            r.at.toISOString(),
            r.userId,
            r.action,
            r.entity,
            r.entityId,
            JSON.stringify(r.after ?? r.before ?? {}).slice(0, 120),
          ])
          const csv =
            '﻿' +
            [header, ...body]
              .map((line) => line.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
              .join('\n')
          res!.setHeader('Content-Type', 'text/csv; charset=utf-8')
          res!.setHeader(
            'Content-Disposition',
            `attachment; filename="audit-logs_${Date.now()}.csv"`,
          )
          // passthrough 模式下返回字符串即可，由 Nest 写响应
          return csv
        })
    }

    return this.prisma.auditLog
      .findMany({
        where,
        skip: (p - 1) * size,
        take: size,
        orderBy: { at: 'desc' },
      })
      .then((items) => this.prisma.auditLog.count({ where }).then((total) => ({
        items,
        page: p,
        pageSize: size,
        total,
        hasMore: p * size < total,
      })))
  }
}
