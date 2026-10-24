# HarmonyOS NEXT 壳

1. 用 DevEco Studio 新建 Empty Ability（API 12+）
2. 用 `Web` 组件加载 `rawfile://www/index.html`（由 `apps/web/dist` 同步）
3. 用 `javaScriptProxy` 注入与 `packages/mobile-bridge` 同名方法
4. 定位：`geoLocationManager`；拨号：`openLink('tel:...')`
5. 权限：`ohos.permission.APPROXIMATELY_LOCATION` 等写入 module.json5

安装包目标：HarmonyOS NEXT `.app`，**不使用 Android APK**。

## 推送（Push Kit）

服务器配置华为 Push Kit 服务账号（环境变量 `HMS_SERVICE_ACCOUNT` / `HMS_SERVICE_ACCOUNT_FILE`）后，站内通知会推送到鸿蒙 App。壳需要做三件事：

1. **开通推送**：AppGallery Connect → 项目 → 推送服务 → 开通；`module.json5` 无需额外权限，首次需请求通知授权（`notificationManager.requestEnableNotification()`）。
2. **把推送令牌交给网页**：用 `javaScriptProxy` 注入名为 `CrmHarmony` 的对象，提供异步方法 `getPushToken`。网页登录后会调用它并把令牌登记到账号（`POST /api/v1/push/devices`，平台 `harmony`）。
3. **点击通知跳转**：通知的 `clickAction.data` 里有 `entityType`、`entityId`、`type`。App 被通知拉起时，把这份数据以 JSON 字符串交给网页的 `window.crmOnPushOpen`，网页会跳到对应单据。

```ts
// entry/src/main/ets/pages/Index.ets（示意）
import { webview } from '@kit.ArkWeb'
import { pushService } from '@kit.PushKit'
import { notificationManager } from '@kit.NotificationKit'
import { common, Want } from '@kit.AbilityKit'

class CrmHarmony {
  async getPushToken(): Promise<string> {
    await notificationManager.requestEnableNotification().catch(() => {})
    return await pushService.getToken()
  }
}

@Entry
@Component
struct Index {
  controller: webview.WebviewController = new webview.WebviewController()
  bridge: CrmHarmony = new CrmHarmony()

  /** 由 EntryAbility 在 onCreate / onNewWant 中，用通知拉起时的 want.parameters 调用 */
  openFromPush(want: Want) {
    const data = JSON.stringify(want.parameters ?? {})
    this.controller.runJavaScript(`window.crmOnPushOpen && window.crmOnPushOpen(${JSON.stringify(data)})`)
  }

  build() {
    Web({ src: $rawfile('www/index.html'), controller: this.controller })
      .javaScriptAccess(true)
      .domStorageAccess(true)
      .javaScriptProxy({
        object: this.bridge,
        name: 'CrmHarmony',
        methodList: [],
        asyncMethodList: ['getPushToken'],
        controller: this.controller,
      })
  }
}
```

> 以上为接入示意，具体 API 以 DevEco Studio 中 HarmonyOS SDK 版本的文档为准。
