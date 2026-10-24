# M07 合同与回款

## 1. 目标
合同主数据与行项目、回款计划、回款单确认与核销、附件。

## 2. 权限点
```
contract:read / write / delete / effective / finish
payment:read / write / confirm / reconcile
```

## 3. 用例
- 从报价生成合同草稿并补充签署信息。
- 维护分期回款计划。
- 财务录入回款并确认。
- 核销到计划期次，更新累计。

## 4. API
见 `05-api-conventions.md` §3.7。

## 5. 业务规则
1. `contractNo`：`HT` + yyyymmdd + 4 位日序列。
2. 状态机见 `03-domain-model.md`。
3. `effective`：必填 `signDate/effectiveDate`；status 从 APPROVING 或 DRAFT（无审批时）进入 EFFECTIVE。
4. `finish`：仅 EFFECTIVE；校验 `receivedAmount` 可不等于 total，但提示差额。
5. 回款计划：`PUT /contracts/:id/plans` 全量覆盖；计划 `amount` 合计应 ≤ 合同 total（> 时 42200）。
6. Payment：
   - `confirm`：DRAFT|SUBMITTED → CONFIRMED，写 `confirmedById/At`
   - `reconcile`：CONFIRMED → RECONCILED；增加 `paymentPlan.receivedAmount` 与 `contract.receivedAmount`；计划状态自动：0→PENDING，不足→PARTIAL，达到→PAID，到期未足→OVERDUE（定时任务或查询计算）
7. 核销必须事务；重复核销同一 payment → 40900；写接口支持 `Idempotency-Key`（补遗 §2）。
8. 更新合同/回款携带 `version` 乐观锁。
9. 超过合同 `total` 的确认回款默认拒绝 42200（MVP 拒绝预收超额）。

## 6. UI 要点
- 合同详情：行项目、计划表、回款列表、差额徽章。
- 回款录入 Modal；核销选择期次。
- 附件上传扫描件。

## 7. 测试清单
- [ ] 状态机 effective/finish
- [ ] 计划合计约束
- [ ] 核销事务与累计
- [ ] 重复核销
- [ ] 编号生成

## 8. 依赖
M06/M11。
