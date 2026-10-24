# 04 数据字典（全量实体字段）

> 类型以 Prisma/Postgres 为准。`必填` 指 API 创建时必须提供或系统生成。  
> 所有业务表含：`id, tenantId, createdAt, createdById, updatedAt, updatedById, deletedAt?`（下表不重复）。  
> 主单另含 `version INT` 乐观锁；`tenants`/`notifications`/`doc_sequences` 等见 `13-spec-supplements.md`。

### tenants（根表）
`code(唯一), name, defaultLocale, status: ACTIVE|SUSPENDED, expireAt?`

---

## 4.1 组织 M01

### users
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| email | string(255) | ✓ | 租户内唯一 |
| passwordHash | string | ✓ | bcrypt |
| name | string(64) | ✓ | |
| phone | string(32)? | | |
| avatarUrl | string? | | |
| status | enum: ACTIVE/DISABLED | ✓ | 默认 ACTIVE |
| departmentId | string? | | |
| managerId | string? | | 直属上级 |
| title | string(64)? | | |
| dataScope | enum: SELF/TEAM/DEPARTMENT/ALL/CUSTOM | ✓ | 默认 SELF |
| locale | string(16) | ✓ | 默认 zh-CN；UI 语言 |
| timezone | string(64) | ✓ | 默认 Asia/Shanghai |
| lastLoginAt | timestamptz? | | |

### departments
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| name | string(64) | ✓ | |
| parentId | string? | | |
| code | string(32)? | | |
| path | string | ✓ | 物化路径 `/root/a/b` |
| managerId | string? | | |
| sortOrder | int | ✓ | 默认 0 |

### roles / permissions / role_permissions / user_roles
RBAC 标准表。权限 `code, name, module`。

**内置角色：** `SUPER_ADMIN`, `SALES_MANAGER`, `SALES_REP`, `OPERATIONS`, `FINANCE`, `SERVICE_AGENT`。

### settings
`key, value jsonb, scope: TENANT|USER`

常用 key：`i18n.default_locale`（默认 zh-CN）、`discount_approval_threshold`、`ai_enabled`

### audit_logs
`action, entity, entityId, before jsonb, after jsonb, ip, userAgent`

### field_definitions（P1）
`entity, apiName, label, dataType, required, options jsonb, sortOrder, isActive`

---

## 4.2 线索 M02

### leads
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| name | string(128) | ✓ | 线索/公司名 |
| contactName | string(64)? | | |
| phone | string(32)? | | |
| email | string(255)? | | |
| website | string? | | |
| industry | string(64)? | | |
| source | enum: WEB_FORM/PHONE/REFERRAL/EXHIBITION/COLD_CALL/ADS/PARTNER/OTHER | ✓ | |
| campaignId | string? | | |
| status | enum LeadStatus | ✓ | 默认 NEW |
| score | int | ✓ | 默认 0，0-100 |
| ownerId | string | ✓ | |
| departmentId | string? | | |
| expectedAmount | decimal(18,2)? | | |
| remark | text? | | |
| nextFollowAt | timestamptz? | | |
| convertedAt | timestamptz? | | |
| convertedAccountId | string? | | |
| convertedContactId | string? | | |
| convertedOpportunityId | string? | | |
| closeReason | string(128)? | | |

---

## 4.3 客户与联系人 M03

### accounts
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| name | string(128) | ✓ | 企业名 |
| shortName | string(64)? | | |
| accountNo | string(32)? | | |
| industry | string(64)? | | |
| scale | enum: MICRO/SMALL/MEDIUM/LARGE/ENTERPRISE? | | |
| region | string(64)? | | |
| address | string(255)? | | |
| website | string? | | |
| phone | string(32)? | | |
| level | enum: A/B/C/D | ✓ | 默认 C |
| stage | enum: POTENTIAL/ACTIVE/AT_RISK/CHURNED | ✓ | 默认 POTENTIAL |
| ownerId | string | ✓ | |
| departmentId | string? | | |
| parentAccountId | string? | | |
| source | string(64)? | | |
| annualRevenue | decimal(18,2)? | | |
| remark | text? | | |
| lastActivityAt | timestamptz? | | |

