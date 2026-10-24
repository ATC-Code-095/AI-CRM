# 智销 CRM 手机 App（Capacitor）

完整步骤见 [docs/18-mobile-build.md](../../docs/18-mobile-build.md)。最常用的两步：

```bash
# 1. 生成网页包并同步到原生工程（仓库根目录执行；正式包必须用 HTTPS 地址）
VITE_API_BASE=https://crm.example.com bash scripts/sync-mobile.sh

# 2. 用 Android Studio 打开工程，Run 或打包
pnpm -C apps/mobile exec cap open android
```

| 项 | 值 |
|----|----|
| 包名 | `com.itecent.crm`（`CAP_APP_ID` 可覆盖；已生成的工程需同步修改） |
| 应用名 | 智销CRM |
| Android 工程 | `android/`（已生成） |
| iOS 工程 | `ios/`（未生成，需在装有 Xcode 的 Mac 上 `cap add ios`） |
| 网页包 | `www/`（生成物，不进 git） |
