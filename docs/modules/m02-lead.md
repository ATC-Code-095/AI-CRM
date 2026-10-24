# M02 线索中心

## 1. 目标
线索录入、分配、培育、关闭、转化，提供统一「未验证商机」池。

**非目标：** 复杂 ML 评分训练、呼叫中心。

## 2. 权限点
```
lead:read / write / delete / assign / convert / close
```

## 3. 用例
- 运营/销售创建线索，默认 owner=创建人。
- 经理分配线索给销售。
- 销售跟进更新状态与下次跟进时间。
- 转化向导生成客户/联系人（及可选商机）。
- 无效线索关闭并填原因。

## 4. API
标准 CRUD + `convert` / `close` / `assign`。body 见 `05-api-conventions.md` §3.2。

## 5. 业务规则
1. 状态机见 `03-domain-model.md`。
2. `convert` 仅 `ACCEPTED | CULTIVATING`；成功后全局只读。
3. 同租户客户重名（trim + 忽略大小写）在 `create_account` 时 42200 + `data.conflicts`，除非 `forceCreate=true`。
4. `assign` 写审计。
5. 列表默认排序：`nextFollowAt asc nulls last, createdAt desc`。
6. `score` MVP：手机 +20，邮箱 +10，预算 +20，活动次数×5（上限 40），满分 100。
7. 自动分配 `lead.assign_rule`（MANUAL/ROUND_ROBIN/LOAD_BALANCE），见补遗 §3.1。

## 6. UI 要点
- 状态 Tag + 「今日需跟进」筛选。
- 转化 Modal 三步；重名警告可「仍要创建」。
- 详情右：最近活动、快速 NOTE。

## 7. 测试清单
- [ ] 转化原子性
- [ ] 重复客户冲突
- [ ] 状态机矩阵
- [ ] 数据权限
- [ ] score 计算

## 8. 依赖
M01；产出给 M03/M04。
