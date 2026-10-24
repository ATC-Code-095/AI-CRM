# 07 开发规范

> 本仓库的开发流程、完成标准与代码约定。新功能、修复与重构都按本文件执行。

---

## 1. 开工前

1. 已读：`README.md`、`docs/12-locked-decisions.md`、`docs/13-spec-supplements.md`、`docs/01-tech-stack.md`、`docs/05-api-conventions.md`、`docs/10-i18n-mobile.md`、`docs/08-milestones.md`
2. `git status` 了解工作区；优先完成手上未完成的切片，不同时并行多个半成品模块
3. 任务拆到单个子任务 ≤ 2 小时工作量

---

## 2. 标准开发流程（每个功能切片）

```
A. 读规格 → 列出实体/接口/权限/状态机/验收点
B. 更新 packages/shared 类型与枚举（若有）
C. 写 Prisma 迁移（若需）
D. 写/更新测试
E. 实现后端（Controller → Service → Repository）
F. 实现前端（api → pages → components）
G. 跑测试 + lint
H. 对照完成标准自检，必要时改文档
I. 原子提交
```

**禁止** 先堆 UI 再补权限；**禁止** 带 TODO 的假接口进入提交。

---

## 3. 完成标准（每个切片）

- [ ] 需求 100% 覆盖规格，不额外扩展范围
- [ ] 权限点已注册并校验（功能 + 数据）
- [ ] 租户隔离已过滤
- [ ] 状态机非法转换返回 40900
- [ ] 列表分页/排序/筛选符合约定
- [ ] 金额用 Decimal/字符串
- [ ] 软删除过滤 `deletedAt: null`
- [ ] 写操作有审计日志
- [ ] 接口测试通过（正常路径 + ≥3 个异常路径）
- [ ] 关键 UI 路径可用
- [ ] OpenAPI 注解齐全
- [ ] 新增文案已进 zh-CN + en-US 词典（禁止硬编码）
- [ ] 移动断点（375/390）核心路径可用
- [ ] 无 `any` 逃逸、无密钥入库

---

## 4. 代码质量规则

| 规则 | 说明 |
|------|------|
| 类型 | `strict`；禁 `@ts-ignore`，确需使用须注释原因 |
| 校验 | 所有写接口使用 DTO 校验 |
| 事务 | 跨表写必须 `prisma.$transaction` |
| 幂等/锁 | 关键写接口 Idempotency-Key；主单 version 乐观锁（补遗 §2） |
| N+1 | 用 `include/select` 或批量预载 |
| 空值 | 明确抛 40400，禁止裸 TypeError |
| 密码/Token | 不入日志、不进响应、不写进脚本与文档，只经环境变量传入 |
| SQL | 不拼接 SQL |
| 组件 | 单文件 < 400 行 |
| 注释 | 只写非显而易见的原因 |
| Lint | `pnpm lint` 零告警（CI 门禁） |

---

## 5. 测试要求

### 后端（Vitest + Supertest）每个资源至少覆盖
1. 无 token → 40100
2. 无权限 → 40300
3. 创建成功
4. 列表分页结构
5. 详情不存在 → 40400
6. 状态机非法转换 → 40900
7. 跨租户不可见（第二个种子租户）

### 前端
- hooks / 纯函数单测
- Playwright 冒烟：登录 → 线索 → 转化 → 商机 → 赢单 → 合同

```bash
LOGIN_RATE_LIMIT=100 node apps/api/dist/main.js &   # 集成测试需运行中的 API
pnpm -C apps/api test
pnpm -C apps/web test
pnpm lint
pnpm typecheck
```

---

## 6. 种子数据

`apps/api/src/seed/`（`make seed` 或 `pnpm seed`）生成演示数据：

- 2 个租户；每个租户含部门树、6 个角色、8 个用户
- 标准管道 6 个阶段；产品 20、线索 30、客户 20、商机 15、活动 50
- 合同 5、回款 8、工单 6、审批 3

种子默认密码仅用于开发环境；上线环境必须修改（见 README「上线前安全检查」）。

---

## 7. 规格冲突时的优先级

0. **`docs/12-locked-decisions.md` + `docs/13-spec-supplements.md`**
1. 本文件 + `01-tech-stack` 硬约束
2. 状态机 / 权限 / 租户安全
3. API 约定
4. 模块规格
5. UI 规格 / `10` / `11` 移动规格
6. 产品对标描述

仍无法决策时：**先停下**，列出可选方案与产品负责人确认，不要凭猜测实现。

---

## 8. UI 开发注意

- 使用 Ant Design 现成组件，不自研表单引擎
- 看板拖拽：`@dnd-kit/core`；宽度 < 768 时看板降级为列表改阶段
- 图表：项目内 `components/SimpleCharts.tsx`，不引入第二套图表库
- 不引入第二套 UI 库
- 批量删除仅管理员可用
- **多语言（强制）**：所有用户可见文案进 `zh-CN` + `en-US` 词典；枚举用 `enum.*` key。组件内外都可 `import { t } from '…/i18n'`（切换语言会整页刷新，模块级常量里的 `t()` 也正确）；key 按模块命名（`leads.*`、`contracts.*`），跨模块复用的放 `common.*`；存库的选项值、模板占位符不要翻译，只翻译 `label`
- **格式化（强制）**：日期 / 数字 / 货币用 `Intl`，禁止手写日期或货币拼接
- **手机（强制）**：新页面须能在 375–390 宽度完成主路径；触控热区 ≥ 44px；平台差异走 `@ai-crm/mobile-bridge`，不在业务代码里散落平台分支
- 详见 `docs/10-i18n-mobile.md`

---

## 9. 文档同步

实现与文档不一致时，修改更正确的一方，并在提交说明中写「规格变更」。不允许长期存在两份互相矛盾的说明。
用户可见功能有变化时，同步更新 `docs/manual/` 下的用户手册或管理员手册。

---

## 10. 提交前

1. `pnpm lint && pnpm typecheck` 与测试全部通过
2. 更新 `docs/08-milestones.md` 进度
3. 未决问题写入 `docs/09-acceptance.md` §5
4. 用户可见变化记入 `CHANGELOG.md`「未发布」
