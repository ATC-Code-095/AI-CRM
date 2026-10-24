# 开发完成清单（代码侧）

> 环境依赖项单独列出；代码侧未完成项应为空。

## P0 F01–F14
- [x] F01 登录鉴权 JWT
- [x] F02 组织权限 RBAC + 数据范围
- [x] F03 多租户隔离
- [x] F04 线索 CRUD/分配/转化/关闭
- [x] F05 客户联系人 360
- [x] F06 商机管道看板/预测/赢输
- [x] F07 活动跟进打卡
- [x] F08 产品报价折扣审批
- [x] F09 合同回款核销
- [x] F10 审批流
- [x] F11 报表驾驶舱
- [x] F12 中英 i18n
- [x] F13 移动 IA + 三端文档/壳骨架
- [x] F14 平台基础（API/审计/种子/附件）

## P1 F15–F21
- [x] F15 工单
- [x] F16 营销表单获客
- [x] F17 Webhook + **API Token 管理** + ingress
- [x] F18 自定义字段定义 + customValues 存储（客户/线索/商机）
- [x] F19 AI Mock/HTTP 网关
- [x] F20 站内通知
- [x] F21 推送占位（真实通道待密钥）

## 质量
- [x] vitest API 130（31 文件，集成测试需启动 API，`LOGIN_RATE_LIMIT=100`）
- [x] Web 字典/RTL/手册链接 16
- [x] Playwright 13（含移动/导入/报价/客户分享页/集团报表）
- [x] ESLint api + web 零告警（CI 门禁）
- [x] smoke / perf / check-i18n / check-openapi

## 自定义与收尾
- [x] customValues 存储与客户/线索详情录入 UI
- [x] 演示自定义字段种子（行业编码/预算区间/竞品备注）
- [x] 线索分配 → PushService 通知
- [x] seed 旧入口废弃说明
- [x] CI 契约双检（openapi + i18n）

## 环境依赖（代码已备、需外部条件）
- [x] 部署到测试服务器（API 容器 + 静态站点）
- [x] 远程 smoke.sh 通过
- [ ] iOS/Android/鸿蒙真机包与商店（需证书/DevEco/Xcode）
- [ ] 真实 LLM API Key（可选，Mock 已可用）
- [ ] APNs/FCM/Push Kit 证书（可选，站内通知已可用）
