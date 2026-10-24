# 12 冻结决策：功能 · 数据库 · 开发语言

> **本文件优先级最高。** 与其它文档冲突时，以本文件为准。  
> 未经产品负责人书面同意，不得扩大/缩小功能，不得换库、换语言。  
> 状态：**LOCKED**（2026-09-22 定稿）

---

## A. 开发语言与运行时（LOCKED）

### A1. 语言矩阵

| 用途 | 语言 | 运行时/编译 | 禁止 |
|------|------|-------------|------|
| 后端服务 | **TypeScript 5.x** | Node.js 20 LTS | Java/Python/Go 主服务 |
| Web（桌面+手机 H5） | **TypeScript 5.x** | React 18 + Vite | Vue/Angular |
| 共享类型/枚举/校验 | **TypeScript 5.x** | `packages/shared`（zod） | 各端手写重复类型 |
| 原生桥接口 | **TypeScript 5.x** | `packages/mobile-bridge` | 业务层写平台分支 |
| iOS 壳 | Swift（仅壳） | Capacitor 6 | 自行业务 Swift |
| Android 壳 | Kotlin（仅壳） | Capacitor 6 | 自行业务 Kotlin |
| HarmonyOS 壳 | **ArkTS**（仅壳+可选原生打卡） | HarmonyOS NEXT API 12+ | 用 Android APK |
| 数据库脚本 | SQL via **Prisma Migrate** | PostgreSQL 15+ | 手改生产库结构不迁移 |
| 构建脚本 | TypeScript / shell | pnpm workspace | 引入第二套构建主链 |

**一句话：** 业务 100% TypeScript；原生只做壳和 Bridge，不写第二套业务逻辑。

### A2. 框架与库（LOCKED 清单）

| 层 | 选型 |
|----|------|
| API | NestJS 10 + zod DTO + `@nestjs/swagger` |
| ORM | Prisma 5 |
| DB | **PostgreSQL 15+** |
| 缓存/队列 | Redis 7 + BullMQ |
| UI | Ant Design 5 |
| 状态/请求 | TanStack Query + zustand |
| 路由 | React Router 6 |
| i18n | i18next + react-i18next |
| 时间/金额展示 | `Intl` + dayjs |
| 移动壳 | Capacitor 6（iOS/Android）；DevEco ArkTS（鸿蒙） |
| 测试 | Vitest + Supertest + Playwright |
| 包管理 | pnpm 9 monorepo |

---

## B. 数据库（LOCKED）

### B1. 选型与规则

| 项 | 决策 |
|----|------|
| 引擎 | **PostgreSQL 15+** 单库 |
| 多租户 | 共享库 + **行级 `tenant_id`**（不做 schema-per-tenant） |
| 主键 | `TEXT` cuid/uuidv7 |
| 软删 | `deletedAt TIMESTAMPTZ NULL`；查询必须过滤 |
| 金额 | `NUMERIC(18,2)` |
| 时间 | `TIMESTAMPTZ`；应用写 UTC |
| JSON | 仅 `settings/rules/definition/snapshot` 等配置类；核心单据字段关系化 |
| 字符集 | UTF-8；排序 `zh` 需求用 ICU/查询层，不另建库 |
| 迁移 | 只允许 `prisma migrate dev/deploy` |
| Redis | 会话黑名单、限流、队列；**不以 Redis 为业务主存储** |

### B2. 表清单（全量，按模块）

> 业务表均含：`id, tenant_id, created_at, created_by_id, updated_at, updated_by_id, deleted_at`（系统表除外）。

