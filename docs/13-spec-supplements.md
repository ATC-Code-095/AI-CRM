# 13 规格补遗（不完善处补齐）

> 与 `12-locked-decisions.md` 同级：补齐开发中容易含糊的细则。  
> 未在本文/其它文档写明的行为，实现视为 **禁止发明**，应提问。

---

## 1. ID / 单号规则（LOCKED）

| 单据 | 格式 | 示例 | 生成时机 |
|------|------|------|----------|
| 线索 | 无强制单号 | `id` 即主键 | 创建 |
| 报价 | `QT` + `yyyyMMDD` + 4 位日序列 | `QT202609220001` | 创建报价时 |
| 合同 | `HT` + `yyyyMMDD` + 4 位日序列 | `HT202609220003` | 创建合同时 |
| 回款 | `SK` + `yyyyMMDD` + 4 位日序列 | `SK202609220002` | 创建回款时 |
| 工单 | `GD` + `yyyyMMDD` + 4 位日序列 | `GD202609220001` | 创建工单时 |
| 审批实例 | `AP` + `yyyyMMDD` + 4 位 | `AP202609220001` | 触发审批时 |

**序列实现：** 表 `doc_sequences (tenant_id, prefix, day_key, current, unique(tenant_id,prefix,day_key))` + 事务内 `UPDATE ... RETURNING`。  
跨午夜自然滚日；不保证全局唯一以外的连续无洞（允许缺口）。

---

## 2. 幂等与并发（LOCKED）

### 2.1 Idempotency-Key

下列写接口支持可选 Header `Idempotency-Key`（UUID）：

- `POST /payments`、`POST /payments/:id/confirm`、`POST /payments/:id/reconcile`
- `POST /leads/:id/convert`
- `POST /quotes/:id/to-contract`
- `POST /forms/:id/submit`（表单）
- 批量 `POST /{resources}/batch`

规则：

1. 同租户同 key 24h 内重复请求 → 返回**首次**结果（含 201）
2. 请求体不同却复用 key → `40900`
3. 存储：Redis `idem:{tenantId}:{key}` → `{status, responseHash, body}` TTL 24h

### 2.2 乐观锁

业务主单（quotes/contracts/payments/opportunities）含 `version INT`：

- 更新必须带 `version`（或 `If-Match` 头）；不匹配 → `40900` `data.current` 返回最新
- 列表/详情响应带 `version`
- 阶段变更、核销、审批动作必须走乐观锁

### 2.3 金额变更

`PATCH` 单头 `total/subtotal` **不允许直接改**；只能改行项目后由服务端重算。

---

## 3. 编号以外的业务规则补遗

### 3.1 线索自动分配（P0 可配置）

`settings` key：`lead.assign_rule` = `MANUAL | ROUND_ROBIN | LOAD_BALANCE`

| 规则 | 行为 |
|------|------|
| MANUAL | owner=创建人 |
| ROUND_ROBIN | 在角色 `SALES_REP` 且 ACTIVE 的用户中轮询（按 users.id 稳定序） |
| LOAD_BALANCE | 取未关闭线索最少的销售；并列取 id 较小 |

`lead.assign_on_create` 默认 true；手动 `assign` 覆盖。轮询游标存 `settings.lead.assign_cursor`。

### 3.2 业绩归属（报表/goal）

| 指标 | 归属人 | 归属日 |
|------|--------|--------|
| 赢单金额 WON_AMOUNT | 商机 `ownerId` | `actualCloseDate` |
| 新增商机 | 商机 `ownerId` | `createdAt` |
| 新增线索 | 线索 `ownerId` | `createdAt` |
| 回款 REVENUE | 合同 `ownerId`（非财务确认人） | `payments.paidAt` |
| 转化客户 | 客户 `ownerId` | `convertedAt` / `createdAt` |

输单不计 WON；丢单转名下不追溯。

### 3.3 回款核销细则

1. 单次核销金额 = 回款单 `amount` 全额（MVP 不支持部分核销拆多期）  
2. 选择 `paymentPlanId` 必填；超额使计划 `receivedAmount > amount` → `42200`  
3. 计划收满：`receivedAmount == amount` → `PAID`  
4. 合同 `receivedAmount` = 其名下 `CONFIRMED|RECONCILED` 回款之和（RECONCILED 后仍计入）  
5. 同一 `payment.id` 仅一次 `reconcile`（状态机 + 幂等键）

### 3.4 工单 SLA（简单表）

| severity | 首次响应 | 解决目标 |
|----------|----------|----------|
| URGENT | 1h | 8h |
| HIGH | 4h | 24h |
| MEDIUM | 8h | 72h |
| LOW | 24h | 7d |

