# M10 报表与驾驶舱

## 1. 目标
漏斗、人效、回款趋势、目标达成；CSV 导出；工作台组装。

**非目标：** 自助 BI、复杂数据集建模。

## 2. 权限点
```
report:read
goal:read / write
```

## 3. 用例
- 经理看本团队漏斗与人效。
- 管理层看回款趋势与目标达成。
- 导出当前报表 CSV。

## 4. API
见 `05-api-conventions.md` §3.10。  
导出：`GET /reports/{code}?export=csv&...筛选`  
均受数据权限约束（非 ALL 仅本人/团队数据）。

## 5. 业务规则

### sales-funnel
按当前开放商机 `stageId` 分组：`count, sum(amount), sum(amount*winRate/100)`，按阶段 sortOrder。

### owner-performance
维度 `ownerId`：`newLeads, oppCount, wonAmount, receivedAmount, openAmount`；时间窗 query `from,to`。

### revenue-trend
按月：`confirmedAmount, reconciledAmount`；默认近 12 月。

### goal-attainment
读 `goals` + 实绩（WON_AMOUNT 用 `actualCloseDate` 在周期内的 won 金额；REVENUE 用 confirmed 回款）。返回 `target, actual, rate`。

## 6. UI 要点
- 漏斗图；趋势折线；人效表格+简单条形。
- 驾驶舱卡片可固定排序（MVP 静态）。

## 7. 测试清单
- [ ] 漏斗与商机表一致
- [ ] 数据权限裁剪
- [ ] 目标达成计算
- [ ] CSV 头与行数

## 8. 依赖
M02–M07 只读。业绩归属规则见 `13-spec-supplements.md` §3.2。
