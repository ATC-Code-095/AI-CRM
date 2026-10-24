# 智销 CRM

面向 B2B 销售团队的客户关系管理系统：线索 → 客户 → 商机 → 报价 → 合同 → 回款全流程，含审批、报表、客户服务、营销获客与集团多主体管理，支持桌面浏览器、手机 Web（PWA）与 iOS / Android / 鸿蒙客户端。

对标：**纷享销客 / 销售易**（连接型、过程型 CRM）与 **Salesforce / HubSpot / Pipedrive**（对象模型、管道可视化、营销一体）。

当前版本见 [CHANGELOG.md](CHANGELOG.md)。

---

## 使用手册

| 读者 | 手册 |
|------|------|
| 销售、销售经理、客服等日常使用者 | [docs/manual/user-manual.md](docs/manual/user-manual.md)（English: [docs/manual/en/user-manual.md](docs/manual/en/user-manual.md)） |
| 系统管理员 | [docs/manual/admin-manual.md](docs/manual/admin-manual.md)（English: [docs/manual/en/admin-manual.md](docs/manual/en/admin-manual.md)） |
| 部署 / 运维 | 本文 [部署](#部署) 一节 |

登录系统后，左侧菜单 **帮助中心** 也可直接查看上述手册（按界面语言显示中文或英文版）。

---

## 技术栈

- 业务代码全部 **TypeScript**：后端 NestJS + Prisma，前端 React + Vite + Ant Design
- 数据：**PostgreSQL** + Redis
- 移动端：Web 核心 + 原生壳（Capacitor / ArkTS）
- 仓库：pnpm monorepo（`apps/api`、`apps/web`、`apps/mobile`、`apps/harmony`、`packages/shared`、`packages/mobile-bridge`）

---

## 部署

系统由四部分组成：**Web 前端**（静态文件，由 nginx 提供）、**API**（Node.js，端口 3001）、**PostgreSQL**、**Redis**（可选，仅用于健康检查显示）。浏览器只访问 nginx，`/api/` 由 nginx 转发给 API，前后端同源，无需配置跨域。

```
浏览器 / 手机 App ──► nginx（静态网页 + /api/ 反向代理）──► API :3001 ──► PostgreSQL
                                                                    └──► Redis（可选）
```

两种部署方式任选其一：

| 方式 | 适合 | 需要 |
|------|------|------|
| [A. Docker Compose](#a-docker-compose推荐) | 试用、单机生产部署 | Docker 24+（含 Compose v2） |
| [B. 源码部署](#b-源码部署) | 已有 PostgreSQL / nginx，或不使用 Docker | Node.js 22、pnpm 9、PostgreSQL 16+、nginx |

服务器建议 2 核 4 GB 内存、20 GB 磁盘起步（构建前端时内存占用较高）。

### A. Docker Compose（推荐）

一条命令启动 PostgreSQL、Redis、API、Web 四个容器；API 容器每次启动会自动执行数据库迁移。

**1. 获取代码**

```bash
git clone <本仓库地址> ai-crm
cd ai-crm
```

**2. 填写配置**

```bash
cp .env.docker.example .env.docker
openssl rand -hex 32    # 执行三次，得到三个随机串
```

编辑 `.env.docker`，把三个随机串分别填入 `POSTGRES_PASSWORD`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`。首次部署保持 `AUTO_SEED=true`。`.env.docker` 已在 `.gitignore` 中，不要提交。

**3. 构建并启动**

```bash
export GIT_COMMIT=$(git rev-parse --short HEAD)   # 可选：页面与健康检查显示提交号
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps          # 四个服务均为 running / healthy
```

首次构建需下载依赖，约 5–10 分钟。

**4. 确认运行**

```bash
curl -s http://localhost:8080/api/v1/health
# {"code":0,"message":"ok","data":{"status":"ok","db":"up","redis":"up","version":"…","commit":"…"}}
```

首次启动会创建以下初始账号，并生成一个**随机初始密码**（所有初始账号相同），只在 API 日志中显示一次：

```bash
docker compose --env-file .env.docker logs api | grep 初始密码
```

浏览器打开 `http://<服务器地址>:8080`，用 `admin@demo.com` 和该密码登录：

| 账号 | 角色 | 租户 |
|------|------|------|
| `admin@demo.com` | 超级管理员 | 演示租户 |
| `manager@demo.com` / `rep@demo.com` / `finance@demo.com` | 销售经理 / 销售 / 财务 | 演示租户 |
| `admin@acme.com` / `rep@acme.com` | 超级管理员 / 销售 | 第二个租户（用于验证租户隔离） |

登录后**立即修改密码**（设置 → 修改密码），不用的账号在 平台管理 → 用户 中停用。也可以在首次启动前于 `.env.docker` 设置 `SEED_PASSWORD` 自行指定初始密码。日志中的初始密码只在账号首次创建时出现，之后重启不会再显示，也不会修改已有账号的密码。

**5. 关闭自动初始化**

登录确认无误后，把 `.env.docker` 中的 `AUTO_SEED` 改为 `false`，然后：

```bash
docker compose --env-file .env.docker up -d
```

`AUTO_SEED=true` 时每次启动都会补建缺失的初始账号（不会覆盖已改的密码）；正式使用时务必关闭。

**6. 生产环境还需要**

- **HTTPS**：在服务器前面加一层反向代理（nginx / Caddy / 云负载均衡）终止 TLS，转发到 `http://127.0.0.1:8080`；然后把 `CORS_ORIGIN` 改成对外的 `https://` 地址。手机 App（尤其 iOS）只能连 HTTPS。
- **防火墙**：对外只开放 80/443；API 的 3001 端口已只绑定在 `127.0.0.1`，数据库与 Redis 不对外暴露。
- 完成下文 [上线前安全检查](#上线前安全检查)。

**常用运维命令**

```bash
docker compose --env-file .env.docker logs -f api        # 查看 API 日志
docker compose --env-file .env.docker restart api        # 重启 API
docker compose --env-file .env.docker down               # 停止（数据保留在卷 pgdata / storage 中）
```

**升级到新版本**

```bash
docker compose --env-file .env.docker exec -T postgres pg_dump -U crm -Fc ai_crm > backup-$(date +%F).dump   # 先备份
git pull
export GIT_COMMIT=$(git rev-parse --short HEAD)
docker compose --env-file .env.docker up -d --build      # 新迁移在 API 启动时自动执行
curl -s http://localhost:8080/api/v1/health               # commit 应为新版本
```

### B. 源码部署

以 Ubuntu 22.04 / Debian 12 为例，其他 Linux 发行版命令略有差异。

**1. 安装依赖**

```bash
# Node.js 22（任选一种方式安装，例如 https://github.com/nodesource/distributions ）
node -v                      # v22.x
corepack enable              # 启用 pnpm（版本由 package.json 的 packageManager 指定）
sudo apt install -y nginx postgresql
```

**2. 创建数据库**

```bash
sudo -u postgres psql <<'SQL'
CREATE USER crm WITH PASSWORD '<数据库密码>';
CREATE DATABASE ai_crm OWNER crm;
SQL
```

**3. 获取代码并配置**

```bash
sudo mkdir -p /opt/ai-crm && sudo chown $USER /opt/ai-crm
git clone <本仓库地址> /opt/ai-crm
cd /opt/ai-crm
pnpm install --frozen-lockfile
cp .env.example apps/api/.env
```

编辑 `apps/api/.env`（API 与 Prisma 命令都从 `apps/api` 目录读取它）：

```ini
NODE_ENV=production
DATABASE_URL=postgresql://crm:<数据库密码>@127.0.0.1:5432/ai_crm
REDIS_URL=                                # 不用 Redis 可留空
JWT_ACCESS_SECRET=<openssl rand -hex 32 的结果>
JWT_REFRESH_SECRET=<另一个随机串>
CORS_ORIGIN=https://crm.example.com       # 对外访问地址
AUTO_SEED=false
FILE_STORAGE_DIR=/opt/ai-crm/storage
```

**4. 迁移数据库、构建、写入初始数据**

```bash
cd /opt/ai-crm/apps/api
pnpm exec prisma migrate deploy           # 创建全部表（空库约 10 秒）
pnpm exec prisma generate
pnpm build                                # 输出 apps/api/dist
node scripts/seed-cli.mjs                 # 写入角色、权限与初始账号，输出中的「初始密码」只显示这一次（可重复执行，不会重置已改的密码）

cd /opt/ai-crm
pnpm -C apps/web exec vite build          # 输出 apps/web/dist
```

**5. 用 systemd 运行 API**

创建 `/etc/systemd/system/ai-crm-api.service`：

```ini
[Unit]
Description=AI CRM API
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/ai-crm/apps/api
ExecStart=/usr/bin/node dist/main.js
Restart=always
User=www-data
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /opt/ai-crm/storage && sudo chown www-data /opt/ai-crm/storage
sudo systemctl daemon-reload
sudo systemctl enable --now ai-crm-api
curl -s http://127.0.0.1:3001/api/v1/health    # "status":"ok"
```

`node` 路径以 `which node` 为准；`User` 需能读取代码目录、写入 `FILE_STORAGE_DIR`。

**6. 配置 nginx**

创建 `/etc/nginx/sites-available/ai-crm`，然后 `sudo ln -s /etc/nginx/sites-available/ai-crm /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx`：

```nginx
server {
  listen 80;
  server_name crm.example.com;
  root /opt/ai-crm/apps/web/dist;
  index index.html;
  client_max_body_size 100m;                # 附件上传上限（系统设置 file.max_size_mb 最大 100）

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri $uri/ /index.html;       # 单页应用：刷新任意页面都返回 index.html
  }
}
```

HTTPS 可用 [Certbot](https://certbot.eff.org/)：`sudo certbot --nginx -d crm.example.com`。

浏览器打开站点，用 `admin@demo.com` 和第 4 步输出的初始密码登录，并立即修改密码。

**升级到新版本**

```bash
cd /opt/ai-crm
bash scripts/backup-db.sh                 # 先备份（需设置 DATABASE_URL，见下文）
git pull
pnpm install --frozen-lockfile
cd apps/api && pnpm exec prisma migrate deploy && pnpm exec prisma generate && pnpm build && cd ../..
pnpm -C apps/web exec vite build
sudo systemctl restart ai-crm-api
curl -s http://127.0.0.1:3001/api/v1/health   # version / commit 应为新版本
```

浏览器若仍显示旧页面，强制刷新一次即可（Service Worker 会在下次打开时更新）。

### 配置项

API 只从环境变量读取配置（源码部署写在 `apps/api/.env`，Docker 部署写在 `.env.docker`）。

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `DATABASE_URL` | 是 | — | PostgreSQL 连接串 |
| `JWT_ACCESS_SECRET` | 是 | `dev-access-change-me` | 访问令牌签名密钥。**未设置时使用公开的默认值，任何人都能伪造登录**，生产必须设置 |
| `JWT_REFRESH_SECRET` | 是 | `dev-refresh-change-me` | 刷新令牌签名密钥，同上 |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | 否 | `15m` / `7d` | 令牌有效期 |
| `PORT` | 否 | `3001` | API 端口 |
| `CORS_ORIGIN` | 否 | `http://localhost:5174,…` | 允许跨域的网页地址，逗号分隔；同源部署可不改。手机 App 来源已内置放行 |
| `REDIS_URL` | 否 | — | 仅用于健康检查显示 |
| `NODE_ENV` | 否 | — | 设为 `production` 时，初始账号使用随机密码（只在初始化日志中显示一次） |
| `AUTO_SEED` | 否 | `false` | `true` 时启动即写入角色、权限与初始账号，仅首次使用 |
| `SEED_PASSWORD` | 否 | — | 指定初始账号的密码（不打印）；不设置时生产环境随机生成 |
| `LOGIN_RATE_LIMIT` | 否 | `20` | 每个 IP 每分钟登录次数上限 |
| `FILE_STORAGE_DIR` | 否 | `./storage` | 附件存放目录，需持久化并纳入备份 |
| `SETTINGS_SECRET` | 建议 | 由 `JWT_ACCESS_SECRET` 派生 | 加密存库的第三方密钥（AI 接口密钥等）；设置后不要更换，否则需在系统设置里重新填写 |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 否 | — | 旧方式配置 AI 接口；推荐在 系统设置 → 开放平台 → AI 助手接口 中配置（支持 Claude 与 OpenAI 兼容接口） |
| `APNS_KEY` 或 `APNS_KEY_FILE`、`APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_BUNDLE_ID`、`APNS_PRODUCTION` | 否 | — | iOS 推送：Apple 开发者后台创建的 .p8 推送密钥（内容可用 `\n` 写成一行）、Key ID、Team ID、App 的 Bundle ID（默认 `com.itecent.crm`）；`APNS_PRODUCTION=true` 用正式环境 |
| `FCM_SERVICE_ACCOUNT` 或 `FCM_SERVICE_ACCOUNT_FILE` | 否 | — | Android 推送：Firebase 项目的服务账号 JSON（内容或文件路径） |
| `HMS_SERVICE_ACCOUNT` 或 `HMS_SERVICE_ACCOUNT_FILE` | 否 | — | 鸿蒙推送：华为 AppGallery Connect 服务账号密钥 JSON（内容或文件路径） |
| `GIT_COMMIT` | 否 | — | 构建时没有 git 信息时，用于显示提交号 |

报价审批阈值、线索分配规则、单号前缀、附件大小上限、默认语言等业务参数在系统内 **设置** 页面修改，见 [管理员手册](docs/manual/admin-manual.md)。

### 上线前安全检查

- [ ] `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET` 已设置为两个不同的随机串（≥ 32 位），不是 `dev-` 开头的默认值
- [ ] 初始账号已全部修改密码；不用的停用（平台管理 → 用户）
- [ ] 至少有**两个**超级管理员：申请人不能审批自己的单，只有一个超管时，它提交的超额报价 / 合同会因找不到审批人而无法提交
- [ ] `AUTO_SEED=false`
- [ ] 已启用 HTTPS，`CORS_ORIGIN` 为对外的 `https://` 地址
- [ ] 数据库、Redis、API 端口不对公网开放
- [ ] 数据库每日备份，附件目录一并备份，并做过一次恢复演练
- [ ] 不在生产库上运行测试（`pnpm test`、`pnpm test:e2e`、`scripts/smoke.sh` 都会写入数据）

### 备份与恢复

```bash
# 备份（保留 7 天）；本机无 pg_dump 时自动改用 docker compose 中的 postgres 容器
DATABASE_URL='postgresql://crm:<密码>@127.0.0.1:5432/ai_crm' OUT_DIR=/var/backups/ai-crm bash scripts/backup-db.sh

# 恢复演练：恢复到临时库 ai_crm_restore_test，不影响正式库
DATABASE_URL='<同上>' bash scripts/restore-db.sh /var/backups/ai-crm/ai_crm_<时间>.dump
```

正式恢复：先停 API，对当前库再备份一次，执行 `pg_restore --clean --if-exists -d "$DATABASE_URL" <备份文件>`，再启动 API。附件目录（`FILE_STORAGE_DIR` 或 Docker 卷 `storage`）需单独复制备份。

### 手机 App

App 内页面与网页是同一套代码，打包时指定后端地址：

```bash
VITE_API_BASE=https://crm.example.com bash scripts/sync-mobile.sh
```

然后用 Android Studio（`apps/mobile/android`）或 Xcode 打包。详见 [docs/18-mobile-build.md](docs/18-mobile-build.md)。

### 常见问题

| 现象 | 处理 |
|------|------|
| 健康检查 `"db":"down"` | 检查 `DATABASE_URL` 的地址、账号、密码；Docker 部署确认 postgres 容器为 healthy |
| API 启动报找不到 Prisma Client 或 query engine | 在 `apps/api` 下执行 `pnpm exec prisma generate` 后重新构建 |
| 登录后马上被退回登录页 | 多个 API 实例的 JWT 密钥不一致，或修改密钥后旧令牌失效（重新登录即可） |
| 刷新内页返回 404 | nginx 缺少 `try_files $uri $uri/ /index.html` |
| 上传附件失败（413） | 调大系统设置 `file.max_size_mb`，同时调大 nginx `client_max_body_size` |
| 登录返回 429 | 触发登录频率限制（默认每分钟 20 次），稍等 1 分钟 |
| 提交报价 / 合同提示找不到审批人 | 给申请人设置上级，或再添加一位超级管理员 |
| 升级后页面仍是旧版 | 强制刷新浏览器；确认 `/version.json` 中的 `commit` 为新版本 |

---

## 本地开发

```bash
pnpm install
cp .env.example apps/api/.env                       # 默认对应下面的本地数据库
docker compose -f docker-compose.dev.yml up -d      # 本地 PostgreSQL + Redis（已有数据库可跳过，改 DATABASE_URL 即可）
pnpm -C apps/api exec prisma migrate deploy         # 创建表
pnpm -C apps/api exec prisma generate               # 生成数据库客户端（类型检查与启动前必须执行）
make api-dev                                        # API  http://127.0.0.1:3001（AUTO_SEED=true，首次启动写入演示数据）
make web                                            # Web  http://127.0.0.1:5174（/api 代理到 3001）
```

接口文档：`http://127.0.0.1:3001/api/v1/docs`

开发环境（`NODE_ENV` 不是 `production`）的初始账号使用固定的开发演示密码，见 `apps/api/src/seed/seed.service.ts`，登录页也会提示；测试脚本依赖该密码。

修改数据库结构：编辑 `apps/api/prisma/schema.prisma` 后执行 `pnpm migrate`（即 `prisma migrate dev`）生成迁移。

### 质量检查

```bash
pnpm typecheck
pnpm lint                            # 零告警
pnpm -C apps/api build
LOGIN_RATE_LIMIT=100 node apps/api/dist/main.js &   # 集成测试需运行中的 API，会写入 apps/api/.env 指向的数据库
pnpm test
pnpm test:e2e
```

---

## 文档地图

| 文件 | 内容 |
|------|------|
| [docs/manual/](docs/manual/) | 用户手册、管理员手册（中文、English） |
| [docs/18-mobile-build.md](docs/18-mobile-build.md) | iOS / Android / 鸿蒙 App 打包与推送配置 |
| [docs/openapi.json](docs/openapi.json) | 接口定义（OpenAPI 3），API 运行时也可在 `/api/v1/docs` 查看 |

---

## 模块总览

```
M01 组织与权限     账号 / 角色 / 数据权限 / 部门 / 集团主体
M02 线索中心       线索获取、分配、公海、转化
M03 客户与联系人   客户主数据、联系人、决策链、客户 360
M04 商机与销售过程  管道、阶段门禁、赢率、预测
M05 活动与跟进     任务 / 拜访 / 电话 / 外勤打卡 / 日历 / 跟进计划
M06 产品与报价     产品目录、价目、报价单、模板
M07 合同与回款     合同、变更单、回款计划与核销、发票
M08 客户服务       工单、知识库、SLA、NPS
M09 营销与获客     营销活动、表单、邮件跟踪
M10 报表与驾驶舱   报表中心、漏斗、目标、佣金、集团财务
M11 流程与审批     审批流、业务规则
M12 平台与AI       开放 API、Webhook、智能助手
```

---

## 开发约定（摘要）

- 功能范围、数据库（PostgreSQL）与语言（TypeScript）保持不变
- 不更换技术栈、目录结构、命名风格
- 用户可见文案必须走 i18n 词典（`apps/web/src/locales/`，中英文键必须一致）
- 新页面必须同时支持手机布局（宽度 < 768 底部 Tab）
- 不发明文档未定义的实体 / 字段 / 接口；不跳过权限校验
- 不用假数据掩盖未完成接口；未写验收测试不标记完成
- 密码、密钥只经环境变量传入，不写进代码、脚本与文档

---

## 许可证

Copyright 2026 Suzhou Atecent Information Technology Co., Ltd.

本系统以 [Apache License 2.0](LICENSE) 授权发布，版权与归属说明见 [NOTICE](NOTICE)。

- 可以自由使用、修改、分发（包括商业用途），须保留 `LICENSE` 与 `NOTICE` 中的许可证和版权声明，修改过的文件需注明改动。
- 许可证包含专利授权条款，并且不提供任何担保。
- 第三方依赖均为宽松协议（MIT、ISC、Apache-2.0、BSD、0BSD、Python-2.0），与本协议兼容；检查方法：`pnpm licenses list --prod -r`。
