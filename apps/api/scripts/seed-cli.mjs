// 写入初始数据：2 个租户、角色与权限、销售管道、初始账号与少量演示数据（与 AUTO_SEED=true 相同）
// 用法：先构建 API（pnpm -C apps/api build），再在 apps/api 下执行 node scripts/seed-cli.mjs
// 可重复执行：已存在的租户、账号不会重复创建，也不会重置已修改的密码
// 新账号的初始密码：NODE_ENV=production 时随机生成并只显示一次；也可用 SEED_PASSWORD 指定
import { createRequire } from 'module'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (!existsSync(join(dist, 'seed', 'seed.service.js'))) {
  console.error('未找到 dist/seed/seed.service.js，请先构建 API：pnpm -C apps/api build')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { SeedService } = require(join(dist, 'seed', 'seed.service.js'))
const { PrismaService } = require(join(dist, 'common', 'prisma', 'prisma.service.js'))

const prisma = new PrismaService()
new SeedService(prisma)
  .seed()
  .then((r) => {
    if (!r.createdAccounts.length) console.log('seed ok：账号均已存在，未改动密码')
    else console.log(`seed ok：已创建 ${r.createdAccounts.length} 个账号（管理员 admin@demo.com）`)
  })
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
