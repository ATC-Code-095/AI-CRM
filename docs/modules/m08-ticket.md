# M08 客户服务

## 1. 目标
工单创建、流转、解决、关闭；关联客户与联系人；满意度。

**非目标：** 呼叫中心、知识库全文检索（仅占位）。

## 2. 权限点
```
ticket:read / write / delete / transition
```

## 3. 用例
- 客户成功/销售代建工单。
- 客服处理并更新状态。
- 解决后邀请满意度评分。

## 4. API
CRUD + `POST /tickets/:id/transition` `{toStatus, note?}`。

## 5. 业务规则
1. 状态机见 `03-domain-model.md`。
2. `ticketNo`：`GD` + 4 位日序列。
3. `severity=URGENT` 可配置通知负责人上级（M4 后）。
4. `RESOLVED` 必填 `resolution`。
5. `satisfaction` 仅 CLOSED 或 RESOLVED 后可填 1–5。
6. 列表默认按 `severity desc, createdAt desc`。
7. `dueAt` 按 severity 解决目标：URGENT 8h / HIGH 24h / MEDIUM 72h / LOW 7d（补遗 §3.4）。

## 6. UI 要点
- 工单列表紧急度 Tag。
- 详情右侧状态操作按钮随状态机显示。
- 客户 360 工单 Tab。

## 7. 测试清单
- [ ] 状态机 transition
- [ ] RESOLVED 必填 resolution
- [ ] 满意度写入条件
- [ ] 数据权限

## 8. 依赖
M03。
