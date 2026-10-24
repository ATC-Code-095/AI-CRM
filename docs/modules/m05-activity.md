# M05 活动与跟进

## 1. 目标
任务/拜访/电话/邮件/备注，统一时间线，今日待办，拜访打卡。

## 2. 权限点
```
activity:read / write / delete / checkin
```

## 3. 用例
- 在线索/客户/商机详情快速创建跟进。
- 销售完成任务标记 DONE。
- 拜访打卡记录经纬度与地址。
- 工作台展示今日到期活动。

## 4. API
见 `05-api-conventions.md` §3.5。

## 5. 业务规则
1. 创建时必须挂 `entityType + entityId`；创建后校验该实体对当前用户可见。
2. `type=VISIT` 且打卡：需 `checkInLat/Lng`；服务端记录 `checkInAt=now`。
3. 完成任务：`status=DONE`，并更新父实体 `lastActivityAt`（Account/Lead）。
4. 仅 `PLANNED` 可取消（`CANCELED`）；`DONE` 不可删仅可备注追加（MVP 可编辑 content）。
5. 提醒：`remindAt` 到点进铃铛计数（读 `activities` where `remindAt` 落入今日且未完成）。

## 6. UI 要点
- 时间线卡片：类型图标、标题、时间、内容摘要、操作人。
- 今日待办列表可勾选完成。
- 打卡为移动主路径：GPS 优先，失败/拒绝定位则手工地址（必填其一）。
- `type=CALL` 在移动详情页对 phone/mobile 提供 `tel:` 快拨。
- 文案/日期走 i18n + Intl（见 `10-i18n-mobile.md`）。

## 7. 测试清单
- [ ] 挂接实体权限
- [ ] 打卡字段
- [ ] lastActivityAt 更新
- [ ] my-today 过滤
- [ ] 状态转换

## 8. 依赖
M02/M03/M04。
