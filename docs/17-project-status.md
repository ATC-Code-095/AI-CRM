# 项目完成度快照（2026-10-22）

## 测试规模
| 套件 | 数量 |
|------|------|
| apps/api vitest（单测+集成） | 31 文件 / 130 用例 |
| apps/web vitest（字典/RTL/手册链接） | 5 文件 / 16 用例 |
| Playwright（桌面+移动） | 13 |
| 契约 | openapi 341 paths · i18n 2483 keys |
| ESLint（api + web） | 0 error / 0 warning（`--max-warnings 0`，CI 已接入） |

> 集成测试需先启动 API（`API_URL`，默认 `http://127.0.0.1:3001`），否则报 ECONNREFUSED；测试文件按顺序执行（约 11 秒）；需以 `LOGIN_RATE_LIMIT=100` 启动，否则登录限流（默认 20/分钟）会让后面的文件报 429。测试数据会写入 `.env` 指向的数据库。

## 已交付模块
- F01–F14 P0 全量 + F15–F21 P1 主体（工单/营销/Webhook/自定义字段/AI/通知/推送占位）
- 范围变更（2026-10-21，见 `12-locked-decisions.md`）：销售佣金管理中心、集团财务模块
- 近期增强：合同签署进度图与移动端签署页、发票三方对账、NPS 闭环、客户决策链、跟进计划（Cadence）、阶段门禁校验
- 2026-10-22：中英文界面（F12）、帮助中心与用户 / 管理员手册、报价与合同金额两级审批（禁止自审）、线索按规则只分给销售、管理员重置密码、业务参数全部生效

## 数据迁移
- settings JSON 业务单据 → 正式表：阶段 1–6 已完成（集团财务、合同/报价单据、模板与知识、客户成功与营销、报表与商机记录、收口）
- Prisma 迁移 9 个，远程库已全部应用（`20261022100000_sales_read_permissions` 于 2026-10-22 应用）

## 非功能
- 安全：RBAC、数据权限、share、限流头、安全响应头、Webhook 验签、幂等
- 可观测：审计 Diff、request-id、health(db/redis)
- 前端性能：除登录页外全部路由懒加载，antd 按页面拆分，英文词典按需加载；首屏 JS 约 432 kB gzip（中文）/ 470 kB（英文）
- 工程：Makefile、CI（typecheck + lint + 测试 + 契约）、备份/恢复、OpenAPI 导出、PWA、i18n 检查、部署脚本预检与自动回滚
- 移动：响应式 IA + PWA 可用；原生 App 代码侧已准备（接口地址可配置、一键同步脚本、Android 工程已生成），待在 Android Studio / Xcode / DevEco 中打包验证

## 已知待改进
- ESLint 暂未约束 `any`（存量代码大量使用）
- 英文界面中仍有部分中文：系统预置的销售阶段名称、接口生成的文本（客户阶段计数、账龄分组、下一步建议等）；帮助中心手册仅有中文版
- 集成测试写入 `.env` 指向的共享库，测试数据混入业务数据；需准备独立测试库

## 待环境具备时
- 真机 iOS/Android/鸿蒙包上架
- 真实 LLM API Key（AI_PROVIDER=http）
- APNs/FCM/Push Kit 证书
