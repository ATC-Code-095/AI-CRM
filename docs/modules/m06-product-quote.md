# M06 产品与报价

## 1. 目标
产品目录与价目、报价单与行项目、折扣阈值、生成合同。

## 2. 权限点
```
product:read / write / delete
quote:read / write / delete / submit / send / accept
```

## 3. 用例
- 运营维护产品与标准价。
- 销售从商机生成报价，添加产品行，算合计。
- 超折扣提交后进入审批。
- 审批通过后发送并标记客户接受，一键生成合同草稿。

## 4. API
见 `05-api-conventions.md` §3.6。  
`PUT /quotes/:id/lines` 全量覆盖行并重算金额。

## 5. 业务规则
1. 金额公式见 `03-domain-model.md` §5。
2. 行 `discountRate` 任一 `> settings.discount_approval_threshold`（默认 0.2）则 `submit` 创建审批实例，状态 SUBMITTED，禁止 `accept`。
3. 无超阈折扣：`submit` 直接到 APPROVED（或跳过审批，status→APPROVED）。
4. 状态机：见 Quote.status；非法 40900。
5. `quoteNo` 租户内连续生成：`QTyyyyMMDD` + 4 位日序列。
6. `to-contract` 仅 `ACCEPTED`；复制行到合同，合同 status=DRAFT，关联合同/商机/客户。
7. 产品 `isActive=false` 不可加入新报价行。

## 6. UI 要点
- 左产品搜索双击加入；右行编辑；底部合计 sticky。
- 超折扣顶部 Alert。
- 报价预览（P1 可打印样式）。

## 7. 测试清单
- [ ] 金额计算含折扣
- [ ] 阈值触发审批
- [ ] 状态机
- [ ] to-contract 复制完整性
- [ ] 编号唯一

## 8. 依赖
M04；产出给 M07/M11。
