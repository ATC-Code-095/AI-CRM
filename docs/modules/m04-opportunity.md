# M04 商机与销售过程

## 1. 目标
可配置管道、阶段推进、看板、赢率与预测、赢单输单。

## 2. 权限点
```
opportunity:read / write / delete / update_stage / close / forecast
pipeline:read / write
```

## 3. 用例
- 销售创建商机挂在客户下。
- 看板拖拽推进阶段并填写下一步。
- 输单填原因；赢单引导建合同。
- 经理查看加权预测。

## 4. API
见 `05-api-conventions.md` §3.4。  
`PATCH /opportunities/:id/stage` `{stageId, note?, winRate?}`  
`GET /opportunities/forecast?month=YYYY-MM` → 分桶加权金额。

## 5. 业务规则
1. 阶段必须属于本租户对应管道。
2. 进入 `requiredFields` 阶段时校验字段非空（如 PROPOSAL 要求存在报价）。
3. `winRate` 默认取阶段，可改 0–100。
4. WON 必须 `amount>0` 且有预计成交日；`actualCloseDate=今天`。
5. LOST 必填 `closeReason`。
6. 每次 stage 变更写历史表。
7. 预测：`weightedAmount = amount * winRate / 100`，按 `expectedCloseDate` 月分桶。
8. WON 不可删；非 WON 可软删。

## 6. UI 要点
- 桌面（≥768）：看板拖拽 → 确认抽屉 → 成功提示。
- 手机（<768）：阶段筛选 + 卡片列表，用操作菜单改阶段（不做拖拽）。
- 逾期 `nextFollowAt` 红点。
- 看板/列表切换；金额与日期按 locale 格式化。

## 7. 测试清单
- [ ] 阶段状态与历史
- [ ] requiredFields
- [ ] WON/LOST 规则
- [ ] 预测汇总
- [ ] 看板分组 shape

## 8. 依赖
M03；下游 M06/M07。
