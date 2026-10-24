# 工程启动说明

规格文档见 `docs/`。本目录已是**可扩展骨架**，不是完整实现。

## 已就绪

| 路径 | 内容 |
|------|------|
| `docs/` | 全套规格（含 `12-locked-decisions.md` 冻结） |
| `apps/api/prisma/schema.prisma` | 全量表结构（与 04/12/13 对齐） |
| `packages/shared/src/enums` | 业务枚举 |
| `packages/shared/src/errors.ts` | 错误码与信封 |
| `packages/shared/src/money.ts` | 金额运算 |
| `packages/shared/src/constants.ts` | 权限点 + 角色种子映射 |
| `apps/web/src/locales/zh-CN.json` | 中文词典 |
| `apps/web/src/locales/en-US.json` | 英文词典 |
| `docker-compose.yml` | 全套容器部署（PostgreSQL + Redis + API + Web），见 README「部署」 |
| `docker-compose.dev.yml` | 本地开发用 PostgreSQL 16 + Redis 7 |
| `.env.example` | 环境变量 |
| `pnpm-workspace.yaml` | monorepo |

## 运行时状态（2026-09-23）

| 项 | 值 |
|----|-----|
| API | `http://127.0.0.1:3001` |
| Web | `http://127.0.0.1:5174` |
| **PostgreSQL** | 库 `ai_crm` / 用户 **`crm`**（小写，不是 CRM），地址见 `apps/api/.env` |
| **Redis** | 连接串见 `apps/api/.env` 的 `REDIS_URL`（可选），勿写入文档 |
| 演示账号 | `admin@demo.com`（开发环境密码见 `apps/api/src/seed/seed.service.ts`） |
| 已验证 | 远程 migrate + seed（2 租户 / 6 用户）+ login/me/users |
| 生产构建 | `apps/web/dist`、`apps/api/dist` 已可构建 |
| 冒烟脚本 | `scripts/smoke.sh`（线索转化→报价合同回款→驾驶舱） |
| Swagger | `http://127.0.0.1:3001/api/v1/docs` |
| PWA | `public/manifest.json` + `icons/*.svg` |
| 健康检查 | 含 `db` / `redis` |

## 常用命令

```bash
# 开发
cd apps/api && AUTO_SEED=true pnpm exec nest start   # :3001
cd apps/web && pnpm exec vite --port 5174            # :5174

# 冒烟
bash scripts/smoke.sh          # API 全链路
pnpm test:e2e                  # Playwright UI（需 api+web 已启动）

# 构建
pnpm -C apps/web exec vite build
pnpm -C apps/api exec tsc -p tsconfig.json -outDir dist

# 全栈容器（可选，见 README「部署」）
docker compose --env-file .env.docker up -d --build
```

## 下一步（按 `docs/08-milestones.md` M0/M1）

1. `pnpm install`
2. 复制 `.env.example` → `apps/api/.env`
3. `docker compose -f docker-compose.dev.yml up -d`
4. 补齐 `apps/api` NestJS 与 `apps/web` Vite 应用入口
5. `prisma migrate dev --name init` + seed（角色权限用 `ROLE_PERMISSION_SEED`）
6. Auth / RBAC / TenantGuard
7. i18n 接入 locales

## 硬约束

- 只使用 TypeScript 业务代码；库只有 PostgreSQL + Redis
- 功能范围不得超出 F01–F21（见 `12-locked-decisions.md`）
- 细节规则见 `13-spec-supplements.md`
