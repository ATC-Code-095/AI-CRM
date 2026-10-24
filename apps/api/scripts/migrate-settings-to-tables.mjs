// 将存放在 Setting(JSON) 中的业务单据搬迁到正式表（docs/12 变更记录 2026-10-21）
// 用法：node scripts/migrate-settings-to-tables.mjs <stage> [--dry-run]
//   stage: group | contract | templates | success | reports | all
//          cleanup --confirm   删除已迁移的旧 Setting 行（须在新代码上线、各阶段核对无误后执行）
// 特性：
//   - 执行前把涉及的 Setting 原始 JSON 备份到 backups/settings-<stage>-<时间>.json
//   - 以原 JSON 里的 id 作为新表主键 upsert，可重复执行（切换上线前再跑一次补增量）
//   - 不删除旧 Setting 行；核对无误后在收口阶段统一清理
//   - 结束时核对「JSON 条数 = 表行数」
import { PrismaClient, Prisma } from '@prisma/client'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const p = new PrismaClient()
const stage = process.argv[2]
const dryRun = process.argv.includes('--dry-run')

const money = (v) => {
  const n = Number(v)
  return new Prisma.Decimal(Number.isFinite(n) ? n.toFixed(2) : '0')
}
const date = (v, fallback) => {
  const d = v ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : fallback
}
/** 旧 id 形如 `ge-1727612345678`，取其中的毫秒时间戳作为创建时间 */
const dateFromId = (id) => {
  const m = /-(\d{13})(?:-|$)/.exec(String(id ?? ''))
  return m ? new Date(Number(m[1])) : new Date()
}
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** 旧数据中人员存的是显示名（name 或 email），按租户内唯一匹配回 userId */
async function userResolver(tenantId) {
  const users = await p.user.findMany({ where: { tenantId }, select: { id: true, name: true, email: true } })
  const index = new Map()
  for (const u of users) {
    for (const k of [u.name, u.email]) {
      if (!k) continue
      index.set(k, index.has(k) && index.get(k) !== u.id ? null : u.id)
    }
  }
  return (label) => (label ? index.get(label) ?? null : null)
}

async function settingsFor(keys) {
  return p.setting.findMany({ where: { key: { in: keys }, scope: 'TENANT' } })
}

