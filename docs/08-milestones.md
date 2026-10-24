# 08 里程碑与任务切片

> 勾选表示达到 DoD。AI 一次只推进一个里程碑内的 1–2 个切片。

---

## M0 工程底座（Week 0–0.5）

> 语言/库/功能范围以 `12-locked-decisions.md` 为准。

| 状态 | 任务 | 产出 |
|------|------|------|
| [ ] | 仓库初始化 monorepo + TS + lint | 空应用可起 |
| [ ] | Docker Compose pg+redis | 本地一键起 |
| [ ] | Prisma 骨架 + User/Department/Role（含 locale/timezone） | 迁移可跑 |
| [ ] | Auth 登录/JWT/刷新/Me | 接口测试过 |
| [ ] | RBAC Guard + 权限点种子 | 无权限 403 |
| [ ] | 租户隔离中间件 | 跨租户测试过 |
| [ ] | 统一响应/错误/日志/健康检查 | |
| [ ] | **i18n 底座**：i18next、zh-CN/en-US、antd locale、Intl 封装 | 可切换语言 |
| [ ] | Web 壳：登录、桌面侧栏 + **移动底部 Tab**、路由守卫 | 375 可用 |
| [ ] | PWA manifest + 离线壳 | 可添加到主屏 |
| [ ] | CI 脚本：lint+tsc+test | |

**出口：** 中/英可切换登录；手机宽度可进入主壳；创建用户并用新账号登录。

---

## M0.5 三端壳（Week 0.5–1）

| 状态 | 任务 |
|------|------|
| [ ] | Capacitor iOS / Android 工程 + 构建脚本 |
| [ ] | HarmonyOS ArkTS Web 壳 + rawfile 同步 |
| [ ] | `packages/mobile-bridge` + web 降级 |
| [ ] | 双语应用名/图标/启动页 |
| [ ] | 真机安装冒烟（三端各 1 次） |

**出口：** iOS / Android / 鸿蒙 均可安装并打开登录页。

---

## M1 客户主数据（Week 0.5–1.5）

| 状态 | 任务 |
|------|------|
| [ ] | Lead CRUD + 列表筛选 + 分配 |
| [ ] | Lead 状态机 + 关闭原因 |
| [ ] | Lead 转化向导 API + UI |
| [ ] | Account CRUD + 层级 |
| [ ] | Contact CRUD |
| [ ] | 数据权限行级过滤 |
| [ ] | Account 360 API（overview/timeline） |
| [ ] | Activity CRUD + 挂接 |
| [ ] | 管理端：用户/部门/角色 UI |

**出口：** 线索走到客户/联系人，并有跟进记录。

---

## M2 商机与管道（Week 1.5–2.5）⭐ 核心

| 状态 | 任务 |
|------|------|
| [ ] | Pipeline/Stage 模型与默认数据 |
| [ ] | Opportunity CRUD |
| [ ] | 阶段变更 API + 历史表 |
| [ ] | 看板拖拽 UI |
| [ ] | close-won / close-lost |
| [ ] | 协作成员 |
| [ ] | 工作台：待办 + 管道漏斗 |
| [ ] | 预测接口（按月加权金额） |

**出口：** 商机全生命周期；经理可看漏斗。

---

## M3 报价 合同 回款（Week 2.5–4）

| 状态 | 任务 |
|------|------|
| [ ] | Product/ProductPrice |
| [ ] | Quote + Lines + 金额计算 |
| [ ] | Quote 状态机 + 折扣阈值 |
| [ ] | Quote → Contract 转换 |
| [ ] | Contract + Lines |
| [ ] | PaymentPlan 批量维护 |
| [ ] | Payment + confirm + reconcile |
| [ ] | 财务列表与到期计划视图 |
| [ ] | 附件上传（合同扫描件） |

**出口：** 报价到回款核销闭环可演示。

---

## M4 审批与规则（Week 4–4.5）

| 状态 | 任务 |
|------|------|
| [ ] | Approval 定义（折扣/合同/大额） |
| [ ] | 实例创建/同意/驳回/撤回 |
| [ ] | 审批中心 UI |
| [ ] | 与 Quote/Contract 联动 |
| [ ] | 站内通知（铃铛数字） |

**出口：** 超阈值折扣自动进审批，通过后才能发送报价。

---

## M5 报表与目标（Week 4.5–5.5）

| 状态 | 任务 |
|------|------|
| [ ] | 销售漏斗报表 |
| [ ] | 人效对比 |
| [ ] | 回款趋势 |
| [ ] | 目标管理 + 达成率 |
| [ ] | 驾驶舱首页组装 |
| [ ] | 导出 CSV |

**出口：** 管理层一页看清管道与回款。

---

## M6 服务 营销 平台 AI（Week 5.5–7）

| 状态 | 任务 |
|------|------|
| [ ] | Ticket 全流程 |
| [ ] | Campaign + 公开表单 → Lead |
| [ ] | Webhook + API Token |
| [ ] | 自定义字段 FieldMeta |
| [ ] | AI：跟进摘要、下一步建议、输单风险（LLM 适配层可 mock） |
| [ ] | 拜访打卡移动优化（GPS + 手工地址降级） |
| [ ] | Playwright 冒烟 E2E（含 390 宽度与 en-US） |
| [ ] | 性能与安全自检 |

**出口：** MVP 可对外试点。

---

## 进度记录

| 日期 | 切片 | 说明 |
|------|------|------|
| 2026-09-22 | 规格与骨架 | 文档冻结 + schema.prisma + shared 枚举/权限/金额 + zh/en 词典 + docker/env |

### 已落地文件（非完整应用）

- `apps/api/prisma/schema.prisma`
- `packages/shared/src/{enums,errors,money,constants}`
- `apps/web/src/locales/{zh-CN,en-US}.json`
- `docker-compose.yml` / `.env.example` / `package.json` / `pnpm-workspace.yaml`
- 下一步：Nest/Vite 应用壳 + Auth + Migrate/Seed