`dueAt` 创建时 = now + 解决目标（工作日 MVP 按自然小时）。逾期列表标红；不自动升级（P2）。

### 3.5 软删除与回收站

- `DELETE` → `deletedAt=now`，`deletedById` 可写 `updatedById`
- 默认列表排除；管理端 `GET /accounts?includeDeleted=true`（权限 `*:read` + `ADMIN` 角色）
- 恢复：`POST /accounts/:id/restore`（P1）；MVP 可 SQL/管理接口
- 单号不回收

---

## 4. settings 配置键全目录

| key | scope | 默认 | 说明 |
|-----|-------|------|------|
| `i18n.default_locale` | TENANT | `zh-CN` | |
| `discount_approval_threshold` | TENANT | `0.2` | 折扣率阈值 |
| `contract_approval_amount` | TENANT | `100000` | 合同额审批阈值 |
| `lead.assign_rule` | TENANT | `MANUAL` | |
| `lead.assign_on_create` | TENANT | `true` | |
| `lead.assign_cursor` | TENANT | `0` | 系统 |
| `ai_enabled` | TENANT | `false` | |
| `ai_provider` | TENANT | `mock` | `mock\|http` |
| `file.max_size_mb` | TENANT | `10` | |
| `form.rate_limit_per_ip_min` | TENANT | `5` | |
| `quote.no_prefix` | TENANT | `QT` | |
| `contract.no_prefix` | TENANT | `HT` | |
| `payment.no_prefix` | TENANT | `SK` | |
| `ticket.no_prefix` | TENANT | `GD` | |
| `opportunity.default_pipeline_code` | TENANT | `STD_B2B` | |
| `session.refresh_ttl_days` | TENANT | `7` | |
| `locale` | USER | `zh-CN` | 优先读 users.locale |
| `timezone` | USER | `Asia/Shanghai` | |

未知 key 读取 → `40400`；写权限 `org:setting:write`。

---

## 5. 全局搜索（P0 最小）

`GET /api/v1/search?q=&types=account,contact,opportunity,lead,contract`

| 规则 | 值 |
|------|-----|
| 范围 | 当前用户数据权限内 |
| 匹配 | name / contactName / phone / email / quoteNo / contractNo `ILIKE %q%` |
| 限制 | `q` 长度 2–64；每类最多 10 条；超时 300ms 降级提示 |
| 返回 | `{type, id, title, subtitle}` |

手机顶栏搜索入口复用此接口。

---

## 6. CSV 导入导出

### 6.1 导出（P0）

| 报表/列表 | 端点 | 列 |
|-----------|------|-----|
| 漏斗 | `/reports/sales-funnel?export=csv` | stage,count,amount,weighted |
| 人效 | `/reports/owner-performance?export=csv` | owner,metrics… |
| 通用列表 | `/{resources}?export=csv` | 默认列配置 |

- 表头用当前 `Accept-Language` 词典
- 文件名：`{code}_{yyyyMMdd_HHmm}_{locale}.csv`
- 编码 UTF-8 **带 BOM**（Excel）；金额无千分位；日期 `YYYY-MM-DD`
- 异步导出（>1万行）走 BullMQ + 临时下载链（P1）；MVP 同步限 5000 行

### 6.2 导入（P1）

| 对象 | 模板列（zh 表头，en 并行） |
|------|---------------------------|
| leads | 名称,联系人,手机,邮箱,来源,备注 |
| accounts | 名称,行业,级别,负责人邮箱,电话 |
| contacts | 客户名称,姓名,手机,邮箱,职务 |
| products | 编码,名称,单位,标准价 |

- 错误行返回行号；全部可回滚（事务按批 500）
- 来源枚举须映射 code；负责人按邮箱匹配本租户用户

---

## 7. 审批 rules JSON Schema

`approval_definitions.rules`：

```json
{
  "$comment": "MVP 两级：申请人上级 → 上上级",
  "steps": [
    { "type": "MANAGER", "levels": 1 },
    { "type": "MANAGER", "levels": 2 }
  ],
  "when": {
    "all": [
      { "field": "discountRateMax", "op": ">", "value": 0.2 }
    ]
  }
}
```

合同：

```json
{
  "steps": [{ "type": "MANAGER", "levels": 1 }],
  "when": { "all": [{ "field": "total", "op": ">=", "value": 100000 }] }
}
```

`when` 字段由触发方传入 `approval_instances.snapshot` 的 `payload`。  
`type` 仅允许：`MANAGER` | `USER` | `ROLE`（P2 扩）。

---

## 8. Webhook 载荷与签名

### 8.1 事件与 body

