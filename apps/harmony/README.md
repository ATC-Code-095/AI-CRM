# 智销 CRM 鸿蒙 NEXT App

ArkTS（Stage 模型，API 12+）工程，用 ArkWeb 加载内置网页包，原生提供推送、定位、拨号、附件选择与通知跳转。

用 **DevEco Studio → Open** 打开本目录。完整的打包、签名与上架步骤见 [docs/18-mobile-build.md](../../docs/18-mobile-build.md) 第 5 节。

## 网页包

网页包不进 git，由仓库根目录的脚本生成到 `entry/src/main/resources/rawfile/www`：

```bash
VITE_API_BASE=https://crm.example.com bash scripts/sync-mobile.sh
```

## 与网页的约定

| 方向 | 名称 | 说明 |
|------|------|------|
| 原生 → 网页 | `window.CrmHarmony.getPushToken()` | 请求通知授权并返回 Push Kit 令牌；网页登录后登记到服务器（平台 `harmony`） |
| 原生 → 网页 | `window.CrmHarmony.callPhone(tel)` | 拨号；网页里的 `tel:` 链接也会被拦截并拨号 |
| 原生 → 网页 | `window.CrmHarmony.getPlatform()` | 返回 `harmony` |
| 网页 ← 原生 | `window.crmOnPushOpen(json)` | 用户点击通知拉起 App 时调用，参数含 `type`、`entityType`、`entityId`，网页跳到对应单据 |

网页侧实现见 `packages/mobile-bridge`（`registerHarmonyPush`）与 `apps/web/src/utils/nativePush.ts`。

## 页面加载方式

网页以 `https://localhost/…` 的地址加载，`RawfileServer` 把这些请求映射到 rawfile 中的文件。这样与 Android App 同源，服务器已内置放行该来源的跨域请求，无需额外配置。
