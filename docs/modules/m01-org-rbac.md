# M01 组织与权限

## 1. 目标
账号体系、部门树、角色权限、数据范围、租户设置、审计。

**非目标：** SSO/LDAP、复杂组织编制、职级体系。

## 2. 权限点
```
org:user:read / write / delete
org:department:read / write
org:role:read / write
org:setting:read / write
audit:read
```

## 3. 用例
- 管理员创建用户并授予 `SALES_REP`，用户可登录。
- 修改角色权限后，服务端每次请求校验生效。
- 禁用用户后登录/鉴权失败 40100。
- 删除用户：软删；历史单据显示姓名冗余或快照。

## 4. API
见 `05-api-conventions.md` §3.1。

## 5. 业务规则
1. 部门删除：有下级或有用户则 42200。
2. 角色 `isSystem=true` 不可删、不可改 code。
3. 最后一名 `SUPER_ADMIN` 不可禁用/删除。
4. `dataScope` 默认 `SELF`；种子：`SALES_MANAGER=TEAM`，`SUPER_ADMIN=ALL`。
5. 密码最短 8 位，含字母与数字。

## 6. UI 要点
- 用户列表：姓名、邮箱、部门、角色、状态、最近登录。
- 角色编辑：权限点按模块分组 Checkbox。
- 部门：树 + CRUD。

## 7. 测试清单
- [ ] 登录成功/错误密码/禁用
- [ ] refresh 过期
- [ ] 权限点校验 40300
- [ ] 部门树 path 更新
- [ ] 最后管理员保护

## 8. 依赖
无（底座）。