| 模块 | 表名 | 用途 |
|------|------|------|
| M01 | `tenants` | 租户 |
| M01 | `users` | 用户（含 locale/timezone/data_scope） |
| M01 | `departments` | 部门树 |
| M01 | `roles` / `permissions` / `role_permissions` / `user_roles` | RBAC |
| M01 | `settings` | 租户/用户配置 |
| M01 | `audit_logs` | 审计 |
| M01 | `field_definitions` | 自定义字段（P1） |
| M02 | `leads` | 线索 |
| M03 | `accounts` | 客户 |
| M03 | `contacts` | 联系人 |
| M03 | `entity_shares` | 数据共享 |
| M04 | `pipelines` / `pipeline_stages` | 销售管道 |
| M04 | `opportunities` | 商机 |
| M04 | `opportunity_members` | 商机协作 |
| M04 | `opportunity_stage_histories` | 阶段历史 |
| M05 | `activities` | 任务/拜访/电话/备注 |
| M06 | `products` / `product_prices` | 产品与价目 |
| M06 | `quotes` / `quote_lines` | 报价 |
| M07 | `contracts` / `contract_lines` | 合同 |
| M07 | `payment_plans` | 回款计划 |
| M07 | `payments` | 回款单 |
| M08 | `tickets` / `ticket_logs` | 工单 |
| M09 | `campaigns` | 市场活动 |
| M09 | `forms` / `form_submissions` | 表单与提交 |
| M10 | `goals` | 销售目标 |
| M10 | `report_defs` | 报表定义（可选） |
| M11 | `approval_definitions` / `approval_instances` / `approval_steps` | 审批 |
| M11 | `notifications` | 站内通知 |
| M12 | `attachments` | 附件 |
| M12 | `webhooks` / `webhook_deliveries` | Webhook |
| M12 | `api_tokens` | 开放令牌 |
| M12 | `ai_suggestions` | AI 建议审计 |
| 计算 | 无独立表 | 应收=合同累计-回款；预测由查询聚合 |
| 补遗 | `tenants` `notifications` `doc_sequences` `geo_cache` | 见 `13-spec-supplements.md` §19 |
| 集团财务 | `GroupEntity` `GroupBudget` `GroupExpenseClaim` `GroupFundTransfer` `GroupSettlement` `GroupExpenseAlloc(Line)` `GroupAccountEntity` `GroupUserScope` | 变更记录 2026-10-21 |
| M07 补充 | `Invoice` `ContractChangeOrder` `ESignSeal` `Project` | 原 settings JSON 迁移 |
| M06 补充 | `QuoteShareToken` `QuoteSnapshot` `DocTemplate(Version/ApprovalLog)` | 原 settings JSON 迁移 |
| 赋能/客户成功 | `EmailTemplate` `ActivityTemplate` `KnowledgeArticle` `EmailSend` `Meeting(Action)` `NpsScore` `ChannelPartner` `SuccessPlan` `CustomerSegment` | 原 settings JSON 迁移 |
| 报表/商机 | `CommissionPayout` `ForecastCommit` `OpportunityBattlecard` `PlaybookProgress` `HealthSnapshot` `SystemHealthReport` | 原 settings JSON 迁移 |

`settings` 仅存配置：通用接口 `PATCH /settings` 只接受 13 §4 白名单键，其余配置走各自专用接口。

**明确不建（MVP）：** 独立佣金台账表、呼叫中心通话明细、BI 事实宽表、数据湖。

> 销售佣金管理中心已纳入范围（见 F 节变更记录 2026-10-21）：规则与发放状态存 `settings`（JSON），佣金按回款在报表层实时计算，不建独立台账表。

### B3. 核心索引（LOCKED）

```sql
-- 通用
CREATE INDEX ... ON <tbl> (tenant_id, deleted_at);
-- 列表
CREATE INDEX ... ON leads (tenant_id, owner_id, status, next_follow_at);
CREATE INDEX ... ON opportunities (tenant_id, stage_id, expected_close_date);
CREATE INDEX ... ON opportunities (tenant_id, account_id);
CREATE INDEX ... ON activities (tenant_id, entity_type, entity_id, start_at);
CREATE INDEX ... ON payments (tenant_id, contract_id, status);
CREATE UNIQUE INDEX ... ON users (tenant_id, email);
CREATE UNIQUE INDEX ... ON products (tenant_id, code);
CREATE UNIQUE INDEX ... ON quotes (tenant_id, quote_no);
CREATE UNIQUE INDEX ... ON contracts (tenant_id, contract_no);
```

