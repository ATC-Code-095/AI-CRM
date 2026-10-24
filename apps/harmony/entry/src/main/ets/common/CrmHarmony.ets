import { pushService } from '@kit.PushKit';
import { notificationManager } from '@kit.NotificationKit';
import { call } from '@kit.TelephonyKit';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

/**
 * 通过 javaScriptProxy 注入网页的对象，网页里名为 window.CrmHarmony
 * （约定见 packages/mobile-bridge 的 registerHarmonyPush）。
 */
export class CrmHarmony {
  private ctx: common.UIAbilityContext;

  constructor(ctx: common.UIAbilityContext) {
    this.ctx = ctx;
  }

  /** 请求通知授权并返回 Push Kit 令牌；网页登录后登记到服务器（平台 harmony） */
  async getPushToken(): Promise<string> {
    try {
      await notificationManager.requestEnableNotification(this.ctx);
    } catch (e) {
      hilog.warn(0x0000, 'CRM', 'notification not enabled: %{public}s', JSON.stringify(e));
    }
    try {
      return await pushService.getToken();
    } catch (e) {
      hilog.error(0x0000, 'CRM', 'getToken failed: %{public}s', JSON.stringify(e));
      return '';
    }
  }

  /** 拨打电话（网页里的 tel: 链接也会走这里） */
  callPhone(tel: string): void {
    const num = tel.replace(/^tel:/, '').trim();
    if (num) {
      call.makeCall(num).catch((e: Error) => hilog.error(0x0000, 'CRM', 'makeCall failed: %{public}s', e.message));
    }
  }

  getPlatform(): string {
    return 'harmony';
  }
}