### contacts
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| accountId | string | ✓ | |
| name | string(64) | ✓ | |
| title | string(64)? | | |
| phone | string(32)? | | |
| mobile | string(32)? | | |
| email | string(255)? | | |
| isPrimary | bool | ✓ | 默认 false |
| decisionRole | enum: ECONOMIC/USER/TECH/CHAMPION/OTHER? | | |
| preferredLocale | string(16)? | | 联系人偏好语言（通知/信函 P1） |
| birthDate | date? | | |
| wechat | string(64)? | | |
| remark | text? | | |

### entity_shares
`entityType, entityId, userId, role: COLLABORATOR|VIEWER`

---

## 4.4 商机 M04

### pipelines
`name, isDefault, isActive`

### pipeline_stages
`pipelineId, code, name, winRate, sortOrder, isClosing, requiredFields jsonb?`

### opportunities
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| name | string(128) | ✓ | |
| accountId | string | ✓ | |
| primaryContactId | string? | | |
| pipelineId | string | ✓ | |
| stageId | string | ✓ | |
| amount | decimal(18,2) | ✓ | 默认 0 |
| winRate | int | ✓ | 随阶段默认，可改 |
| expectedCloseDate | date | ✓ | |
| ownerId | string | ✓ | |
| departmentId | string? | | |
| source | string(64)? | | |
| competitor | string(128)? | | |
| nextStep | string(255)? | | |
| nextFollowAt | timestamptz? | | |
| closeReason | string(128)? | | |
| description | text? | | |
| actualCloseDate | date? | | |
| leadId | string? | | 溯源 |
| campaignId | string? | | |

### opportunity_members
`opportunityId, userId, role: COLLABORATOR|INFLUENCER`

### opportunity_stage_histories
`opportunityId, fromStageId, toStageId, fromWinRate, toWinRate, changedById, changedAt, note`

---

## 4.5 活动 M05

### activities
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| type | enum: TASK/VISIT/CALL/EMAIL/NOTE | ✓ | |
| subject | string(128) | ✓ | |
| status | enum: PLANNED/DONE/CANCELED | ✓ | |
| startAt / endAt / dueAt | timestamptz? | | |
| entityType | enum: LEAD/ACCOUNT/CONTACT/OPPORTUNITY/TICKET | ✓ | |
| entityId | string | ✓ | |
| ownerId | string | ✓ | |
| content | text? | | |
| location | string(255)? | | |
| checkInLat / checkInLng | decimal(10,7)? | | |
| checkInAt | timestamptz? | | |
| checkInAddress | string? | | |
| remindAt | timestamptz? | | |
| source | enum: MANUAL/AI/API | ✓ | 默认 MANUAL |

---

## 4.6 产品与报价 M06

### products
`code(唯一), name, category, unit, description, isActive, standardPrice, cost?, taxRate`

### product_prices
`productId, priceBookName, unitPrice, currency, validFrom, validTo`

### quotes
| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| quoteNo | string(32) | ✓ | QT+yyyymmdd+seq |
| opportunityId | string? | | |
| accountId | string | ✓ | |
| subject | string(128) | ✓ | |
| status | enum QuoteStatus | ✓ | DRAFT |
| currency | string(8) | ✓ | CNY |
| subtotal / discountAmount / taxAmount / total | decimal | ✓ | |
| validUntil | date? | | |
| terms / remark | text? | | |
| ownerId | string | ✓ | |
| approvedAt | timestamptz? | | |

### quote_lines
`quoteId, productId, name, qty, unitPrice, discountRate, amount, sortOrder, remark`

---

## 4.7 合同与回款 M07

### contracts
`contractNo(HT+seq), title, accountId, opportunityId?, quoteId?, status, signDate?, effectiveDate?, expireDate?, total, receivedAmount, currency, ownerId, terms?, remark?, fileAttachmentId?`