### B4. 外键策略

- **必须外键：** 行项目→主单、用户→部门、阶段→管道、回款→合同/计划  
- **可弱引用（无 FK）：** `entity_shares.entity_id` 多态、`attachments.entity_id` 多态、`activities.entity_id` 多态  
- 删除业务主数据用软删；禁止级联硬删历史单据

### B5. 连接与环境

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_crm
REDIS_URL=redis://localhost:6379
```

本地 Docker Compose 固定：`postgres:16`（或 15+）、`redis:7`。

---

## C. 功能范围（LOCKED）

### C1. P0 必须交付（冻结清单，共 14 块）

| ID | 功能 | 完成定义（摘要） |
|----|------|------------------|
| F01 | 登录鉴权 | JWT 登录/刷新/登出、/me、禁用账号 |
| F02 | 组织权限 | 用户/部门/角色/权限点、行级数据权限（SELF/TEAM/DEPT/ALL/CUSTOM） |
| F03 | 多租户 | 全表 tenant 隔离、跨租户 40400 |
| F04 | 线索 | CRUD、分配、状态机、关闭、**转化** |
| F05 | 客户与联系人 | CRUD、主联系人、层级防环、**360+时间线** |
| F06 | 商机管道 | 阶段配置、CRUD、阶段历史、赢率、WON/LOST、**看板**、预测 |
| F07 | 活动跟进 | 任务/拜访/电话/备注、今日待办、**打卡（GPS+手工降级）** |
| F08 | 产品报价 | 产品、报价行、金额公式、折扣阈值、生成合同 |
| F09 | 合同回款 | 合同行、回款计划、回款确认、**核销** |
| F10 | 审批 | 折扣/合同审批、同意/驳回/撤回、审批中心 |
| F11 | 报表驾驶舱 | 漏斗、人效、回款趋势、目标达成、CSV |
| F12 | i18n | zh-CN + en-US 全词典、Intl 格式化、语言切换 |
| F13 | 三端移动 | 响应式 IA + PWA + **iOS/Android/鸿蒙安装包（壳）** |
| F14 | 平台基础 | 统一 API、审计、健康检查、种子数据、附件 |

### C2. P1 冻结为「应做」（第二优先级）

| ID | 功能 |
|----|------|
| F15 | 工单服务（状态机+满意度） |
| F16 | 营销活动 + 公开表单获客 |
| F17 | Webhook + API Token |
| F18 | 自定义字段 FieldMeta |
| F19 | AI：跟进摘要 / 下一步建议 / 输单风险（Mock 可关） |
| F20 | 站内通知铃铛 + 待办数字 |
| F21 | 推送（APNs/FCM/Push Kit）与扫码 |

### C3. P2 / 明确不做（冻结）

| 不做 | 说明 |
|------|------|
| ~~多币种与汇率清算~~ | 2026-10-23 已纳入：手工汇率表 + 本位币折算；2026-10-24 增加欧洲央行参考汇率每日自动更新，见变更记录（不做外汇损益清算） |
| 完整 CPQ/税则引擎 | 仅单品折扣率 |
| 呼叫中心/录音 | 不做 |
| 渠道分销/多级返利 | 不做 |
| 复杂 BPMN 可视化流程设计器 | 仅两级固定审批 |
| 自助 BI 拖拽建模 | 固定报表 |
| 业务数据机器翻译入库 | 不做 |
| 原生重写全部 UI | 仅壳+Bridge |
| 微信/企微/钉钉深度连接器 | 2026-10-23 已做群机器人通知；2026-10-24 已做企业微信 / 钉钉 / 飞书通讯录同步与扫码登录；个人工作通知、微信（个人号）仍不做 |
| 微服务拆分 | 单体 NestJS 模块化 |

### C4. 主链路功能（必须端到端）

```
登录 → 线索分配跟进 → 转化客户/联系人 → 商机阶段
→ 报价（超折扣审批）→ 合同 → 回款计划/核销 → 报表可见
```

手机端必须能完成：登录、待办、跟进、打卡、商机改阶段、客户详情。

---

## D. 接口与权限锚点（与功能对齐）

| 功能 | 权限前缀 | 主资源 |
|------|----------|--------|
| F04 | `lead:` | `/api/v1/leads` |
| F05 | `account:` `contact:` | `/accounts` `/contacts` |
| F06 | `opportunity:` `pipeline:` | `/opportunities` `/pipelines` `/boards/pipeline` |
| F07 | `activity:` | `/activities` |
| F08 | `product:` `quote:` | `/products` `/quotes` |
| F09 | `contract:` `payment:` | `/contracts` `/payments` |
| F10 | `approval:` | `/approvals` |
| F11 | `report:` `goal:` | `/reports` |
| F15 | `ticket:` | `/tickets` |
| F16 | `campaign:` `form:` | `/campaigns` `/forms/:id/submit` |

错误码、分页信封见 `05-api-conventions.md`（已 LOCKED）。

---

## E. 验收门禁（冻结）

| 门禁 | 标准 |
|------|------|
| 功能 | F01–F14 全过；F15–F17 至少接口+页面 |
| 数据 | `prisma migrate` 可空库重放；种子幂等 |
| 语言 | 业务代码 TypeScript `strict`；无第二后端语言 |
| 库 | 仅 PostgreSQL + Redis；无 MySQL/Mongo 旁路 |
| 移动 | iOS/Android/鸿蒙壳可登录并完成主链路冒烟 |
| i18n | zh/en 双包；无硬编码 UI 文案 |

---

## F. 变更流程

1. 发现需要新实体/新库/新语言：**停止编码**  
2. 在本文档「变更记录」追加：日期、变更项、原因、影响模块  
3. **仅当用户回复「同意」** 后，再改本文档与其它规格并实施  

### 变更记录

| 日期 | 变更 | 状态 |
|------|------|------|
| 2026-09-22 | 初版冻结：TS 全栈、PostgreSQL、F01–F21 范围 | LOCKED |
| 2026-09-22 | 细则补遗见 `13-spec-supplements.md`（不扩大功能） | LOCKED |
| 2026-10-21 | 纳入销售佣金管理中心（阶梯规则、行级累进计佣、发放状态、CSV 导出）；原因：用户确认需要；影响模块：M10 报表；不新增表 | 用户同意 |
| 2026-10-21 | 纳入集团财务模块（预算、资金调拨、资金池、结算、费用报销、合并财务、分主体利润）；原因：用户确认保留；影响模块：M01 组织、M10 报表 | 用户同意 |
| 2026-10-21 | 存放在 `settings` JSON 中的业务单据迁移为正式数据表（落实 B1「核心单据字段关系化」）；表清单见迁移计划；原因：用户确认；影响：多个模块 | 用户同意 |
| 2026-10-23 | 纳入多币种：`ExchangeRate` 表（手工录入、按日期生效），商机 / 报价 / 合同 / 回款计划 / 回款增加本位币金额列，由数据库触发器写入时折算；报表、业绩、佣金、预测、集团合并按本位币汇总；原因：用户确认需要；影响：M04、M06、M07、M10、M01 集团 | 用户同意 |
| 2026-10-23 | 纳入企业微信 / 钉钉 / 飞书群机器人通知（按分类转发站内通知）；原因：用户确认需要；影响：M12 平台 | 用户同意 |
| 2026-10-24 | 纳入企业微信 / 钉钉 / 飞书通讯录同步（同步部门，新人建为停用账号）与扫码登录（绑定优先，其次邮箱 / 手机匹配）；汇率改为可每日从欧洲央行参考汇率自动更新；鸿蒙推送接入华为 Push Kit；原因：用户确认需要；影响：M12 平台、多币种、手机端 | 用户同意 |
| 2026-10-23 | F21 推送落地：新增 `DeviceToken` 表，APNs / FCM 服务端发送（鸿蒙 Push Kit 仍未接入）；影响：M12 平台、移动端 | 用户同意 |
