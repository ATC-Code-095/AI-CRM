# M09 营销获客

## 1. 目标
市场活动、公开表单获客、线索来源归因、简易打分。

**非目标：** 完整 MA（邮件旅程/多触点归因）。

## 2. 权限点
```
campaign:read / write / delete
form:read / write
# POST /forms/:id/submit 公开
```

## 3. 用例
- 创建活动与表单。
- 匿名访客提交表单，自动产生线索并关联活动。
- 按活动统计线索数/转化数（报表读接口）。

## 4. API
见 `05-api-conventions.md` §3.9。

## 5. 业务规则
1. 提交映射：表单字段 `name/contactName/phone/email/company` 等写入 Lead；`source=WEB_FORM`，`campaignId` 取表单归属。
2. 提交成功返回 `{ok:true}`，不回传 leadId 给匿名用户。
3. 限流：同 IP 60s 内 5 次 → 42900。
4. `isActive=false` 的表单提交 → 40400。
5. 提交原始数据入 `form_submissions`。

## 6. UI 要点
- 活动列表：线索数、商机数、赢单金额。
- 表单配置：字段数组编辑（MVP 固定模板字段开关即可）。

## 7. 测试清单
- [ ] 公开提交建 Lead
- [ ] 限流
- [ ] 停用表单
- [ ] campaign 归因字段

## 8. 依赖
M02。
