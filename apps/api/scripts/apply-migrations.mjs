// 按 `prisma migrate deploy` 的规则应用未执行的迁移（供 schema-engine 无法直连数据库的环境使用）
// 用法：node scripts/apply-migrations.mjs [--dry-run]
// 记录写入 _prisma_migrations（checksum = migration.sql 的 sha256），之后可与 prisma migrate 命令互通
import { PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'crypto'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations')
const dryRun = process.argv.includes('--dry-run')
const p = new PrismaClient()

/** 按语句切分：跳过注释行，以行尾分号结束一条语句（Prisma 生成的 SQL 满足此格式）；$$ 包起来的函数体内的分号不切分 */
function splitStatements(sql) {
  const out = []
  let cur = []
  let inDollar = false
  for (const line of sql.split('\n')) {
    if (!cur.length && !inDollar && (line.trim() === '' || line.trim().startsWith('--'))) continue
    cur.push(line)
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inDollar = !inDollar
    if (!inDollar && line.trimEnd().endsWith(';')) {
      out.push(cur.join('\n'))
      cur = []
    }
  }
  if (cur.join('').trim()) out.push(cur.join('\n'))
  return out
}

async function main() {
  const applied = await p.$queryRawUnsafe(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations',
  )
  const byName = new Map(applied.map((r) => [r.migration_name, r]))
  const failed = applied.filter((r) => !r.finished_at && !r.rolled_back_at)
  if (failed.length) {
    throw new Error(`存在未完成的迁移，需先人工处理：${failed.map((r) => r.migration_name).join(', ')}`)
  }
  const names = readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, 'migration.sql')))
    .sort()
  for (const name of names) {
    const sql = readFileSync(join(dir, name, 'migration.sql'), 'utf8')
    const checksum = createHash('sha256').update(sql).digest('hex')
    const prev = byName.get(name)
    if (prev) {
      if (prev.checksum !== checksum) console.warn(`! ${name} 已应用但文件已被修改（checksum 不一致）`)
      continue
    }
    const stmts = splitStatements(sql)
    console.log(`${dryRun ? '[dry-run] ' : ''}apply ${name} (${stmts.length} statements)`)
    if (dryRun) continue
    const id = randomUUID()
    // 整个迁移放在一个事务里：任一语句失败则全部回滚，不留半成品
    await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 0)',
        id,
        checksum,
        name,
      )
      for (const s of stmts) await tx.$executeRawUnsafe(s)
      await tx.$executeRawUnsafe(
        'UPDATE _prisma_migrations SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
        id,
      )
    })
  }
  console.log('done')
}

main()
  .catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
  .finally(() => p.$disconnect())
