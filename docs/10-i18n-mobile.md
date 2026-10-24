# 10 多语言与手机端规格（i18n + Mobile）

> 与 `01-tech-stack` 同级强制。任何 UI/文案/日期金额展示都必须遵守本文件。

---

## 0. 设计原则

| 原则 | 含义 |
|------|------|
| i18n 从 Day 1 | 禁止硬编码用户可见文案；中文只是默认语言包 |
| 租户级 + 用户级语言 | 租户默认语言决定邀请/系统通知；用户可自选界面语言 |
| 数据与文案分离 | 枚举是稳定 code，展示名走词典；业务备注/名称保持用户录入原文，不自动机翻入库 |
| 手机端一等公民 | 销售移动场景（跟进/打卡/待办/商机）P0，不是桌面压缩版 |
| 触达一致 | 同一业务规则、同一 API；仅交互密度与导航模式不同 |

---

## 1. 支持语言（MVP）

| 语言包 | locale | 方向 | 状态 |
|--------|--------|------|------|
| 简体中文 | `zh-CN` | LTR | P0 默认 |
| 英语（美） | `en-US` | LTR | P0 |
| 繁体中文 | `zh-TW` | LTR | P1 |
| 日语 | `ja-JP` | LTR | P2 |

**回退链：** `用户语言 → 租户默认语言 → zh-CN`。  
未翻译 key 回退 `zh-CN`，并在开发模式下 `console.warn`。

**MVP 明确不做：** 阿拉伯语等 RTL、机器翻译业务数据、多语言 SEO。

---

## 2. 语言装在哪儿

| 层 | 要求 |
|----|------|
| UI 文案 | `apps/web/src/locales/{locale}.json`，扁平 key |
| 枚举展示 | `packages/shared` 枚举 code + 前端词典 `enum.lead.status.NEW` 等 |
| 邮件/通知模板 | 模板 key + locale 变体（M11） |
| 校验错误 | zod 错误 → 官方 code → 前端词典；禁止后端返回中文长句当唯一错误 |
| 业务数据 | 客户名/备注/产品名等**用户输入**默认单语言原文；不强制翻译 |
| 自定义字段 label | `field_definitions.label` 可扩 `label_i18n jsonb`（P1） |
| 导出 CSV | 文件名含 locale；表头用当前 locale 词典 |

### 2.1 词典 Key 规范

```
common.save
nav.opportunities
lead.status.NEW
validation.required
error.code.40300
```

- 小写模块前缀 + 点号
- 枚举：`enum.<entity>.<field>.<VALUE>`
- 错误：`error.code.<业务码>` + 可选 `error.msg.<场景>`

### 2.2 日期 / 数字 / 货币

必须用 `Intl` API（或 `dayjs` + locale），禁止手写拼接：

| 项 | API | 示例 zh-CN | 示例 en-US |
|----|-----|------------|------------|
| 日期 | `Intl.DateTimeFormat` | 2026-03-01 | Mar 1, 2026 |
| 日期时间 | 同上 | 2026-03-01 14:00 | Mar 1, 2026, 2:00 PM |
| 数字 | `Intl.NumberFormat` | 12,345.67 | 12,345.67 |
| 货币 | `Intl.NumberFormat` currency | ¥12,345.67 | CN¥12,345.67 |
| 相对时间 | `Intl.RelativeTimeFormat` | 3天前 | 3 days ago |

- 后端金额仍传十进制**字符串**；格式化只在展示层
- 时区：展示用用户 `timezone`（默认 `Asia/Shanghai`），API 仍 UTC

---

## 3. 后端 API 与 locale

### 3.1 请求头

| Header | 说明 |
|--------|------|
| `Accept-Language` | `en-US,zh-CN;q=0.9`；缺省 `zh-CN` |
| `X-Timezone` | 可选，IANA 名；缺省用户资料 |

后端需要本地化的场景仅：
1. 邮件/站内信标题（若直接出人类可读字符串）
2. 导出 CSV 表头
3. Webhook 人类可读 message（可选）

