import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { PUSH_KEY } from '../common/Constants';

/**
 * 点击推送通知拉起 App 时，服务端放在 clickAction.data 里的 type / entityType / entityId
 * 会出现在 want.parameters 中。取出后放进 AppStorage，由 Index 页交给网页跳转到对应单据。
 */
function pushPayload(want: Want): string {
  const p = want.parameters;
  if (!p) {
    return '';
  }
  const keys: string[] = ['type', 'entityType', 'entityId'];
  const data: Record<string, string> = {};
  let found = false;
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null) {
      data[k] = String(v);
      found = true;
    }
  }
  return found ? JSON.stringify(data) : '';
}

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.takePush(want);
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.takePush(want);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    AppStorage.setOrCreate('abilityContext', this.context);
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(0x0000, 'CRM', 'loadContent failed: %{public}s', JSON.stringify(err));
      }
    });
  }

  private takePush(want: Want): void {
    const data = pushPayload(want);
    if (data) {
      AppStorage.setOrCreate(PUSH_KEY, data);
    }
  }
}
