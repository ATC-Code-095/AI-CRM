# M03 客户与联系人

## 1. 目标
客户主数据、联系人、客户 360、协作共享、时间线。

## 2. 权限点
```
account:read / write / delete / share
contact:read / write / delete
```

## 3. 用例
- 创建客户并添加主联系人。
- 经理共享客户给协作同事（可编辑/只读）。
- 打开 360 查看商机/合同/回款/工单/时间线。

## 4. API
标准 CRUD；`GET /accounts/:id/overview`；`GET /accounts/:id/timeline`；`POST /accounts/:id/share`。

## 5. 业务规则
1. 同客户仅一条 `isPrimary=true`（更新时自动取消其他）。
2. 删除客户：有未关闭商机或未完结合同 → 42200。
3. `parentAccountId` 不可成环。
4. 360 metrics：
   - `totalContract` = EFFECTIVE+FINISHED 合同 total 之和
   - `totalReceived` = 已确认回款之和
   - `openOppAmount` = 未关闭商机 amount 之和
5. 时间线合并 activities + stage_histories + approvals + payments，按 at desc 分页。

## 6. UI 要点
- 列表列：名称、等级、负责人、阶段、最近跟进、开放商机金额。
- 360 指标卡 + Tab。
- 时间线图标区分类型。

## 7. 测试清单
- [ ] 主联系人唯一
- [ ] 删除保护
- [ ] 父子环检测
- [ ] share 后数据权限
- [ ] metrics 正确

## 8. 依赖
M01/M02。
