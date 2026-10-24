# M11 流程与审批

## 1. 目标
可配置审批定义、实例生命周期、审批中心、与报价/合同联动、简单通知。

**非目标：** 可视化流程设计器、会签/或签复杂矩阵（MVP 单级/两级固定）。

## 2. 权限点
```
approval:read / approve / reject / cancel / define
```

## 3. 用例
- 超折扣报价提交自动创建审批。
- 审批人待办处理同意/驳回。
- 申请人撤回。

## 4. API
见 `05-api-conventions.md` §3.11。

## 5. 业务规则
1. **触发配置（seed）：**
   - `QUOTE_DISCOUNT`：quote 折扣超阈 → 审批人=申请人 `managerId`，再上级（两级）
   - `CONTRACT_AMOUNT`：合同 total ≥ 100000 → manager
2. 实例创建后业务单据进入待审状态（Quote SUBMITTED / Contract APPROVING）。
3. 每步 `approve` 进入下一步；最后一步通过 → instance APPROVED，回调业务状态（Quote APPROVED / Contract 可 effective）。
4. `reject` → instance REJECTED，业务单据 REJECTED/DRAFT，必填 comment。
5. `cancel` 仅申请人且 status=PENDING。
6. 非当前步 approver 操作 → 40300。
7. 通知：`notifications` 表写入（`userId, type, title, entityType, entityId, isRead`）。

## 6. UI 要点
- 审批中心三 Tab。
- 步骤时间轴（待审/同意/驳回）。
- 业务快照只读卡片。

## 7. 测试清单
- [ ] 触发创建
- [ ] 两级流转
- [ ] 驳回回滚业务状态
- [ ] 越权审批 40300
- [ ] 撤回

## 8. 依赖
M06/M07；通知供顶栏。
