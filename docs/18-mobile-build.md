# 手机 App 打包指南（Android / iOS / 鸿蒙）

> 手机端有两种用法：
> - **手机浏览器 / PWA**：直接打开系统网址，可「添加到主屏幕」。无需打包，随网页部署自动更新。
> - **原生 App**：本文。App 内置网页包，接口请求发往配置的后端地址。

## 现状（2026-10-24）

| 平台 | 工程 | 状态 |
|------|------|------|
| Android | `apps/mobile/android`（Capacitor 6） | ✅ 已编译调试包并在 Android 37 模拟器运行，可连接后端；Gradle 8.14（支持 JDK 21），包名 `com.itecent.crm`，定位、推送权限已配置。正式包需自己的签名证书 |
| iOS | `apps/mobile/ios`（Capacitor 6，Swift Package Manager，无需 CocoaPods） | ✅ 已在 Xcode 27 编译，iPhone 模拟器（iOS 27）运行正常，可连接后端；最低系统 iOS 15，已采用 Scene 生命周期（iOS 27 强制要求）；推送、定位 / 相机 / 相册说明已配置。真机与推送需开发者账号签名后验证 |
| 鸿蒙 NEXT | `apps/harmony`（ArkTS，API 12+） | ✅ 已编译并在鸿蒙模拟器运行：登录正式服务器、进入工作台正常，原生桥 `CrmHarmony` 已注入；推送、定位、拨号、附件选择、通知跳转已实现。真机安装需华为账号签名，推送需开通 Push Kit |

已在代码中完成：接口地址可配置（`VITE_API_BASE`）、后端放行 App 来源的跨域请求、分享链接与二维码在 App 内使用服务器地址、App 包不含 Service Worker。以「网页与接口不同源」的方式模拟 App 运行，E2E 11 项全部通过，所有接口请求均发往配置的后端。

---

## 1. 前置条件

