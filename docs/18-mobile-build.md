# 手机 App 打包指南（Android / iOS / 鸿蒙）

> 手机端有两种用法：
> - **手机浏览器 / PWA**：直接打开系统网址，可「添加到主屏幕」。无需打包，随网页部署自动更新。
> - **原生 App**：本文。App 内置网页包，接口请求发往配置的后端地址。

## 现状（2026-10-22）

| 平台 | 工程 | 状态 |
|------|------|------|
| Android | `apps/mobile/android`（Capacitor 6） | ✅ 已生成，包名 `com.itecent.crm`，定位权限已配置；**尚未在 Android Studio 中编译验证** |
| iOS | `apps/mobile/ios` | ⏳ 未生成：需要装有 Xcode 与 CocoaPods 的 Mac（见第 4 节） |
| 鸿蒙 NEXT | `apps/harmony` | ⏳ 只有网页包与桥接说明，需在 DevEco Studio 中新建工程（见第 5 节） |

已在代码中完成：接口地址可配置（`VITE_API_BASE`）、后端放行 App 来源的跨域请求、分享链接与二维码在 App 内使用服务器地址、App 包不含 Service Worker。以「网页与接口不同源」的方式模拟 App 运行，E2E 11 项全部通过，所有接口请求均发往配置的后端。

---

## 1. 前置条件