**业务 API 的 `message` 允许中文开发字符串，但必须带稳定 `code`；前端优先按 `code` 映射词典，映射失败再显示 `message`。**

### 3.2 租户/用户设置扩展

`settings` / `users` 字段：

| 字段 | 位置 | 说明 |
|------|------|------|
| `defaultLocale` | 租户 settings key `i18n.default_locale` | 默认 `zh-CN` |
| `locale` | users | 用户界面语言 |
| `timezone` | users | 默认 `Asia/Shanghai` |
| `dateFormat` | users 可选 | `YYYY-MM-DD` 等 |

`GET /auth/me` 返回：`{ user: { locale, timezone, ... }, ... }`。

---

## 4. 手机端产品范围

### 4.1 形态

| 阶段 | 形态 | 说明 |
|------|------|------|
| P0 | **响应式 Web + PWA** | 同一 SPA；iOS/Android/鸿蒙浏览器可用 |
| P1 | **iOS + Android + HarmonyOS 安装包** | 详见 [11-cross-platform-mobile.md](./11-cross-platform-mobile.md) |
| P2 | 推送、扫码、鸿蒙元服务/卡片 | 原生增强 |

**禁止** 为 MVP 单独再做一套业务 API。

### 4.2 移动信息架构

```
底部 Tab（≤5）
├── 工作台   今日待办 / 快捷新建 / 漏斗摘要
├── 客户     搜索 / 列表 / 360
├── 商机     简表 / 卡片列表（MVP 不做复杂看板拖拽）
├── 跟进     时间线 / 一键记录 / 打卡
└── 我的     个人资料 / 语言 / 通知 / 登出
```

桌面左侧导航在 `<768px` 替换为底部 Tab + 顶栏汉堡（次级入口进汉堡抽屉）。

### 4.3 移动优先功能（销售场景）

| 功能 | 优先级 | 说明 |
|------|:------:|------|
| 今日待办与逾期提醒 | P0 | 工作台置顶 |
| 快速跟进（任务/电话/拜访/备注） | P0 | 一步弹层，最少字段 |
| 拜访打卡 | P0 | GPS + 逆地理；失败可手工地址 |
| 客户/商机搜索与详情 | P0 | 大触控行、电话可 `tel:` |
| 线索转化简化流 | P0 | 两步以内 |
| 商机阶段更新 | P0 | 列表内操作，不必拖拽 |
| 语音转文字跟进 | P1 | 调用 Web Speech / 系统输入法 |
| 离线草稿 | P1 | localStorage 队列，恢复后提交 |
| 看板拖拽 | P2 移动 | 桌面保留 |
| 审批 | P1 | 待办同意/驳回 |

### 4.4 移动交互规则

| 规则 | 标准 |
|------|------|
| 触控热区 | ≥ 44×44px；主按钮高 ≥ 48px |
| 行高 | 列表行 ≥ 56px |
| 手势 | 不做强制自定义手势；侧滑仅作增强 |
| 表单 | 移动单列；`inputMode`/`type=tel/email` 正确 |
| 弹层 | 底部 Sheet 优先于居中 Modal |
| 列表分页 | 无限滚动或「加载更多」；`pageSize=20` |
| 图片 | 详情主图不强制；压缩上传预览 |
| 断网 | 明确提示；草稿可暂存（P1） |
| 安全 | Token 存 httpOnly cookie 优先；若 localStorage 需 CSRF/XSS 说明；自动锁屏超时（P1） |

### 4.5 响应式断点（修订）

| 断点 | 布局 |
|------|------|
| `≥1280` | 桌面：侧栏 + 多栏详情 |
| `960–1279` | 小桌面/平板横 |
| `768–959` | 平板：两栏 |
| `<768` | **手机 IA（底部 Tab）** |
| `<375` | 仍可完成核心写路径 |

看板组件在 `<768` 降级为「阶段筛选 + 卡片列表」。

---

## 5. PWA（P0 最小集）

