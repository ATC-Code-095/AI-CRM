# 上线检查清单

## 1. 配置
- [x] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 为强随机，非 dev 值
- [x] `DATABASE_URL` 指向生产 PG，用户最小权限
- [x] `REDIS_URL` 带密码（如需）
- [x] `CORS_ORIGIN` 仅生产域名
- [x] `AUTO_SEED=false`（生产禁止自动种子）
- [x] `FILE_STORAGE_DIR` 为持久卷

## 2. 数据库
- [ ] `prisma migrate deploy` 成功
- [ ] 备份策略（每日 pg_dump）
- [ ] 连接池与 `max_connections` 评估

## 3. 安全
- [ ] HTTPS 终结（反代/SLB）
- [ ] 安全响应头（应用已加 nosniff 等）
- [ ] 登录限流 5/min（已实现）
- [ ] 密钥不进 Git（`.env` 不提交）
- [ ] 附件类型/大小限制（已实现）

## 4. 可观测
- [ ] `/health` 探活含 db/redis
- [ ] `x-request-id` 贯穿日志
- [ ] 错误日志采集

## 5. 发布
- [ ] `node scripts/export-openapi.mjs` 更新 `docs/openapi.json`
- [ ] `bash scripts/smoke.sh` 通过
- [ ] `pnpm exec playwright test` 通过
- [ ] `scripts/perf.sh` 基线记录（参考：列表 API ~15ms avg / 30 次）
- [ ] CI 绿（`.github/workflows/ci.yml`）
- [ ] `bash scripts/backup-db.sh` 验证备份可恢复

## 6. 业务验收
- [ ] 演示主链路（线索→回款）
- [ ] 中英文切换
- [ ] 移动 390 宽度底部 Tab

## 7. 回滚
- [ ] 镜像版本号可回退
- [ ] 迁移兼容（先扩后缩）