| 项 | 说明 |
|----|------|
| **后端 HTTPS** | 正式发布必须用 HTTPS 地址（如 `https://crm.example.com`）。iOS 默认禁止 HTTP；Android 虽可放行，但明文传输登录令牌不安全。HTTP 只用于内网测试 |
| Node / pnpm | 与网页开发相同，仓库根目录 `pnpm install` |
| Android | [Android Studio](https://developer.android.com/studio)（含 Android SDK）。命令行编译用 JDK 21：`JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew assembleDebug` |
| iOS | Xcode（App Store 安装）+ Apple 开发者账号。首次使用 Xcode 需执行一次 `sudo xcodebuild -runFirstLaunch`，用模拟器还要 `xcodebuild -downloadPlatform iOS` |
| 鸿蒙 | [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)（含 HarmonyOS SDK，API 12+）+ 华为开发者账号 |

---

## 2. 生成并同步网页包（每次发版都要做）

在仓库根目录执行：

```bash
VITE_API_BASE=https://crm.example.com bash scripts/sync-mobile.sh
```

脚本会：

1. 用该后端地址构建网页（输出到临时目录，不影响网页部署用的 `apps/web/dist`）；
2. 去掉 Service Worker（App 内不需要离线缓存，避免更新后仍显示旧页面）；
3. 复制到 `apps/mobile/www` 与鸿蒙工程 `apps/harmony/entry/src/main/resources/rawfile/www`；
4. 若已有原生工程，执行 `cap sync` 同步到 Android / iOS 工程。

最后一行应为 `MOBILE_SYNC_OK  网页包版本 0.2.0 · <提交哈希>`。

> - 地址填 `http://...` 时脚本会提示仅限内网测试，并自动为 Android 放行明文请求。
> - `apps/mobile/www`、`apps/harmony/entry/src/main/resources/rawfile/www` 是生成物，不进 git。

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

工程已生成在 `apps/mobile/ios`，用 Swift Package Manager 管理依赖（不需要 CocoaPods）。

1. 首次使用 Xcode：
   ```bash
   sudo xcodebuild -runFirstLaunch          # 安装 Xcode 附加组件（需要电脑管理员密码）
   xcodebuild -downloadPlatform iOS         # 下载 iOS 模拟器（只用真机可跳过）
   ```
2. 完成第 2 步（会自动 `cap sync` 到 iOS 工程），然后打开工程：
   ```bash
   cd apps/mobile && pnpm exec cap open ios
   ```
   首次打开时 Xcode 会自动下载 Capacitor 的 Swift 包，等待左侧 **Package Dependencies** 加载完成。
3. 在 Xcode 中选中 **App** target → **Signing & Capabilities**：
   - **Team** 选择你的开发者团队；Bundle Identifier 为 `com.itecent.crm`（需在 Apple 开发者后台登记，或改成你自己的）。
   - 已配置 **Push Notifications** 能力（`App/App.entitlements`）；定位、相机、相册的使用说明已写入 `Info.plist`。
4. 选模拟器或连接的 iPhone，点 ▶ 运行；上架用 **Product → Archive**，再在 Organizer 上传到 App Store Connect / TestFlight。

> iOS 只能连 HTTPS 后端。内网 HTTP 测试需在 `Info.plist` 加 App Transport Security 例外，**正式包不要保留**。

---

## 5. 鸿蒙 NEXT（DevEco Studio）

工程已在 `apps/harmony`，结构与 DevEco Studio 的 Empty Ability（Stage 模型）一致：

| 文件 | 作用 |
|------|------|
| `AppScope/app.json5` | 包名 `com.itecent.crm`、版本号、应用名 |
| `entry/src/main/module.json5` | 入口 Ability、权限（网络、定位） |
| `entry/src/main/ets/pages/Index.ets` | ArkWeb 页面：加载内置网页包，处理定位授权、拨号、附件选择、返回键 |
| `entry/src/main/ets/common/RawfileServer.ets` | 把 `https://localhost/…` 映射到 `rawfile/www`，单页路由回落到 `index.html` |
| `entry/src/main/ets/common/CrmHarmony.ets` | 注入网页的 `window.CrmHarmony`：`getPushToken`、`callPhone`、`getPlatform` |
| `entry/src/main/ets/entryability/EntryAbility.ets` | 点击通知拉起时取出单据信息，交给网页跳转 |

步骤：

1. 完成第 2 步，网页包会同步到 `entry/src/main/resources/rawfile/www`。
2. DevEco Studio → **Open** → 选择 `apps/harmony` 目录（DevEco 不接受含空格的路径，仓库在含空格的目录下时，先建符号链接：`ln -s "$PWD/apps/harmony" ~/DevEcoProjects/zhixiao_crm_harmony`，再打开该链接），等待同步（会自动生成 `oh_modules`、`local.properties` 等，不进 git）。
3. **签名**：File → Project Structure → **Signing Configs**，登录华为开发者账号后勾选 **Automatically generate signature**（调试用）；正式发布在 AppGallery Connect 申请发布证书与 Profile。签名信息写入 `build-profile.json5`，**含密码，不要提交到公开仓库**。
4. 连接鸿蒙 NEXT 真机或模拟器，点 ▶ 运行。模拟器可以不签名：命令行编译后 `hdc install -r entry/build/default/outputs/default/entry-default-unsigned.hap`，再 `hdc shell aa start -a EntryAbility -b com.itecent.crm`。调试包已开启网页调试，可用 `hdc fport` 转发 `webview_devtools_remote_<pid>` 后用 Chrome DevTools 查看。

   命令行编译（不签名，用于检查代码）：
   ```bash
   D=/Applications/DevEco-Studio.app/Contents
   cd apps/harmony
   DEVECO_SDK_HOME=$D/sdk PATH=$D/tools/node/bin:$PATH node $D/tools/hvigor/bin/hvigorw.js \
     --mode module -p module=entry@default -p product=default -p buildMode=debug assembleHap --no-daemon
   ```
   产物在 `entry/build/default/outputs/default/entry-default-unsigned.hap`。
5. 正式包：Build → **Build Hap(s)/APP(s) → Build APP(s)**，生成 `.app` 上传 AppGallery Connect。

说明：

- 网页以 `https://localhost` 地址加载，与 Android App 同源，服务器默认已放行跨域，**不需要**额外配置 `CORS_ORIGIN`。
- 后端是 `http://` 时，`sync-mobile.sh` 会写入 `rawfile/www/app-config.json`，App 据此自动放行混合内容（与 Android 一致）；正式环境请使用 HTTPS。
- 推送：在 AppGallery Connect 开通推送服务（第 6.3 节）。App 登录后会请求通知权限并登记设备；点击通知会打开对应单据。

---

## 6. 推送通知（APNs / FCM / 鸿蒙 Push Kit）

App 登录后会申请通知权限并把设备登记到账号；服务器配置了推送凭证后，站内通知会同时推送到手机，点推送打开对应单据。未配置的平台只收站内通知。

### 6.1 Android（Firebase Cloud Messaging）

1. 在 [Firebase 控制台](https://console.firebase.google.com/) 新建项目，添加 Android 应用，包名填 `com.itecent.crm`（或你的 `CAP_APP_ID`）。
2. 下载 `google-services.json`，放到 `apps/mobile/android/app/`（不要提交到公开仓库），重新打包。工程已在检测到该文件时自动启用 Firebase。没有该文件时 App 照常使用，只是不注册推送（不会因推送崩溃）。
3. Firebase 控制台 → 项目设置 → 服务账号 → **生成新的私钥**，得到服务账号 JSON。把它配置到服务器环境变量 `FCM_SERVICE_ACCOUNT`（JSON 内容）或 `FCM_SERVICE_ACCOUNT_FILE`（文件路径），重启 API。

### 6.2 iOS（APNs）

1. Apple 开发者后台 → Certificates, Identifiers & Profiles → **Keys** → 新建 Key，勾选 **Apple Push Notifications service (APNs)**，下载 `.p8` 文件，记下 **Key ID** 与 **Team ID**。
2. Xcode 中为 App 添加 **Push Notifications** 能力（Signing & Capabilities → + Capability），并按 [Capacitor 推送插件说明](https://capacitorjs.com/docs/apis/push-notifications) 在 `AppDelegate.swift` 中转发注册回调。
3. 服务器环境变量：`APNS_KEY`（.p8 内容，换行可写成 `\n`）或 `APNS_KEY_FILE`、`APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_BUNDLE_ID`（默认 `com.itecent.crm`）；用 TestFlight / App Store 包时设 `APNS_PRODUCTION=true`，Xcode 直接安装的开发包保持 `false`。

### 6.3 鸿蒙（华为 Push Kit）

1. AppGallery Connect → 你的项目 → **推送服务** → 开通。
2. AppGallery Connect → 项目设置 → **服务账号** → 创建并下载服务账号密钥（JSON，含 `project_id`、`key_id`、`sub_account`、`private_key`）。
3. 服务器环境变量：`HMS_SERVICE_ACCOUNT`（JSON 内容）或 `HMS_SERVICE_ACCOUNT_FILE`（文件路径），重启 API。
4. 鸿蒙工程已实现推送令牌登记与通知跳转，开通推送服务后无需改代码。

### 6.4 确认

系统设置 → 监控与自动化 → **手机推送** 显示各推送通道是否已配置。用 App 登录后，让同事给你分配一条线索，手机应收到推送。


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