| 项 | 要求 |
|----|------|
| `manifest.json` | name/short_name/i18n 字段、图标 192/512、`display: standalone` |
| 图标 | 各 locale 可共用一套图标；应用名随 `short_name` 词典 |
| Service Worker | 仅静态资源缓存 + 离线壳；**API 默认 NetworkOnly**（防脏数据） |
| 安装提示 | 顶栏可选「安装」 |
| 推送 | P1，不在 P0 阻塞验收 |

---

## 6. 前端工程约定（相对 06 的增量）

### 6.1 依赖（锁定）

| 库 | 用途 |
|----|------|
| `i18next` + `react-i18next` + `i18next-browser-languagedetector` | 词典与探测 |
| `dayjs`（含 `locale/zh-cn` 等） | 相对展示可用 dayjs；正式格式化优先 Intl |
| 系统 `Intl` | 日期/数字/货币 |

语言探测顺序：`用户资料.locale` → `localStorage:ui_locale` → `navigator.language` → `zh-CN`。

### 6.2 组件规则

```tsx
// 禁止
<Button>保存</Button>
// 必须
const { t } = useTranslation()
<Button>{t('common.save')}</Button>
```

- antd 组件文案：`ConfigProvider` 注入 `zhCN` / `enUS`
- 日期选择器、分页等 antd locale 同步切换
- 标题/`document.title` 走 `t('xxx')`
- 单测可固定 `lng=zh-CN` 断言 key 渲染

### 6.3 移动组件

- `AppShell`：桌面 SideNav / 移动 BottomTabs 同一权限菜单源
- `MobileActionSheet`、`MobileList`、`PullToRefresh`（可选）集中在 `components/mobile/`
- 打卡组件 `CheckInButton`：权限 + 定位 API 封装

---

## 7. i18n 键覆盖要求（DoD 增量）

每个 UI 切片额外满足：

- [ ] 新增用户可见文案全部进 `zh-CN.json` **与** `en-US.json`
- [ ] 枚举 Tag/筛选选项用 `enum.*` 词典
- [ ] 表单错误用 `validation.*` / `error.code.*`
- [ ] 无写死的 `YYYY-MM-DD` 拼接；金额带 locale 符号
- [ ] 语言切换即时生效（刷新亦正确）
- [ ] 移动断点 375/390 走查核心路径

## 8. 移动 DoD（核心 4 页）

- [ ] 工作台：待办可点、快捷新建可用
- [ ] 客户列表/详情：搜索、电话可呼
- [ ] 商机列表：更新阶段
- [ ] 跟进：新建 NOTE/TASK + 拜访打卡（权限允许时）

## 9. 测试清单（本章）

| 类型 | 用例 |
|------|------|
| 单测 | `t()` 缺 key 回退；金额 `Intl` 快照 zh/en |
| 组件 | 语言切换后按钮文案变化 |
| API | `Accept-Language=en-US` 导出 CSV 表头为英文 |
| API | `me.locale=en-US` 后通知模板英文 |
| E2E | 登录后切换 en-US → 商机列表列名英文 |
| E2E | iPhone 宽度 390：底部 Tab 存在且可完成跟进 |
| 权限 | 无定位权限时打卡降级为手工地址 |

---

## 10. 与其他文档的修订点

三端安装包见 `11-cross-platform-mobile.md`；功能/语言/库冻结见 `12-locked-decisions.md`；单号/安全/任务见 `13-spec-supplements.md`。

| 文件 | 修订 |
|------|------|
| `00-product-brief` | 多语言 + 移动列入产品原则与 P0 |
| `01-tech-stack` | 增加 i18next/dayjs；PWA 工具链（vite-plugin-pwa） |
| `05-api-conventions` | `Accept-Language` / `X-Timezone` |
| `06-ui-spec` | 移动 IA、断点、词典硬约束 |
| `07-dev-guide` | 文案与格式化禁止事项 |
| `08-milestones` | M0 含 i18n 底座与移动壳；各模块 DoD 含双词典 |
| `09-acceptance` | 增加 AC-08/09 多语言与手机路径 |