```json
{
  "event": "payment.confirmed",
  "tenantId": "t1",
  "occurredAt": "2026-09-22T03:00:00.000Z",
  "data": { "paymentId": "…", "amount": "1000.00", "contractId": "…" }
}
```

| event | data 必含 |
|-------|-----------|
| `lead.created` | leadId, source, ownerId |
| `lead.converted` | leadId, accountId |
| `opportunity.won` | opportunityId, amount, ownerId |
| `contract.signed` | contractId, total, accountId |
| `payment.confirmed` | paymentId, amount, contractId |

### 8.2 签名

- Header `X-AI-CRM-Signature: t=unix,v1=hmac_sha256_hex(secret, t + '.' + rawBody)`
- Header `X-AI-CRM-Event`, `X-AI-CRM-Delivery`
- 重试：1m / 5m / 30m，共 3 次；2xx 成功
- 接收方可实现 `POST /webhooks/ingress/:token`

---

## 9. AI 接口契约（P1）

```ts
export interface AiPort {
  summarize(input: {
    entityType: 'OPPORTUNITY' | 'ACCOUNT' | 'LEAD'
    entityId: string
    locale: 'zh-CN' | 'en-US'
  }): Promise<{ content: string }>
  suggestNext(input: { opportunityId: string; locale: string }): Promise<{ suggestions: string[] }>
  risk(input: { opportunityId: string; locale: string }): Promise<{ level: 'LOW'|'MEDIUM'|'HIGH'; reasons: string[] }>
}
```

- 每次调用写 `ai_suggestions`（type, content jsonb, provider, model, at）
- 禁止 AI 直接改库状态；超时 8s → `42200` 空建议
- Mock：根据阶段/活动数生成确定性文案，便于单测

---

## 10. 通知模板（站内）

| type | title key | body 变量 |
|------|-----------|-----------|
| `LEAD_ASSIGNED` | `notify.lead.assigned` | leadName |
| `APPROVAL_TODO` | `notify.approval.todo` | entityTitle, amount |
| `APPROVAL_DONE` | `notify.approval.done` | result |
| `ACTIVITY_DUE` | `notify.activity.due` | subject, dueAt |
| `PAYMENT_CONFIRMED` | `notify.payment.confirmed` | amount |

`notifications` 字段：`id, tenant_id, user_id, type, title, body, entity_type, entity_id, is_read, created_at`。

---

## 11. 安全基线（必做）

| 项 | 要求 |
|----|------|
| HTTPS | 生产强制；HSTS |
| CORS | 仅 `CORS_ORIGIN` 列表 |
| 限流登录 | 5 次/分/IP+邮箱，锁定 15min |
| 限流写接口 | 100 次/分/token |
| 密码 | bcrypt cost 12；禁止出现在日志/响应 |
| JWT | access 15min；refresh 7d 可吊销 |
| 越权 | 功能 40300 + 数据 40301；跨租户 40400 |
| XSS | React 默认转义；禁 `dangerouslySetInnerHTML`（除非审计） |
| CSRF | Cookie 方案必须 SameSite=Lax + CSRF token；Bearer 方案无需 |
| 文件 | 扩展名+MIME 白名单 pdf/png/jpeg；大小 settings；随机 storageKey |
| 上传文件名 | 不使用用户原名作路径 |
| SQL | 仅 Prisma；raw 必须参数化 |
| 审计 | 登录、权限变更、金额相关写、导出 |
| 依赖 | CI `pnpm audit` 高危失败 |
| 秘钥 | 环境变量；禁止入库/入前端包 |
| 移动 WebView | JS Bridge 不暴露 `eval`；origin 校验 |
| 隐私 | 见 `11` 发布清单 |

---

## 12. 限流默认表

| 路径 | 限 |
|------|-----|
| `POST /auth/login` | 5/min/IP |
| `POST /auth/refresh` | 30/min |
| `POST /forms/:id/submit` | 5/min/IP |
| `GET /files/:id` | 60/min |
| 其它 API | 100/min/token |
| 导出 | 10/min |

超限 `42900`；Header `Retry-After`。

---

## 13. 定时任务（BullMQ）

| Job | 调度 | 行为 |
|-----|------|------|
| `payment.plan.overdue` | 每天 01:00 | 到期未足计划 → `OVERDUE` |
| `activity.reminder` | 每 5 分钟 | `remindAt` 落入窗口 → 通知 |
| `webhook.deliver` | 队列 | 投递+重试 |
| `export.csv` | 队列（P1） | 大导出 |
| `opportunity.followup.scan` | 每天 09:00 | 无 nextFollowAt 的开放商机 → 通知 owner |
| `session.cleanup` | 每天 | 清过期 idem/refresh |

---

## 14. 前端路由表（P0）

