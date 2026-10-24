import { Injectable } from '@nestjs/common'
import { LeadSource, LeadStatus } from '@ai-crm/shared'
import { AuthUser } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { PushService } from '../notify/push.service'
import { createLeadAssigner } from '../lead/lead-assign'

/** 解析 CSV（支持引号内逗号/换行的简单实现） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      cur.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      cur.push(field)
      field = ''
      if (cur.some((x) => x.trim() !== '')) rows.push(cur)
      cur = []
    } else {
      field += c
    }
  }
  if (field !== '' || cur.length) {
    cur.push(field)
    if (cur.some((x) => x.trim() !== '')) rows.push(cur)
  }
  return rows
}

const HEADER_ALIAS: Record<string, string> = {
  名称: 'name',
  线索名称: 'name',
  name: 'name',
  联系人: 'contactName',
  contactname: 'contactName',
  手机: 'phone',
  电话: 'phone',
  phone: 'phone',
  邮箱: 'email',
  email: 'email',
  来源: 'source',
  source: 'source',
  备注: 'remark',
  remark: 'remark',
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async importLeads(me: AuthUser, csv: string) {
    const rows = parseCsv(csv)
    if (rows.length < 2) {
      return { ok: 0, failed: 0, errors: ['csv needs header + rows'] }
    }
    const headers = rows[0].map((h) => HEADER_ALIAS[h.trim().toLowerCase()] ?? HEADER_ALIAS[h.trim()] ?? '')
    const nameIdx = headers.indexOf('name')
    if (nameIdx < 0) return { ok: 0, failed: 0, errors: ['missing name column'] }

    let ok = 0
    const errors: string[] = []
    // 非销售人员导入的线索按分配规则分给销售；每位销售只收到一条汇总通知
    const assigner = await createLeadAssigner(this.prisma, me.tenantId)
    const autoAssign = assigner.onCreate && !assigner.isSales(me.id)
    const assignedTo = new Map<string, number>()
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const data: Record<string, string> = {}
      headers.forEach((h, i) => {
        if (h) data[h] = (row[i] ?? '').trim()
      })
      if (!data.name) {
        errors.push(`row ${r + 1}: name empty`)
        continue
      }
      const sourceKey = (data.source ?? 'OTHER').toUpperCase() as keyof typeof LeadSource
      const source = LeadSource[sourceKey] ?? LeadSource.OTHER
      try {
        const rowOwner = (autoAssign ? await assigner.next() : null) ?? me.id
        await this.prisma.lead.create({
          data: {
            tenantId: me.tenantId,
            name: data.name,
            contactName: data.contactName || null,
            phone: data.phone || null,
            email: data.email || null,
            source,
            status: LeadStatus.NEW,
            score: 0,
            ownerId: rowOwner,
            remark: data.remark || null,
            createdById: me.id,
            updatedById: me.id,
          },
        })
        if (rowOwner !== me.id) assignedTo.set(rowOwner, (assignedTo.get(rowOwner) ?? 0) + 1)
        ok++
      } catch {
        errors.push(`row ${r + 1}: insert failed`)
      }
    }
    await assigner.save()
    for (const [userId, n] of assignedTo) {
      await this.push.notify(
        me.tenantId,
        userId,
        'LEAD_ASSIGNED',
        { zh: '线索已分配给您', en: 'Leads have been assigned to you' },
        { zh: `导入的 ${n} 条线索已分配给您`, en: `${n} imported leads have been assigned to you` },
      )
    }
    return { ok, failed: errors.length, errors: errors.slice(0, 20) }
  }

  /** 预览 CSV：返回表头映射与前 N 行 */
  preview(csv: string, limit = 5) {
    const rows = parseCsv(csv)
    if (!rows.length) return { headers: [], sample: [], mapped: [] }
    const rawHeaders = rows[0].map((h) => h.trim())
    const mapped = rawHeaders.map(
      (h) => HEADER_ALIAS[h.toLowerCase()] ?? HEADER_ALIAS[h] ?? '',
    )
    return {
      headers: rawHeaders,
      mapped,
      sample: rows.slice(1, 1 + limit),
      totalRows: Math.max(0, rows.length - 1),
    }
  }

  /** 导入联系人（按邮箱/手机去重） */
  async importContacts(me: AuthUser, csv: string) {
    const rows = parseCsv(csv)
    if (rows.length < 2) return { ok: 0, failed: 0, errors: ['csv needs header + rows'] }
    const headers = rows[0].map(
      (h) => HEADER_ALIAS[h.trim().toLowerCase()] ?? HEADER_ALIAS[h.trim()] ?? '',
    )
    const nameIdx = headers.indexOf('name')
    if (nameIdx < 0) return { ok: 0, failed: 0, errors: ['missing name column'] }
    let ok = 0
    const errors: string[] = []
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const data: Record<string, string> = {}
      headers.forEach((h, i) => {
        if (h) data[h] = (row[i] ?? '').trim()
      })
      if (!data.name) {
        errors.push(`row ${r + 1}: name empty`)
        continue
      }
      try {
        // 找同名客户，否则建「导入客户」
        let account = await this.prisma.account.findFirst({
          where: { tenantId: me.tenantId, deletedAt: null, name: data.remark || data.name },
          select: { id: true },
        })
        if (!account) {
          account = await this.prisma.account.create({
            data: {
              tenantId: me.tenantId,
              name: data.remark || data.name,
              level: 'C',
              stage: 'POTENTIAL',
              ownerId: me.id,
              source: '导入',
              createdById: me.id,
              updatedById: me.id,
            },
            select: { id: true },
          })
        }
        const dup = await this.prisma.contact.findFirst({
          where: {
            tenantId: me.tenantId,
            deletedAt: null,
            OR: [
              ...(data.email ? [{ email: data.email }] : []),
              ...(data.phone ? [{ mobile: data.phone }] : []),
            ],
          },
          select: { id: true },
        })
        if (dup) {
          errors.push(`row ${r + 1}: duplicate contact`)
          continue
        }
        await this.prisma.contact.create({
          data: {
            tenantId: me.tenantId,
            accountId: account.id,
            name: data.name,
            mobile: data.phone || null,
            email: data.email || null,
            isPrimary: r === 1,
            createdById: me.id,
            updatedById: me.id,
          },
        })
        ok++
      } catch {
        errors.push(`row ${r + 1}: insert failed`)
      }
    }
    return { ok, failed: errors.length, errors: errors.slice(0, 20) }
  }

  /** 导入客户（按名称去重） */
  async importAccounts(me: AuthUser, csv: string) {
    const rows = parseCsv(csv)
    if (rows.length < 2) return { ok: 0, failed: 0, errors: ['csv needs header + rows'] }
    const headers = rows[0].map(
      (h) => HEADER_ALIAS[h.trim().toLowerCase()] ?? HEADER_ALIAS[h.trim()] ?? '',
    )
    const nameIdx = headers.indexOf('name')
    if (nameIdx < 0) return { ok: 0, failed: 0, errors: ['missing name column'] }
    let ok = 0
    const errors: string[] = []
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const data: Record<string, string> = {}
      headers.forEach((h, i) => {
        if (h) data[h] = (row[i] ?? '').trim()
      })
      if (!data.name) {
        errors.push(`row ${r + 1}: name empty`)
        continue
      }
      const dup = await this.prisma.account.findFirst({
        where: { tenantId: me.tenantId, deletedAt: null, name: data.name },
        select: { id: true },
      })
      if (dup) {
        errors.push(`row ${r + 1}: duplicate account`)
        continue
      }
      try {
        await this.prisma.account.create({
          data: {
            tenantId: me.tenantId,
            name: data.name,
            shortName: data.remark || null,
            phone: data.phone || null,
            level: 'C',
            stage: 'POTENTIAL',
            ownerId: me.id,
            source: '导入',
            createdById: me.id,
            updatedById: me.id,
          },
        })
        ok++
      } catch {
        errors.push(`row ${r + 1}: insert failed`)
      }
    }
    return { ok, failed: errors.length, errors: errors.slice(0, 20) }
  }
}