| 项 | 说明 |
|----|------|
| **后端 HTTPS** | 正式发布必须用 HTTPS 地址（如 `https://crm.example.com`）。iOS 默认禁止 HTTP；Android 虽可放行，但明文传输登录令牌不安全。HTTP 只用于内网测试 |
| Node / pnpm | 与网页开发相同，仓库根目录 `pnpm install` |
| Android | [Android Studio](https://developer.android.com/studio)（自带 JDK 17 与 Android SDK） |
| iOS | Xcode（App Store 安装）+ CocoaPods（`brew install cocoapods`）+ Apple 开发者账号 |
| 鸿蒙 | DevEco Studio + 华为开发者账号 |

---

## 2. 生成并同步网页包（每次发版都要做）

在仓库根目录执行：

```bash
VITE_API_BASE=https://crm.example.com bash scripts/sync-mobile.sh
```

脚本会：

1. 用该后端地址构建网页（输出到临时目录，不影响网页部署用的 `apps/web/dist`）；
2. 去掉 Service Worker（App 内不需要离线缓存，避免更新后仍显示旧页面）；
3. 复制到 `apps/mobile/www` 与 `apps/harmony/rawfile/www`；
4. 若已有原生工程，执行 `cap sync` 同步到 Android / iOS 工程。

最后一行应为 `MOBILE_SYNC_OK  网页包版本 0.2.0 · <提交哈希>`。

> - 地址填 `http://...` 时脚本会提示仅限内网测试，并自动为 Android 放行明文请求。
> - `apps/mobile/www`、`apps/harmony/rawfile/www` 是生成物，不进 git。

---

## 3. Android

### 3.1 调试包（装到自己手机上试用）

1. 完成第 2 步。
2. 打开工程：
   ```bash
   pnpm -C apps/mobile exec cap open android
   ```
   或在 Android Studio 里 **Open** → 选择 `apps/mobile/android`。首次打开会下载 Gradle 依赖，需几分钟。
3. 手机开启「开发者选项 → USB 调试」并连上电脑，点工具栏 ▶ **Run**；或菜单 **Build → Build App Bundle(s) / APK(s) → Build APK(s)**，生成的 `app-debug.apk` 可直接发到手机安装。

### 3.2 正式包（上架应用商店）

1. 菜单 **Build → Generate Signed App Bundle / APK** → 选 **Android App Bundle**。
2. 首次需 **Create new** 签名证书（keystore）：**务必备份 keystore 文件和密码**，丢失后无法再更新同一个 App。keystore 不要放进仓库。
3. 生成的 `.aab` 上传到应用商店（Google Play 或国内各商店）。

### 3.3 每次发版前

- 在 `apps/mobile/android/app/build.gradle` 中把 `versionCode` 加 1，`versionName` 改为与 `package.json` 一致（当前 `0.2.0`）。
- 重新执行第 2 步再打包。

### 3.4 图标与启动图

当前为 Capacitor 默认图标。在 Android Studio 中右键 `app/src/main/res` → **New → Image Asset**，选 `apps/web/public/icons/icon-512.png` 生成各尺寸图标。

### 3.5 已配置的权限

| 权限 | 用途 |
|------|------|
| 网络 | 访问后端 |
| 粗略 / 精确定位 | 拜访打卡；首次打卡时系统弹窗请求授权 |

拨打电话通过系统拨号界面完成，不需要额外权限。

---

## 4. iOS（需在装有 Xcode 的 Mac 上执行）

1. 安装 Xcode、CocoaPods，执行 `sudo xcode-select -s /Applications/Xcode.app`。
2. 完成第 2 步，然后生成工程：
   ```bash
   cd apps/mobile
   VITE_API_BASE=https://crm.example.com pnpm exec cap add ios
   pnpm exec cap open ios
   ```
3. 在 Xcode 中：
   - **Signing & Capabilities** 选择开发者团队，Bundle Identifier 为 `com.itecent.crm`（需在 Apple 开发者后台登记）。
   - `Info.plist` 增加定位说明 **Privacy - Location When In Use Usage Description**，如「用于拜访打卡记录位置」。
4. 选真机或模拟器运行；上架用 **Product → Archive**。
5. 生成后把 `apps/mobile/ios` 提交进仓库（Capacitor 自带的 `.gitignore` 会排除生成物）。

> iOS 只能连 HTTPS 后端。内网 HTTP 测试需在 `Info.plist` 加 App Transport Security 例外，**正式包不要保留**。

---

## 5. 鸿蒙 NEXT（DevEco Studio）

1. DevEco Studio 新建 **Empty Ability** 工程（API 12+）。
2. 完成第 2 步后，把 `apps/harmony/rawfile/www` 整个复制到工程 `entry/src/main/resources/rawfile/www`。
3. 页面用 `Web` 组件加载 `$rawfile('www/index.html')`，开启 `javaScriptAccess`、`domStorageAccess`（登录状态保存在 localStorage）。
4. 用 `javaScriptProxy` 注入与 `packages/mobile-bridge` 同名的方法（定位、拨号），参考 `apps/harmony/bridge.ts`。
5. `module.json5` 声明权限：`ohos.permission.INTERNET`、`ohos.permission.APPROXIMATELY_LOCATION`、`ohos.permission.LOCATION`。
6. **跨域**：rawfile 页面的来源与 iOS / Android 不同。首次运行时在后端日志或浏览器调试中查看请求的 `Origin`，把它加到服务器环境变量 `CORS_ORIGIN`（逗号分隔，见第 7 节）。
7. **推送**：按 `apps/harmony/README.md`「推送（Push Kit）」注入 `CrmHarmony.getPushToken` 并转发通知点击，服务器配置见第 6.3 节。
8. 构建 `.app` 并在 AppGallery Connect 上架。

---

## 6. 推送通知（APNs / FCM / 鸿蒙 Push Kit）

App 登录后会申请通知权限并把设备登记到账号；服务器配置了推送凭证后，站内通知会同时推送到手机，点推送打开对应单据。未配置的平台只收站内通知。

### 6.1 Android（Firebase Cloud Messaging）

1. 在 [Firebase 控制台](https://console.firebase.google.com/) 新建项目，添加 Android 应用，包名填 `com.itecent.crm`（或你的 `CAP_APP_ID`）。
2. 下载 `google-services.json`，放到 `apps/mobile/android/app/`（不要提交到公开仓库），重新打包。工程已在检测到该文件时自动启用 Firebase。
3. Firebase 控制台 → 项目设置 → 服务账号 → **生成新的私钥**，得到服务账号 JSON。把它配置到服务器环境变量 `FCM_SERVICE_ACCOUNT`（JSON 内容）或 `FCM_SERVICE_ACCOUNT_FILE`（文件路径），重启 API。

### 6.2 iOS（APNs）

1. Apple 开发者后台 → Certificates, Identifiers & Profiles → **Keys** → 新建 Key，勾选 **Apple Push Notifications service (APNs)**，下载 `.p8` 文件，记下 **Key ID** 与 **Team ID**。
2. Xcode 中为 App 添加 **Push Notifications** 能力（Signing & Capabilities → + Capability），并按 [Capacitor 推送插件说明](https://capacitorjs.com/docs/apis/push-notifications) 在 `AppDelegate.swift` 中转发注册回调。
3. 服务器环境变量：`APNS_KEY`（.p8 内容，换行可写成 `\n`）或 `APNS_KEY_FILE`、`APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_BUNDLE_ID`（默认 `com.itecent.crm`）；用 TestFlight / App Store 包时设 `APNS_PRODUCTION=true`，Xcode 直接安装的开发包保持 `false`。

### 6.3 鸿蒙（华为 Push Kit）

1. AppGallery Connect → 你的项目 → **推送服务** → 开通。
2. AppGallery Connect → 项目设置 → **服务账号** → 创建并下载服务账号密钥（JSON，含 `project_id`、`key_id`、`sub_account`、`private_key`）。
3. 服务器环境变量：`HMS_SERVICE_ACCOUNT`（JSON 内容）或 `HMS_SERVICE_ACCOUNT_FILE`（文件路径），重启 API。
4. 鸿蒙壳按 `apps/harmony/README.md` 把推送令牌交给网页。

### 6.4 确认

系统设置 → 监控与自动化 → **手机推送** 显示两条通道是否已配置。用 App 登录后，让同事给你分配一条线索，手机应收到推送。


## 7. 后端配置（服务器上）

| 项 | 说明 |
|----|------|
| HTTPS | 为 API 所在域名配置证书（1Panel → 网站 → 证书） |
| 跨域 | 已内置放行 `capacitor://localhost`（iOS）与 `https://localhost`（Android）。其他来源（如鸿蒙）加到环境变量 `CORS_ORIGIN` |
| 版本核对 | App 内「我的」页底部与 `GET /api/v1/health` 都显示版本号与提交哈希，二者应一致 |

---

## 8. 验收清单

- [ ] Android 调试包可安装、可登录
- [ ] iOS 真机可登录
- [ ] 鸿蒙真机可登录
- [ ] 底部 Tab 五个入口可用
- [ ] 拜访打卡：首次弹出定位授权，打卡成功；拒绝授权时可手工填地址
- [ ] 点电话号码能调起拨号
- [ ] 报价分享链接、二维码在其他手机上能打开
- [ ] 中 / 英切换
- [ ] 帮助中心可打开
- [ ] App 显示的版本与 `GET /api/v1/health` 一致
