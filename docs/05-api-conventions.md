# 05 API 约定

## 1. 总则

- Base：`/api/v1`
- Content-Type：`application/json`
- 鉴权：`Authorization: Bearer <accessToken>`
- 时间：ISO-8601 UTC；金额：十进制字符串
- 响应信封见 `01-tech-stack.md` §3.5–3.6

### 必备 Header

| Header | 说明 |
|--------|------|
| Authorization | Bearer token |
| X-Request-Id | 链路 ID |
| Accept-Language | `en-US,zh-CN;q=0.9`；缺省 zh-CN；导出表头/通知文案用 |
| X-Timezone | 可选 IANA 时区；缺省用户资料（默认 Asia/Shanghai） |
| Idempotency-Key | 可选；回款/转化/转合同/表单防重（`13-spec-supplements.md` §2） |
| If-Match | 可选；主单乐观锁 version（同上 §2.2） |

---

## 2. 标准 REST 资源模板

对每个资源 `/{resources}`：

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/{resources}` | `*:read` | 列表 |
| GET | `/{resources}/:id` | `*:read` | 详情 |
| POST | `/{resources}` | `*:write` | 创建 |
| PATCH | `/{resources}/:id` | `*:write` | 局部更新 |
| DELETE | `/{resources}/:id` | `*:delete` | 软删 |

**列表 query：** `page`, `pageSize(1..100, default 20)`, `sort=field:asc|desc`, `q`, 业务筛选（`status`, `ownerId`, `accountId`, `stageId`, `createdFrom`, `createdTo`）

**批量：** `POST /{resources}/batch` `{ids, action}`（白名单 action）。

---

## 3. 模块接口清单（MVP）

### 3.1 Auth / Org
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | `{email,password}` |
| POST | `/auth/refresh` | `{refreshToken}` |
| POST | `/auth/logout` | |
| GET/PATCH | `/auth/me` | 当前用户+权限点（含 `locale`/`timezone`） |
| CRUD | `/users` `/departments` `/roles` | |
| GET | `/permissions` | |
| GET/PATCH | `/settings` | |
| GET | `/audit-logs` | 管理员 |

`GET /auth/me` → `{ user, roles, permissions[] }`

### 3.2 Leads
标准 CRUD + `POST /leads/:id/convert` / `close` / `assign` + `GET /leads/:id/activities`

`POST /leads/:id/convert`：
```json
{
  "mode": "create_account",
  "existingAccountId": null,
  "account": {"name": "…"},
  "contact": {"name": "…", "mobile": "…"},
  "createOpportunity": true,
  "opportunity": {"name": "…", "amount": "0", "expectedCloseDate": "2026-06-01"}
}
```

### 3.3 Accounts / Contacts
标准 CRUD + `GET /accounts/:id/overview` + `/accounts/:id/timeline` + `POST /accounts/:id/share`

overview `data`：
```json
{
  "account": {},
  "contacts": [],
  "opportunities": [],
  "quotes": [],
  "contracts": [],
  "payments": [],
  "tickets": [],
  "openActivities": [],
  "metrics": {"totalContract": "0", "totalReceived": "0", "openOppAmount": "0"}
}
```

### 3.4 Opportunities
标准 CRUD + `PATCH /:id/stage` + `POST /:id/close-won|close-lost`  
+ `GET /pipelines` + `GET /boards/pipeline` + `GET /opportunities/forecast`

### 3.5 Activities
标准 CRUD + `POST /:id/check-in` + `GET /my-today` + `GET /timeline?entityType&entityId`

### 3.6 Products / Quotes
Products CRUD；Quotes CRUD + `PUT /quotes/:id/lines` + `submit|send|accept|to-contract`

### 3.7 Contracts / Payments
Contracts CRUD + `PUT /:id/lines|plans` + `effective|finish`  
Payments CRUD + `POST /payments/:id/confirm|reconcile`

### 3.8 Tickets
CRUD + `POST /tickets/:id/transition` `{toStatus, note?}`

### 3.9 Campaigns
CRUD + 公开 `POST /forms/:id/submit` → 自动建 Lead

### 3.10 Reports
`GET /reports/sales-funnel|owner-performance|revenue-trend|goal-attainment`  
导出：`?export=csv`；全局搜索：`GET /search?q=&types=`（见补遗 §5–6）

### 3.11 Approvals
`GET /approvals/todo` + `POST /:id/approve|reject|cancel` + `GET /approvals/:id`

### 3.12 Platform
`/webhooks` `/api-tokens` CRUD；`POST /files`；`GET /files/:id`

---

## 4. 公开/弱鉴权

| 路径 | 鉴权 | 用途 |
|------|------|------|
| `POST /forms/:id/submit` | 公开 + 限流 | 获客 |
| `GET /health` | 公开 | 健康 |
| `POST /webhooks/ingress/:token` | token/HMAC | 集成 |

---

## 5. 示例：创建商机

```http
POST /api/v1/opportunities
{
  "name": "某某集团-销售系统年费",
  "accountId": "clxxx",
  "amount": "120000.00",
  "expectedCloseDate": "2026-06-30",
  "stageId": "clstage-discovery",
  "nextStep": "本周五演示"
}
```

`201` → `{ "code": 0, "data": { "id": "…", "stage": { "winRate": 25 }, … } }`

---

## 6. OpenAPI

- Controller 使用 `@ApiTags/@ApiOperation/@ApiResponse`
- `GET /api/v1/openapi.json`
- 接口变更须在提交说明中列出