```
/login
/register-invite/:token          # 可选 P1
/
  /home
  /leads  /leads/:id
  /accounts  /accounts/:id
  /contacts  /contacts/:id
  /opportunities  /opportunities/:id  /pipeline-board
  /quotes  /quotes/:id
  /contracts  /contracts/:id
  /payments  /payments/:id
  /tickets  /tickets/:id          # P1 可先占位
  /campaigns                      # P1
  /reports/funnel | /performance | /revenue | /goals
  /approvals  /approvals/:id
  /settings/users | /departments | /roles | /settings | /audit
  /me
```

移动底部 Tab 映射：`home | accounts | opportunities | activities | me`。

---

## 15. 环境变量（全量）

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=
REDIS_URL=
JWT_ACCESS_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_SECRET=
JWT_REFRESH_TTL=7d
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
FILE_STORAGE_DIR=./storage
GEO_PROVIDER=mock          # mock|amap
GEO_API_KEY=
AI_PROVIDER=mock
AI_API_KEY=
AI_BASE_URL=
WEBHOOK_TIMEOUT_MS=8000
```

---

## 16. 测试夹具与数据工厂

`packages/shared` 或 `apps/api/test/factories`：

- `makeTenant/makeUser(role,dataScope)`
- `makeLead(status)` `makeAccount` `makeOpportunity(stage)`
- 断言工具：`expectPageShape(res)` `expectError(res, code)`

禁止各测试手写大段重复 payload。

---

## 17. API 演进

| 规则 | 说明 |
|------|------|
| 版本 | 仅 `/api/v1`；破坏性变更 → `/v2` |
| 破坏性 | 删字段、改类型、改语义、改状态机 |
| 兼容 | 加字段、加接口、放宽校验 |
| CI | 可选 openapi diff；破坏需在提交说明标注 `BREAKING` |

---

## 18. 逻辑删除字段补遗（表结构增量）

业务表统一追加：

| 字段 | 类型 |
|------|------|
| `version` | `INT NOT NULL DEFAULT 1`（主单） |
| `deleted_by_id` | TEXT NULL |

多态/弱引用表可不带 `version`。

---

## 19. 数据字典补遗（此前缺失表）

### tenants
`code, name, default_locale, status: ACTIVE|SUSPENDED, expire_at?`

### notifications
见 §10。

### opportunity_contact_roles（可选，P1）
`opportunity_id, contact_id, role` — 替代仅 primaryContact 的扩展。

### doc_sequences
`tenant_id, prefix, day_key, current`

### idempotency_keys（若不用纯 Redis）
`tenant_id, key, endpoint, request_hash, response_body jsonb, created_at`

### geo_cache
`tenant_id?, geohash, lat, lng, address, updated_at` — 逆地理缓存

---

## 20. 逻辑边界：订单 vs 合同

- **合同 Contract**：签约事实与总额（主）  
- **不做**独立「销售订单 Order」对象；出货/实施单 P2  
- 报价可多份对商机；合同 MVP 一份主合同可关联一份报价  

---

## 21. 运维与备份

| 项 | 要求 |
|----|------|
| 备份 | 每日 pg_dump；保留 7 日；Redis 不作为唯一存储 |
| 健康 | `/health` 含 db/redis |
| 日志 | JSON；`request_id, tenant_id, user_id, route, status, ms` |
| 指标（P1） | 请求数/延迟/错误率；简单 Prometheus `/metrics` |
| 迁移发布 | 先 migrate 再发应用；不支持双写回填脚本外的脏改 |

---

## 22. 代码结构补充约定

| 项 | 约定 |
|----|------|
| Service | 一个聚合根一个 Service；跨模块用公共 API 方法 |
| 错误 | 业务错误抛 `BizException(code, message, fields?)` |
| 权限装饰器 | `@Permissions('lead:write')` `@DataScope()` |
| 时间 | 服务端 `Clock` 可注入，便于测试 |
| 金额 | `packages/shared/src/money.ts`：parse/format/mul |

---

## 23. 原先含糊 — 现已定义的检查表

| 原缺口 | 处 |
|--------|-----|
| 单号怎么生成 | §1 |
| 重复提交回款 | §2 |
| 线索分给谁 | §3.1 |
| 业绩算谁的 | §3.2 |
| 工单何时超时 | §3.4 |
| 搜索怎么做 | §5 |
| Excel 模板 | §6 |
| 审批条件怎么配 | §7 |
| Webhook 签名 | §8 |
| AI 如何接入 | §9 |
| 安全有何基线 | §11–12 |
| 后台任务 | §13 |
| 前端路由 | §14 |
| 缺表 | §19 |
| 订单和合同 | §20 |