### contract_lines
同 quote_lines，外键 `contractId`。

### payment_plans
`contractId, seq, dueDate, amount, receivedAmount, status: PENDING|PARTIAL|PAID|OVERDUE, remark?`

### payments
`paymentNo(SK+seq), contractId, paymentPlanId?, amount, paidAt, method: BANK|CHECK|ALIPAY|WECHAT|OTHER, status, bankAccount?, voucherNo?, remark?, confirmedById?, confirmedAt?`

---

## 4.8 服务 M08

### tickets
`ticketNo(GD+seq), title, accountId, contactId?, opportunityId?, type: ISSUE|QUESTION|REQUEST|BUG, severity: LOW|MEDIUM|HIGH|URGENT, status, ownerId, dueAt?, resolvedAt?, resolution?, satisfaction?`

### ticket_logs
`ticketId, fromStatus, toStatus, note, userId, at`

---

## 4.9 营销 M09

### campaigns
`name, type: WEBINAR|EXHIBITION|EMAIL|ADS|OTHER, status: PLANNED|ACTIVE|FINISHED, startAt?, endAt?, budget?, ownerId, description?`

### forms / form_submissions
`campaignId?, name, fields jsonb, isActive, submitRedirect`；提交 `data jsonb, leadId?`

---

## 4.10 报表 M10

### report_defs
`code, name, module, definition jsonb, ownerId, isShared`

### goals
`userId|teamId, periodType: MONTH|QUARTER|YEAR, periodKey, metric: REVENUE|NEW_OPP|WON_AMOUNT, targetAmount`

---

## 4.11 审批 M11

### approval_definitions
`code, name, entityType, rules jsonb, isActive`

### approval_instances
`definitionId, entityType, entityId, status, currentStep, applicantId, snapshot jsonb, startedAt, finishedAt`

### approval_steps
`instanceId, stepIndex, approverId, action, comment, actedAt`

---

## 4.12 平台 M12

### webhooks / webhook_deliveries
`url, secret, events jsonb, isActive`；投递记录含 payload 与结果

### api_tokens
`name, tokenHash, scopes jsonb, expiresAt, lastUsedAt`

### attachments
`entityType, entityId, fileName, mimeType, size, storageKey, createdById`

---

## 4.13 枚举权威定义

见 `packages/shared/src/enums/`，必须包含：

```ts
export enum LeadStatus {
  NEW = 'NEW', ACCEPTED = 'ACCEPTED', CULTIVATING = 'CULTIVATING',
  CONVERTED = 'CONVERTED', CLOSED_LOST = 'CLOSED_LOST',
}
export enum QuoteStatus {
  DRAFT = 'DRAFT', SUBMITTED = 'SUBMITTED', APPROVED = 'APPROVED',
  SENT = 'SENT', ACCEPTED = 'ACCEPTED', REJECTED = 'REJECTED',
}
export enum ContractStatus {
  DRAFT = 'DRAFT', APPROVING = 'APPROVING', EFFECTIVE = 'EFFECTIVE',
  FINISHED = 'FINISHED', TERMINATED = 'TERMINATED', REJECTED = 'REJECTED',
}
export enum PaymentStatus {
  DRAFT = 'DRAFT', SUBMITTED = 'SUBMITTED', CONFIRMED = 'CONFIRMED',
  RECONCILED = 'RECONCILED', REJECTED = 'REJECTED',
}
export enum TicketStatus {
  NEW = 'NEW', PROCESSING = 'PROCESSING', WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  RESOLVED = 'RESOLVED', CLOSED = 'CLOSED',
}
export enum ActivityType { TASK='TASK', VISIT='VISIT', CALL='CALL', EMAIL='EMAIL', NOTE='NOTE' }
export enum DataScope { SELF='SELF', TEAM='TEAM', DEPARTMENT='DEPARTMENT', ALL='ALL', CUSTOM='CUSTOM' }
```
