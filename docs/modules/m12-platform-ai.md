# M12 平台与 AI

## 1. 目标
Webhook、API Token、文件附件、自定义字段（P1）、AI 助手能力（P1）。

## 2. 权限点
```
platform:webhook:read / write
platform:token:read / write
file:upload / download
ai:assist
field_definition:read / write
```

## 3. 用例
- 管理员配置订单/回款 Webhook。
- 创建 API Token 供外部写入线索。
- AI 生成跟进摘要与下一步建议。

## 4. API
- Webhooks/Tokens CRUD
- `POST /files` multipart；`GET /files/:id`
- `POST /ai/summarize` `{entityType, entityId}`
- `POST /ai/suggest-next` `{opportunityId}`
- `POST /ai/risk` `{opportunityId}`

## 5. 业务规则
1. Webhook 事件白名单：`lead.created`, `opportunity.won`, `payment.confirmed`, `contract.signed`。
2. 投递：BullMQ 重试 3 次；HMAC-SHA256 签名头 `X-AI-CRM-Signature`。
3. API Token：明文仅创建时返回一次；哈希存储；scope 前缀匹配权限点。
4. 附件大小 ≤ 10MB；mime 白名单（pdf/png/jpeg）。
5. **AI 适配层：** `AiPort` 接口；实现 `MockAiAdapter`（开发默认）与 `HttpAiAdapter`（env `AI_API_KEY`）。功能可开关 `settings.ai_enabled`。
6. AI 输出必须落库可审计（`ai_suggestions`: entityType, entityId, type, content, model, at）。
7. AI 不得自动改状态；只给建议人工确认。

## 6. UI 要点
- 平台设置页：Webhook 列表、Token 管理。
- 商机详情「AI 助手」抽屉：摘要/建议/风险三条，可复制。

## 7. 测试清单
- [ ] Webhook 签名与重试
- [ ] Token 鉴权与 scope
- [ ] 文件大小/类型拒绝
- [ ] Mock AI 可关闭
- [ ] 建议落库

## 8. 依赖
全模块；AI 为增强不阻塞主链路。
