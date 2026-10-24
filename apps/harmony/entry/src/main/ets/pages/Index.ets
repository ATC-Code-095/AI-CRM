import { webview } from '@kit.ArkWeb';
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { picker } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { APP_ORIGIN, PUSH_KEY } from '../common/Constants';
import { RawfileServer } from '../common/RawfileServer';
import { CrmHarmony } from '../common/CrmHarmony';

const LOCATION_PERMISSIONS: Permissions[] = ['ohos.permission.APPROXIMATELY_LOCATION', 'ohos.permission.LOCATION'];

@Entry
@Component
struct Index {
  @StorageLink(PUSH_KEY) @Watch('deliverPush') pendingPush: string = '';
  private controller: webview.WebviewController = new webview.WebviewController();
  private ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
  private server: RawfileServer = new RawfileServer(this.ctx);
  private bridge: CrmHarmony = new CrmHarmony(this.ctx);
  private pageReady: boolean = false;

  /** 把通知数据交给网页；网页登录并注册 crmOnPushOpen 之前会重试，最多约 30 秒 */
  deliverPush(): void {
    if (!this.pendingPush || !this.pageReady) {
      return;
    }
    this.tryDeliver(this.pendingPush, 30);
  }

  private tryDeliver(data: string, attempts: number): void {
    const js = `(function(){if(window.crmOnPushOpen){window.crmOnPushOpen(${JSON.stringify(data)});return 'ok'}return 'wait'})()`;
    this.controller.runJavaScript(js).then((r: string) => {
      if (r.indexOf('ok') >= 0) {
        if (this.pendingPush === data) {
          AppStorage.setOrCreate(PUSH_KEY, '');
        }
      } else if (attempts > 1) {
        setTimeout(() => this.tryDeliver(data, attempts - 1), 1000);
      }
    }).catch((e: Error) => hilog.warn(0x0000, 'CRM', 'runJavaScript failed: %{public}s', e.message));
  }

  /** 网页请求定位时，先申请系统定位权限，再告诉 ArkWeb 是否允许 */
  private grantGeolocation(origin: string, geo: JsGeolocation): void {
    const atManager = abilityAccessCtrl.createAtManager();
    atManager.requestPermissionsFromUser(this.ctx, LOCATION_PERMISSIONS).then((r) => {
      const granted = r.authResults.some((v: number) => v === 0);
      geo.invoke(origin, granted, false);
    }).catch(() => geo.invoke(origin, false, false));
  }

  /** 网页里的 <input type="file">：图片走相册选择器，其他走文件选择器 */
  private pickFiles(accept: string[], multiple: boolean, result: FileSelectorResult): void {
    const imagesOnly = accept.length > 0 && accept.every((a: string) => a.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic)$/i.test(a));
    if (imagesOnly) {
      const opts = new photoAccessHelper.PhotoSelectOptions();
      opts.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
      opts.maxSelectNumber = multiple ? 9 : 1;
      new photoAccessHelper.PhotoViewPicker().select(opts)
        .then((r: photoAccessHelper.PhotoSelectResult) => result.handleFileList(r.photoUris))
        .catch(() => result.handleFileList([]));
    } else {
      const opts = new picker.DocumentSelectOptions();
      opts.maxSelectNumber = multiple ? 9 : 1;
      new picker.DocumentViewPicker(this.ctx).select(opts)
        .then((uris: string[]) => result.handleFileList(uris))
        .catch(() => result.handleFileList([]));
    }
  }

  onBackPress(): boolean {
    if (this.controller.accessBackward()) {
      this.controller.backward();
      return true;
    }
    return false;
  }

  build() {
    Column() {
      Web({ src: APP_ORIGIN + '/index.html', controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .geolocationAccess(true)
        // 后端为 http:// 的内网测试环境需要改为 MixedMode.All；正式环境请使用 HTTPS
        .mixedMode(MixedMode.None)
        .javaScriptProxy({
          object: this.bridge,
          name: 'CrmHarmony',
          methodList: ['callPhone', 'getPlatform'],
          asyncMethodList: ['getPushToken'],
          controller: this.controller
        })
        .onInterceptRequest((event) => {
          const url = event?.request.getRequestUrl() ?? '';
          if (!this.server.handles(url)) {
            return null;
          }
          const hit = this.server.serve(url);
          const resp = new WebResourceResponse();
          if (hit) {
            resp.setResponseData(hit.data);
            resp.setResponseMimeType(hit.mime);
            resp.setResponseEncoding('utf-8');
            resp.setResponseCode(200);
            resp.setReasonMessage('OK');
          } else {
            resp.setResponseData('');
            resp.setResponseCode(404);
            resp.setReasonMessage('Not Found');
          }
          resp.setResponseIsReady(true);
          return resp;
        })
        .onLoadIntercept((event) => {
          const url = event.data.getRequestUrl();
          if (url.startsWith('tel:')) {
            this.bridge.callPhone(url);
            return true;
          }
          return false;
        })
        .onGeolocationShow((event) => {
          if (event) {
            this.grantGeolocation(event.origin, event.geolocation);
          }
        })
        .onShowFileSelector((event) => {
          if (!event) {
            return false;
          }
          this.pickFiles(event.fileSelector.getAcceptType(), event.fileSelector.getMode() === FileSelectorMode.FileOpenMultipleMode, event.result);
          return true;
        })
        .onPageEnd(() => {
          this.pageReady = true;
          this.deliverPush();
        })
    }
    .width('100%')
    .height('100%')
  }
}
