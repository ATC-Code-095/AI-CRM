# 01 技术栈锁定与全局约定

> 本文件**具有强制力**。未经产品负责人明确批准，任何实现不得偏离。

---

## 1. 技术栈（不可变）

| 层 | 选型 | 版本约束 | 说明 |
|----|------|----------|------|
| 语言 | TypeScript | 5.x，`strict: true` | 全栈同构 |
| 包管理 | pnpm workspace | 9.x | monorepo |
| 前端框架 | React | 18.x | SPA |
| 构建 | Vite | 5.x | |
| UI 组件 | Ant Design | 5.x | 中后台默认 |
| 状态 | TanStack Query + zustand | | 服务端状态 / 极少本地态 |
| 表单 | antd Form + zod | | 校验 schema 与 TS 类型同源 |
| 路由 | React Router | 6.x | |
| 后端框架 | NestJS | 10.x | 模块化、DI、Guard |
| ORM | Prisma | 5.x | schema-first |
| 数据库 | PostgreSQL | 15+（本地镜像可用 16） | `tenant_id` 行级隔离 |
| 缓存/队列 | Redis + BullMQ | 7.x | 非业务主存储 |
| 移动壳 | Capacitor 6 + HarmonyOS ArkTS | | 仅壳与 Bridge |
| 鉴权 | JWT（access + refresh） | | + 可选 API Token |
| 校验 | zod | | DTO 与 Prisma 对齐 |
| API 风格 | REST + OpenAPI 3 | | `@nestjs/swagger` 生成 |
| 日志 | pino | | JSON 结构化 |
| 测试 | Vitest + Playwright | | 单测 + E2E |
| Lint/Format | ESLint + Prettier | | 配置入库 |
| 容器 | Docker Compose | | 本地 pg + redis |
| 拖拽 | @dnd-kit/core | | 商机看板 |
| 图表 | @ant-design/plots | | 漏斗/趋势 |
| i18n | i18next + react-i18next + i18next-browser-languagedetector | | UI 词典 |
| 时间 | dayjs（+ locale） | | 相对时间；正式格式化用 Intl |
| 移动壳 | Capacitor 6（iOS/Android）+ HarmonyOS NEXT ArkTS 壳 | | 见 11-cross-platform-mobile |
| PWA | vite-plugin-pwa | | manifest + 离线壳 |

**语言总冻结：** 业务代码只用 **TypeScript**。Swift / Kotlin / ArkTS **仅限原生壳与 Mobile Bridge**，禁止在壳内写业务规则。详见 `12-locked-decisions.md`。

**允许的替换：** 无。若环境缺依赖，向用户报告，不要静默换栈。

---

## 2. 仓库结构（monorepo）

```
ai-crm/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
├── docs/                          # 本套规格文档
├── packages/
│   └── shared/                    # 共享类型、枚举、zod schema、错误码
│       └── src/
│           ├── enums/
│           ├── dtos/
│           ├── errors.ts
│           └── constants.ts
├── apps/
│   ├── api/
│   │   ├── prisma/schema.prisma
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/            # guard/interceptor/pipe/filter
│   │   │   ├── modules/           # 与业务模块一一对应
│   │   │   │   ├── auth/ org/ lead/ account/ opportunity/
│   │   │   │   ├── activity/ catalog/ quote/ contract/ payment/
│   │   │   │   ├── ticket/ campaign/ report/ workflow/ platform/
│   │   │   └── seed/
│   │   └── test/
│   └── web/
│       └── src/
│           ├── app/ api/ components/ features/
│           ├── layouts/ pages/ hooks/ styles/
└── scripts/
```

**规则：**

- 后端 `modules/<name>` 与前端 `features/<name>` 一一对应
- 跨模块类型来自 `packages/shared`，禁止复制枚举
- Prisma schema 是数据库唯一真相；迁移只用 `prisma migrate`

---

## 3. 全局编码约定

### 3.1 命名

| 对象 | 风格 | 示例 |
|------|------|------|
| 数据库表 | snake_case 复数 | `opportunities` |
| Prisma model | PascalCase 单数 | `Opportunity` |
| API 路径 | kebab-case 资源 | `/api/v1/opportunities` |
| DTO/字段 | camelCase | `expectedCloseDate` |
| React 组件 | PascalCase | `PipelineBoard` |
| 常量 | SCREAMING_SNAKE | `OPP_STAGE_OPEN` |
| 枚举值 | SCREAMING_SNAKE | `LEAD_STATUS_NEW` |
| i18n key | 小写点号 | `lead.status.NEW` → `enum.lead.status.NEW` |
| 语言包 | `zh-CN.json` / `en-US.json` | 见 `10-i18n-mobile.md` |

### 3.2 ID 与审计字段

所有业务主键 `id = cuid()`，**禁止自增整数对外暴露**。

每张业务表必有：

```ts
id            String   @id @default(cuid())
tenantId      String
createdAt     DateTime @default(now())
createdById   String
updatedAt     DateTime @updatedAt
updatedById   String
deletedAt     DateTime?   // 软删除
```

### 3.3 多租户

- 所有查询必须带 `tenantId`
- NestJS TenantGuard + Repository 层强制注入
- 跨租户查询必须显式 `@SystemOnly()`
- 文件/导出/异步任务同样绑定 `tenantId`

### 3.4 金额与时间

- 金额：DB `decimal(18,2)`，DTO 用字符串（如 `"12345.67"`）
- 时间：DB `timestamptz`；API ISO-8601 UTC；展示默认 `Asia/Shanghai`

### 3.5 列表分页（全 API 统一）

```
GET /api/v1/opportunities?page=1&pageSize=20&sort=createdAt:desc&q=关键词
```

```json
{
  "code": 0,
  "message": "ok",
  "data": { "items": [], "page": 1, "pageSize": 20, "total": 0, "hasMore": false }
}
```

单体对象：`{ "code": 0, "message": "ok", "data": { } }`。写成功无主体时 `data: null`。

### 3.6 错误码

| code | HTTP | 含义 |
|------|------|------|
| 0 | 200 | 成功 |
| 40000 | 400 | 参数校验失败 |
| 40100 | 401 | 未登录/令牌失效 |
| 40300 | 403 | 无功能权限 |
| 40301 | 403 | 无数据权限 |
| 40400 | 404 | 资源不存在 |
| 40900 | 409 | 状态冲突（状态机/并发） |
| 42200 | 422 | 业务规则不满足 |
| 42900 | 429 | 限流 |
| 50000 | 500 | 服务器错误 |

### 3.7 权限点命名

```
module:resource:action
```

示例：`opportunity:read`, `opportunity:update_stage`, `contract:approve`。

### 3.8 Git 提交（AI）

```
<type>(<scope>): <summary>
# type: feat|fix|refactor|test|docs|chore
```

禁止 `--no-verify`；每个提交应可通过测试。

---

## 4. 环境变量（`.env.example`）

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_crm
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=dev-access-change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=dev-refresh-change-me
JWT_REFRESH_TTL=7d
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
```