function backup(name, rows) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `settings-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(file, JSON.stringify(rows, null, 2))
  console.log(`backup → ${file} (${rows.length} rows)`)
}

// ---------------- 阶段 1：集团财务 ----------------
const GROUP_KEYS = [
  'group.entities',
  'group.budgets',
  'group.expense.claims',
  'group.fund.transfers',
  'group.settlements',
  'group.expense.alloc',
  'group.account.entity',
  'group.user.scopes',
]

async function migrateGroup() {
  const rows = await settingsFor(GROUP_KEYS)
  if (!dryRun) backup('group', rows)
  const tenants = [...new Set(rows.map((r) => r.tenantId))]
  const report = []
  for (const tenantId of tenants) {
    const val = (key) => rows.find((r) => r.tenantId === tenantId && r.key === key)?.value
    const who = await userResolver(tenantId)
    const counts = {}
    const ops = []

    const entities = arr(val('group.entities')).filter((e) => e?.id)
    counts.entities = entities.length
    for (const e of entities) {
      const data = {
        tenantId,
        code: String(e.code ?? ''),
        name: String(e.name ?? '未命名主体'),
        shortName: String(e.shortName ?? ''),
        parentId: e.parentId || null,
        type: ['GROUP', 'SUBSIDIARY', 'BRANCH'].includes(e.type) ? e.type : 'SUBSIDIARY',
        region: String(e.region ?? ''),
        industry: String(e.industry ?? ''),
        status: e.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      }
      ops.push(
        p.groupEntity.upsert({
          where: { id: e.id },
          update: data,
          create: { id: e.id, ...data, createdAt: dateFromId(e.id) },
        }),
      )
    }

    // 预算按 (主体, 年度) 唯一；JSON 中若有重复，以后出现的为准
    const budgets = new Map()
    for (const b of arr(val('group.budgets'))) {
      if (!b?.entityId || !b?.year) continue
      budgets.set(`${b.entityId}|${b.year}`, b)
    }
    counts.budgets = budgets.size
    for (const b of budgets.values()) {
      const data = {
        budgetAmount: money(b.budgetAmount),
        expenseAmount: money(b.expenseAmount),
        note: String(b.note ?? ''),
      }
      ops.push(
        p.groupBudget.upsert({
          where: { tenantId_entityId_year: { tenantId, entityId: b.entityId, year: String(b.year) } },
          update: data,
          create: {
            id: b.id || undefined,
            tenantId,
            entityId: b.entityId,
            year: String(b.year),
            ...data,
            createdAt: dateFromId(b.id),
          },
        }),
      )
    }

    const claims = arr(val('group.expense.claims')).filter((c) => c?.id)
    counts.claims = claims.length
    for (const c of claims) {
      const status = ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(c.status) ? c.status : 'SUBMITTED'
      const decidedAt = date(c.decidedAt, null)
      // 旧逻辑二级审批会覆盖一级审批人，note 为「二级审批」即表示最后一次是二级
      const isLevel2 = c.note === '二级审批'
      const data = {
        tenantId,
        entityId: String(c.entityId ?? ''),
        category: String(c.category ?? '其他'),
        title: String(c.title ?? ''),
        amount: money(c.amount),
        status,
        note: isLevel2 ? '' : String(c.note ?? ''),
        createdById: who(c.createdBy),
        createdByName: String(c.createdBy ?? ''),
        createdAt: date(c.createdAt, dateFromId(c.id)),
        decidedById: isLevel2 ? null : who(c.decidedBy),
        decidedByName: isLevel2 ? null : c.decidedBy ?? null,
        decidedAt: isLevel2 ? null : decidedAt,
        level2ById: isLevel2 ? who(c.decidedBy) : null,
        level2ByName: isLevel2 ? c.decidedBy ?? null : null,
        level2At: isLevel2 ? decidedAt : null,
        // 旧逻辑每次同意都已计入预算（预算 expenseAmount 原样迁移），标记已入账防止再次累加
        budgetPostedAt: status === 'APPROVED' ? decidedAt ?? new Date() : null,
      }
      ops.push(p.groupExpenseClaim.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } }))
    }

    const transfers = arr(val('group.fund.transfers')).filter((t) => t?.id)
    counts.transfers = transfers.length
    for (const t of transfers) {
      const data = {
        tenantId,
        fromEntityId: String(t.fromEntityId ?? ''),
        toEntityId: String(t.toEntityId ?? ''),
        amount: money(t.amount),
        note: String(t.note ?? ''),
        // 旧逻辑新建即 POSTED，无状态的历史数据也视为已入账
        status: ['SUBMITTED', 'POSTED', 'REJECTED'].includes(t.status) ? t.status : 'POSTED',
        createdById: who(t.createdBy),
        createdByName: String(t.createdBy ?? ''),
        createdAt: date(t.createdAt, dateFromId(t.id)),
        decidedById: who(t.decidedBy),
        decidedByName: t.decidedBy ?? null,
        decidedAt: date(t.decidedAt, null),
      }
      ops.push(p.groupFundTransfer.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } }))
    }

    // 旧单号可能重复，重复者追加后缀以满足唯一约束
    const seenNo = new Set()
    const settlements = arr(val('group.settlements')).filter((s) => s?.id)
    counts.settlements = settlements.length
    for (const s of settlements) {
      let settleNo = String(s.settleNo || `ST-${s.id}`)
      for (let i = 2; seenNo.has(settleNo); i++) settleNo = `${s.settleNo}-${i}`
      seenNo.add(settleNo)
      const data = {
        tenantId,
        settleNo,
        fromEntityId: String(s.fromEntityId ?? ''),
        toEntityId: String(s.toEntityId ?? ''),
        amount: money(s.amount),
        category: String(s.category ?? '服务费'),
        title: String(s.title ?? ''),
        status: ['DRAFT', 'CONFIRMED', 'SETTLED'].includes(s.status) ? s.status : 'DRAFT',
        createdById: who(s.createdBy),
        createdByName: String(s.createdBy ?? ''),
        createdAt: date(s.createdAt, dateFromId(s.id)),
        decidedById: who(s.decidedBy),
        decidedByName: s.decidedBy ?? null,
        decidedAt: date(s.decidedAt, null),
      }
      ops.push(p.groupSettlement.upsert({ where: { id: s.id }, update: data, create: { id: s.id, ...data } }))
    }

    const allocs = arr(val('group.expense.alloc')).filter((a) => a?.id)
    counts.allocs = allocs.length
    for (const a of allocs) {
      const lines = arr(a.rows).map((r, i) => ({
        entityId: String(r.entityId ?? ''),
        entityName: String(r.entityName ?? ''),
        weight: new Prisma.Decimal(Number(r.weight) || 0),
        amount: money(r.amount),
        sort: i,
      }))
      const data = { tenantId, totalAmount: money(a.totalAmount), note: String(a.note ?? '') }
      ops.push(p.groupExpenseAllocLine.deleteMany({ where: { allocId: a.id } }))
      ops.push(
        p.groupExpenseAlloc.upsert({
          where: { id: a.id },
          update: { ...data, lines: { create: lines } },
          create: { id: a.id, ...data, createdAt: date(a.createdAt, dateFromId(a.id)), lines: { create: lines } },
        }),
      )
    }

    const accMap = Object.entries(obj(val('group.account.entity'))).filter(([a, e]) => a && e)
    counts.accountEntities = accMap.length
    for (const [accountId, entityId] of accMap) {
      ops.push(
        p.groupAccountEntity.upsert({
          where: { tenantId_accountId: { tenantId, accountId } },
          update: { entityId: String(entityId) },
          create: { tenantId, accountId, entityId: String(entityId) },
        }),
      )
    }

    const scopeRows = Object.entries(obj(val('group.user.scopes'))).flatMap(([userId, ids]) =>
      [...new Set(arr(ids))].filter(Boolean).map((entityId) => ({ userId, entityId: String(entityId) })),
    )
    counts.userScopes = scopeRows.length
    for (const r of scopeRows) {
      ops.push(
        p.groupUserScope.upsert({
          where: { tenantId_userId_entityId: { tenantId, ...r } },
          update: {},
          create: { tenantId, ...r },
        }),
      )
    }

    if (!dryRun && ops.length) await p.$transaction(ops)
    report.push({ tenantId, counts })
  }

  // 核对
  let ok = true
  for (const { tenantId, counts } of report) {
    const actual = dryRun
      ? null
      : {
          entities: await p.groupEntity.count({ where: { tenantId } }),
          budgets: await p.groupBudget.count({ where: { tenantId } }),
          claims: await p.groupExpenseClaim.count({ where: { tenantId } }),
          transfers: await p.groupFundTransfer.count({ where: { tenantId } }),
          settlements: await p.groupSettlement.count({ where: { tenantId } }),
          allocs: await p.groupExpenseAlloc.count({ where: { tenantId } }),
          accountEntities: await p.groupAccountEntity.count({ where: { tenantId } }),
          userScopes: await p.groupUserScope.count({ where: { tenantId } }),
        }
    for (const [k, n] of Object.entries(counts)) {
      // 表中可能已有新代码写入的行，因此只要求 表行数 ≥ JSON 条数
      const bad = actual && actual[k] < n
      if (bad) ok = false
      console.log(`${tenantId} ${k.padEnd(16)} json=${n}${actual ? ` table=${actual[k]}` : ''}${bad ? '  ✗' : ''}`)
    }
  }
  if (!report.length) console.log('no group.* settings found')
  if (!ok) throw new Error('核对失败：表行数少于 JSON 条数')
}

// ---------------- 阶段 2：合同与报价单据 ----------------
const CONTRACT_KEYS = ['finance.invoices', 'contract.changeOrders', 'esign.seals', 'projects.list', 'quote.share.tokens']

async function migrateContract() {
  const rows = await p.setting.findMany({
    where: {
      scope: 'TENANT',
      OR: [{ key: { in: CONTRACT_KEYS } }, { key: { startsWith: 'quote.history.' } }],
    },
  })
  if (!dryRun) backup('contract', rows)
  const tenants = [...new Set(rows.map((r) => r.tenantId))]
  let ok = true
  for (const tenantId of tenants) {
    const mine = rows.filter((r) => r.tenantId === tenantId)
    const val = (key) => mine.find((r) => r.key === key)?.value
    const who = await userResolver(tenantId)
    const ops = []
    const expect = {}

    const invoices = arr(val('finance.invoices')).filter((x) => x?.id && x?.contractId)
    expect.invoice = invoices.length
    for (const x of invoices) {
      const data = {
        tenantId,
        contractId: String(x.contractId),
        contractNo: String(x.contractNo ?? ''),
        invoiceNo: String(x.invoiceNo ?? ''),
        amount: money(x.amount),
        type: String(x.type ?? 'VAT_SPECIAL'),
        status: ['ISSUED', 'VOID', 'REVERSED'].includes(x.status) ? x.status : 'ISSUED',
        remark: String(x.remark ?? ''),
        createdById: who(x.createdBy),
        createdByName: String(x.createdBy ?? ''),
        createdAt: date(x.createdAt, dateFromId(x.id)),
        updatedById: who(x.updatedBy),
        updatedByName: x.updatedBy ?? null,
      }
      ops.push(p.invoice.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const cos = arr(val('contract.changeOrders')).filter((x) => x?.id && x?.contractId)
    expect.contractChangeOrder = cos.length
    for (const x of cos) {
      const data = {
        tenantId,
        contractId: String(x.contractId),
        contractNo: String(x.contractNo ?? ''),
        title: String(x.title ?? ''),
        reason: String(x.reason ?? ''),
        amountDelta: money(x.amountDelta),
        status: ['PENDING', 'APPROVED', 'REJECTED'].includes(x.status) ? x.status : 'PENDING',
        createdById: who(x.createdBy),
        createdByName: String(x.createdBy ?? ''),
        createdAt: date(x.createdAt, dateFromId(x.id)),
        decidedById: who(x.decidedBy),
        decidedByName: x.decidedBy ?? null,
        decidedAt: date(x.decidedAt, null),
      }
      ops.push(p.contractChangeOrder.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const seals = arr(val('esign.seals')).filter((x) => x?.id)
    expect.eSignSeal = seals.length
    for (const x of seals) {
      const data = {
        tenantId,
        name: String(x.name ?? ''),
        type: String(x.type ?? 'COMPANY'),
        party: x.party === 'A' ? 'A' : 'B',
        status: String(x.status ?? 'ACTIVE'),
        createdById: who(x.createdBy),
        createdByName: String(x.createdBy ?? ''),
        createdAt: date(x.createdAt, dateFromId(x.id)),
      }
      ops.push(p.eSignSeal.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const projects = arr(val('projects.list')).filter((x) => x?.id)
    expect.project = projects.length
    for (const x of projects) {
      const data = {
        tenantId,
        code: String(x.code ?? ''),
        name: String(x.name ?? '未命名项目'),
        accountId: x.accountId || null,
        accountName: String(x.accountName ?? ''),
        status: ['PLANNING', 'BIDDING', 'WON', 'DELIVERING', 'CLOSED'].includes(x.status) ? x.status : 'PLANNING',
        ownerId: who(x.owner),
        ownerName: String(x.owner ?? ''),
        budget: money(x.budget),
        startDate: String(x.startDate ?? ''),
        endDate: String(x.endDate ?? ''),
        description: String(x.description ?? ''),
        milestones: arr(x.milestones).map((m) => ({ text: String(m?.text ?? ''), done: !!m?.done, ...(m?.due ? { due: String(m.due) } : {}) })),
      }
      ops.push(p.project.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data, createdAt: dateFromId(x.id) } }))
      // 原 id 数组 → 报价/合同上的 projectId（不覆盖已有关联）
      const quoteIds = arr(x.quoteIds).map(String)
      const contractIds = arr(x.contractIds).map(String)
      if (quoteIds.length) ops.push(p.quote.updateMany({ where: { tenantId, id: { in: quoteIds }, projectId: null }, data: { projectId: x.id } }))
      if (contractIds.length) ops.push(p.contract.updateMany({ where: { tenantId, id: { in: contractIds }, projectId: null }, data: { projectId: x.id } }))
    }

    const tokens = Object.entries(obj(val('quote.share.tokens'))).filter(([t, m]) => t && m?.quoteId)
    expect.quoteShareToken = tokens.length
    for (const [token, m] of tokens) {
      const data = {
        tenantId,
        quoteId: String(m.quoteId),
        createdById: m.createdBy || null,
        createdAt: date(m.createdAt, new Date()),
        expiresAt: date(m.expiresAt, new Date(Date.now() + 30 * 86400000)),
      }
      ops.push(p.quoteShareToken.upsert({ where: { token }, update: data, create: { token, ...data } }))
    }

    let snapCount = 0
    for (const r of mine.filter((r) => r.key.startsWith('quote.history.'))) {
      const quoteId = r.key.slice('quote.history.'.length)
      const byVersion = new Map()
      for (const v of arr(r.value)) if (Number.isInteger(Number(v?.version))) byVersion.set(Number(v.version), v)
      snapCount += byVersion.size
      for (const [version, v] of byVersion) {
        const data = {
          tenantId,
          total: money(v.total),
          lines: arr(v.lines),
          changedById: who(v.changedBy),
          changedByName: String(v.changedBy ?? ''),
          changedAt: date(v.changedAt, new Date()),
        }
        ops.push(
          p.quoteSnapshot.upsert({
            where: { quoteId_version: { quoteId, version } },
            update: data,
            create: { quoteId, version, ...data },
          }),
        )
      }
    }
    expect.quoteSnapshot = snapCount

    if (!dryRun && ops.length) await p.$transaction(ops)
    for (const [model, n] of Object.entries(expect)) {
      const actual = dryRun ? null : await p[model].count({ where: { tenantId } })
      const bad = actual !== null && actual < n
      if (bad) ok = false
      console.log(`${tenantId} ${model.padEnd(20)} json=${n}${actual !== null ? ` table=${actual}` : ''}${bad ? '  ✗' : ''}`)
    }
  }
  if (!tenants.length) console.log('no contract/quote settings found')
  if (!ok) throw new Error('核对失败：表行数少于 JSON 条数')
}

// ---------------- 阶段 3：模板与知识内容 ----------------
const TEMPLATE_KEYS = ['contract.templates', 'quote.templates', 'email.templates', 'activity.templates', 'knowledge.articles']

async function migrateTemplates() {
  const rows = await settingsFor(TEMPLATE_KEYS)
  if (!dryRun) backup('templates', rows)
  const tenants = [...new Set(rows.map((r) => r.tenantId))]
  let ok = true
  for (const tenantId of tenants) {
    const val = (key) => rows.find((r) => r.tenantId === tenantId && r.key === key)?.value
    const who = await userResolver(tenantId)
    const ops = []
    const expect = { docTemplate: 0 }

    for (const [key, kind] of [['contract.templates', 'CONTRACT'], ['quote.templates', 'QUOTE']]) {
      const list = arr(val(key)).filter((t) => t?.id)
      expect.docTemplate += list.length
      for (const t of list) {
        const data = {
          tenantId,
          kind,
          name: String(t.name ?? ''),
          category: String(t.category ?? ''),
          description: String(t.description ?? ''),
          terms: String(t.terms ?? ''),
          defaultDuration: String(t.defaultDuration ?? ''),
          defaultPayment: String(t.defaultPayment ?? ''),
          lines: arr(t.lines),
          content: typeof t.content === 'string' ? t.content : '',
          file: t.file && typeof t.file === 'object' ? t.file : undefined,
          autoParsed: !!t.autoParsed,
          approveStatus: ['PENDING', 'APPROVED', 'REJECTED'].includes(t.approveStatus) ? t.approveStatus : null,
          approveNote: String(t.approveNote ?? ''),
          approvedByName: t.approvedBy ?? null,
          approvedAt: date(t.approvedAt, null),
          published: !!t.published,
          publishedAt: date(t.publishedAt, null),
          publishedByName: t.publishedBy ?? null,
          createdById: who(t.createdBy),
          createdByName: String(t.createdBy ?? ''),
          createdAt: date(t.createdAt, dateFromId(t.id)),
        }
        // 历史版本 / 审批记录：先清空再按原顺序（新→旧）重建，保证可重复执行
        const now = Date.now()
        const versions = arr(t.history)
          .filter((h) => typeof h?.content === 'string')
          .map((h, i) => ({ content: h.content, createdAt: date(h.at, new Date(now - (i + 1) * 1000)) }))
        const logs = arr(t.approveLog).map((l) => ({
          action: String(l.action ?? ''),
          status: String(l.status ?? ''),
          note: String(l.note ?? ''),
          byId: who(l.by),
          byName: String(l.by ?? ''),
          at: date(l.at, new Date()),
        }))
        ops.push(p.docTemplateVersion.deleteMany({ where: { templateId: t.id } }))
        ops.push(p.docTemplateApprovalLog.deleteMany({ where: { templateId: t.id } }))
        ops.push(
          p.docTemplate.upsert({
            where: { id: t.id },
            update: { ...data, versions: { create: versions }, logs: { create: logs } },
            create: { id: t.id, ...data, versions: { create: versions }, logs: { create: logs } },
          }),
        )
      }
    }

    const emails = arr(val('email.templates')).filter((t) => t?.id)
    expect.emailTemplate = emails.length
    for (const t of emails) {
      const data = {
        tenantId,
        name: String(t.name ?? ''),
        subject: String(t.subject ?? ''),
        body: String(t.body ?? ''),
        category: String(t.category ?? 'general'),
        createdById: who(t.createdBy),
        createdByName: String(t.createdBy ?? ''),
        createdAt: date(t.createdAt, dateFromId(t.id)),
      }
      ops.push(p.emailTemplate.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } }))
    }

    const acts = arr(val('activity.templates')).filter((t) => t?.id && !t.isBuiltin)
    expect.activityTemplate = acts.length
    for (const t of acts) {
      const data = {
        tenantId,
        name: String(t.name ?? ''),
        content: String(t.content ?? ''),
        category: String(t.category ?? 'custom'),
        createdAt: dateFromId(t.id),
      }
      ops.push(p.activityTemplate.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } }))
    }

    const articles = arr(val('knowledge.articles')).filter((a) => a?.id)
    expect.knowledgeArticle = articles.length
    for (const a of articles) {
      const data = {
        tenantId,
        title: String(a.title ?? ''),
        category: String(a.category ?? 'general'),
        content: String(a.content ?? ''),
        tags: Array.isArray(a.tags) ? a.tags.join(',') : String(a.tags ?? ''),
        authorId: a.authorId || null,
        authorName: String(a.authorName ?? ''),
        createdAt: date(a.createdAt, dateFromId(a.id)),
      }
      ops.push(p.knowledgeArticle.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } }))
    }

    if (!dryRun && ops.length) await p.$transaction(ops, { timeout: 60000 })
    for (const [model, n] of Object.entries(expect)) {
      const actual = dryRun ? null : await p[model].count({ where: { tenantId } })
      const bad = actual !== null && actual < n
      if (bad) ok = false
      console.log(`${tenantId} ${model.padEnd(20)} json=${n}${actual !== null ? ` table=${actual}` : ''}${bad ? '  ✗' : ''}`)
    }
  }
  if (!tenants.length) console.log('no template settings found')
  if (!ok) throw new Error('核对失败：表行数少于 JSON 条数')
}

// ---------------- 阶段 4：客户成功与营销 ----------------
const SUCCESS_KEYS = ['email.sends', 'meeting.minutes', 'nps.scores', 'channel.partners', 'customer.segments']

async function migrateSuccess() {
  const rows = await p.setting.findMany({
    where: { scope: 'TENANT', OR: [{ key: { in: SUCCESS_KEYS } }, { key: { startsWith: 'successplan.' } }] },
  })
  if (!dryRun) backup('success', rows)
  const tenants = [...new Set(rows.map((r) => r.tenantId))]
  let ok = true
  for (const tenantId of tenants) {
    const mine = rows.filter((r) => r.tenantId === tenantId)
    const val = (key) => mine.find((r) => r.key === key)?.value
    const who = await userResolver(tenantId)
    const ops = []
    const expect = {}
    const str = (v, d = '') => (v === undefined || v === null ? d : String(v))

    const sends = arr(val('email.sends')).filter((x) => x?.id)
    expect.emailSend = sends.length
    for (const x of sends) {
      const data = {
        tenantId,
        to: str(x.to),
        toName: str(x.toName),
        subject: str(x.subject),
        body: str(x.body),
        html: str(x.html),
        templateId: str(x.templateId),
        entityType: str(x.entityType),
        entityId: str(x.entityId),
        sentById: who(x.sentBy),
        sentByName: str(x.sentBy),
        sentAt: date(x.sentAt, dateFromId(x.id)),
        status: ['SENT', 'OPENED', 'CLICKED', 'BOUNCED'].includes(x.status) ? x.status : 'SENT',
        openCount: Number(x.openCount) || 0,
        openedAt: date(x.openedAt, null),
        clickCount: Number(x.clickCount) || 0,
        clickedAt: date(x.clickedAt, null),
        lastClickUrl: x.lastClickUrl ?? null,
      }
      ops.push(p.emailSend.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const meetings = arr(val('meeting.minutes')).filter((x) => x?.id)
    expect.meeting = meetings.length
    for (const m of meetings) {
      const actions = arr(m.actionList).map((a, i) => ({
        sort: i,
        text: str(a?.text),
        owner: str(a?.owner),
        due: str(a?.due),
        done: !!a?.done,
      }))
      const data = {
        tenantId,
        title: str(m.title, '会议'),
        entityType: str(m.entityType, 'ACCOUNT'),
        entityId: str(m.entityId),
        heldAt: date(m.heldAt, dateFromId(m.id)),
        attendees: str(m.attendees),
        agenda: str(m.agenda),
        decisions: str(m.decisions),
        actions: str(m.actions),
        createdById: who(m.createdBy),
        createdByName: str(m.createdBy),
        createdAt: date(m.createdAt, dateFromId(m.id)),
      }
      ops.push(p.meetingAction.deleteMany({ where: { meetingId: m.id } }))
      ops.push(
        p.meeting.upsert({
          where: { id: m.id },
          update: { ...data, actionItems: { create: actions } },
          create: { id: m.id, ...data, actionItems: { create: actions } },
        }),
      )
    }

    const nps = arr(val('nps.scores')).filter((x) => x?.id && x?.accountId)
    expect.npsScore = nps.length
    for (const x of nps) {
      const data = {
        tenantId,
        accountId: str(x.accountId),
        accountName: str(x.accountName),
        contactName: str(x.contactName),
        score: Math.min(Math.max(Math.round(Number(x.score) || 0), 0), 10),
        comment: str(x.comment),
        createdById: who(x.createdBy),
        createdByName: str(x.createdBy),
        createdAt: date(x.createdAt, dateFromId(x.id)),
      }
      ops.push(p.npsScore.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const partners = arr(val('channel.partners')).filter((x) => x?.id)
    expect.channelPartner = partners.length
    for (const x of partners) {
      const data = {
        tenantId,
        name: str(x.name),
        contactName: str(x.contactName),
        phone: str(x.phone),
        region: str(x.region),
        remark: str(x.remark),
        createdAt: date(x.createdAt, dateFromId(x.id)),
      }
      ops.push(p.channelPartner.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const segs = arr(val('customer.segments')).filter((x) => x?.id)
    expect.customerSegment = segs.length
    for (const x of segs) {
      const data = {
        tenantId,
        name: str(x.name),
        stage: str(x.stage),
        industry: str(x.industry),
        level: str(x.level),
        tag: str(x.tag),
        minAmount: str(x.minAmount),
        note: str(x.note),
        autoOutreach: !!x.autoOutreach,
        createdById: who(x.createdBy),
        createdByName: str(x.createdBy),
        createdAt: date(x.createdAt, dateFromId(x.id)),
      }
      ops.push(p.customerSegment.upsert({ where: { id: x.id }, update: data, create: { id: x.id, ...data } }))
    }

    const plans = mine.filter((r) => r.key.startsWith('successplan.') && obj(r.value))
    expect.successPlan = plans.length
    for (const r of plans) {
      const accountId = r.key.slice('successplan.'.length)
      const v = obj(r.value)
      const adoption = Math.round(Number(v.adoption) || 0)
      const data = {
        goals: str(v.goals),
        milestones: arr(v.milestones),
        adoption: Math.min(Math.max(adoption, 0), 100),
        champion: str(v.champion),
        risks: str(v.risks),
        nextReview: str(v.nextReview),
        updatedById: who(v.updatedBy),
        updatedByName: str(v.updatedBy),
      }
      ops.push(
        p.successPlan.upsert({
          where: { tenantId_accountId: { tenantId, accountId } },
          update: data,
          create: { tenantId, accountId, ...data },
        }),
      )
    }

    if (!dryRun && ops.length) await p.$transaction(ops, { timeout: 60000 })
    for (const [model, n] of Object.entries(expect)) {
      const actual = dryRun ? null : await p[model].count({ where: { tenantId } })
      const bad = actual !== null && actual < n
      if (bad) ok = false
      console.log(`${tenantId} ${model.padEnd(20)} json=${n}${actual !== null ? ` table=${actual}` : ''}${bad ? '  ✗' : ''}`)
    }
  }
  if (!tenants.length) console.log('no success/marketing settings found')
  if (!ok) throw new Error('核对失败：表行数少于 JSON 条数')
}

// ---------------- 阶段 5：报表与商机记录 ----------------
async function migrateReports() {
  const rows = await p.setting.findMany({
    where: {
      OR: [
        { scope: 'TENANT', key: { in: ['commission.payouts', 'funnel.health.trend', 'health.report.history', 'decision.influence'] } },
        { scope: 'TENANT', key: { startsWith: 'forecast.commit.' } },
        { scope: 'TENANT', key: { startsWith: 'battlecard.' } },
        { scope: 'TENANT', key: { startsWith: 'health.trend.' } },
        { key: { startsWith: 'renewal_playbook:' } },
      ],
    },
  })
  if (!dryRun) backup('reports', rows)
  const tenants = [...new Set(rows.map((r) => r.tenantId))]
  let ok = true
  for (const tenantId of tenants) {
    const mine = rows.filter((r) => r.tenantId === tenantId)
    const val = (key) => mine.find((r) => r.key === key && r.scope === 'TENANT')?.value
    const who = await userResolver(tenantId)
    const ops = []
    const expect = {}
    const where = { tenantId }

    const payouts = arr(val('commission.payouts')).filter((x) => x?.periodKey && x?.userId)
    expect.commissionPayout = new Set(payouts.map((x) => `${x.periodKey}|${x.userId}`)).size
    for (const x of payouts) {
      const data = {
        userName: String(x.userName ?? ''),
        amount: money(x.amount),
        status: ['PENDING', 'CONFIRMED', 'PAID'].includes(x.status) ? x.status : 'PENDING',
        note: String(x.note ?? ''),
        updatedById: who(x.updatedBy),
        updatedByName: String(x.updatedBy ?? ''),
      }
      ops.push(
        p.commissionPayout.upsert({
          where: { tenantId_periodKey_userId: { tenantId, periodKey: String(x.periodKey), userId: String(x.userId) } },
          update: data,
          create: { tenantId, periodKey: String(x.periodKey), userId: String(x.userId), ...data },
        }),
      )
    }

    let commits = 0
    for (const r of mine.filter((r) => r.key.startsWith('forecast.commit.'))) {
      const month = r.key.slice('forecast.commit.'.length)
      const list = arr(r.value).filter((x) => x?.userId)
      commits += new Set(list.map((x) => x.userId)).size
      for (const x of list) {
        const data = {
          userName: String(x.userName ?? ''),
          commitAmount: money(x.commitAmount),
          bestAmount: money(x.bestAmount),
          worstAmount: money(x.worstAmount),
          note: String(x.note ?? ''),
          submittedAt: date(x.submittedAt, new Date()),
        }
        ops.push(
          p.forecastCommit.upsert({
            where: { tenantId_month_userId: { tenantId, month, userId: String(x.userId) } },
            update: data,
            create: { tenantId, month, userId: String(x.userId), ...data },
          }),
        )
      }
    }
    expect.forecastCommit = commits

    const cards = mine.filter((r) => r.key.startsWith('battlecard.') && obj(r.value))
    expect.opportunityBattlecard = cards.length
    for (const r of cards) {
      const opportunityId = r.key.slice('battlecard.'.length)
      const v = obj(r.value)
      const data = {
        competitors: String(v.competitors ?? ''),
        stakeholders: String(v.stakeholders ?? ''),
        winThemes: String(v.winThemes ?? ''),
        risks: String(v.risks ?? ''),
        actions: arr(v.actions),
        updatedById: who(v.updatedBy),
        updatedByName: String(v.updatedBy ?? ''),
      }
      ops.push(
        p.opportunityBattlecard.upsert({
          where: { tenantId_opportunityId: { tenantId, opportunityId } },
          update: data,
          create: { tenantId, opportunityId, ...data },
        }),
      )
    }

    // 健康分快照：(kind, subject, date) 唯一
    const snaps = new Map()
    for (const r of mine.filter((r) => r.key.startsWith('health.trend.'))) {
      const subjectId = r.key.slice('health.trend.'.length)
      for (const pt of arr(r.value)) if (pt?.date) snaps.set(`ACCOUNT|${subjectId}|${pt.date}`, { kind: 'ACCOUNT', subjectId, ...pt })
    }
    for (const pt of arr(val('funnel.health.trend'))) if (pt?.date) snaps.set(`FUNNEL||${pt.date}`, { kind: 'FUNNEL', subjectId: '', ...pt })
    expect.healthSnapshot = snaps.size
    for (const sn of snaps.values()) {
      const key = { tenantId, kind: sn.kind, subjectId: sn.subjectId, date: String(sn.date) }
      const data = { score: Number(sn.score) || 0, level: String(sn.level ?? '') }
      ops.push(p.healthSnapshot.upsert({ where: { tenantId_kind_subjectId_date: key }, update: data, create: { ...key, ...data } }))
    }

    // 巡检报告：旧逻辑把全系统报告存在第一个租户下，这里按原样归到该租户
    const reports = arr(val('health.report.history')).filter((x) => x?.generatedAt)
    expect.systemHealthReport = reports.length
    for (const x of reports) {
      const generatedAt = date(x.generatedAt, new Date())
      ops.push(p.systemHealthReport.deleteMany({ where: { tenantId, generatedAt } }))
      ops.push(p.systemHealthReport.create({ data: { tenantId, generatedAt, status: String(x.status ?? 'HEALTHY'), report: x } }))
    }

    const influence = Object.entries(obj(val('decision.influence')))
    for (const [contactId, v] of influence) {
      const n = v === null || v === undefined ? null : Math.round(Number(v))
      ops.push(
        p.contact.updateMany({
          where: { id: contactId, tenantId },
          data: { influence: n !== null && Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : null },
        }),
      )
    }

    const playbooks = mine.filter((r) => r.key.startsWith('renewal_playbook:'))
    expect.playbookProgress = playbooks.length
    for (const r of playbooks) {
      const scopeKey = r.key.slice('renewal_playbook:'.length)
      const pw =
        scopeKey === 'global'
          ? { tenantId, accountId: null, userId: r.userId }
          : { tenantId, accountId: scopeKey, userId: null }
      ops.push(p.playbookProgress.deleteMany({ where: pw }))
      ops.push(p.playbookProgress.create({ data: { ...pw, steps: obj(r.value) } }))
    }

    if (!dryRun && ops.length) await p.$transaction(ops, { timeout: 120000 })
    for (const [model, n] of Object.entries(expect)) {
      const actual = dryRun ? null : await p[model].count({ where })
      const bad = actual !== null && actual < n
      if (bad) ok = false
      console.log(`${tenantId} ${model.padEnd(22)} json=${n}${actual !== null ? ` table=${actual}` : ''}${bad ? '  ✗' : ''}`)
    }
    if (influence.length) {
      const set = dryRun ? null : await p.contact.count({ where: { tenantId, influence: { not: null } } })
      console.log(`${tenantId} contact.influence       json=${influence.length}${set !== null ? ` set=${set}` : ''}`)
    }
  }
  if (!tenants.length) console.log('no report/opportunity settings found')
  if (!ok) throw new Error('核对失败：表行数少于 JSON 条数')
}

// ---------------- 收口：删除已迁移的旧 Setting 行 ----------------
const MIGRATED_KEYS = [...GROUP_KEYS, ...CONTRACT_KEYS, ...TEMPLATE_KEYS, ...SUCCESS_KEYS,
  'commission.payouts', 'funnel.health.trend', 'health.report.history', 'decision.influence',
  // 无读取方的废弃共享键
  'shared.quote.templates', 'shared.contract.templates']
const MIGRATED_PREFIXES = ['quote.history.', 'successplan.', 'forecast.commit.', 'battlecard.', 'health.trend.', 'renewal_playbook:']

async function cleanup() {
  const where = {
    OR: [{ key: { in: MIGRATED_KEYS } }, ...MIGRATED_PREFIXES.map((x) => ({ key: { startsWith: x } }))],
  }
  const rows = await p.setting.findMany({ where })
  const byKey = {}
  for (const r of rows) {
    const k = MIGRATED_PREFIXES.find((x) => r.key.startsWith(x)) ?? r.key
    byKey[k] = (byKey[k] ?? 0) + 1
  }
  for (const [k, n] of Object.entries(byKey).sort()) console.log(`${k.padEnd(28)} ${n} row(s)`)
  if (!process.argv.includes('--confirm')) {
    console.log(`预览：将删除 ${rows.length} 行。确认已上线新代码并核对数据后，加 --confirm 执行`)
    return
  }
  backup('cleanup', rows)
  const res = await p.setting.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
  console.log(`deleted ${res.count} rows`)
}

const stages = {
  group: migrateGroup,
  contract: migrateContract,
  templates: migrateTemplates,
  success: migrateSuccess,
  reports: migrateReports,
  cleanup,
  all: async () => {
    for (const f of [migrateGroup, migrateContract, migrateTemplates, migrateSuccess, migrateReports]) await f()
  },
}

async function main() {
  const run = stages[stage]
  if (!run) throw new Error(`用法：node scripts/migrate-settings-to-tables.mjs <${Object.keys(stages).join('|')}> [--dry-run]`)
  await run()
  console.log(dryRun ? 'dry-run done (nothing written)' : 'done')
}

main()
  .catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
  .finally(() => p.$disconnect())
