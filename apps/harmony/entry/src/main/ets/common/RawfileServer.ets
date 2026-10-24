import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { APP_ORIGIN, RAWFILE_ROOT } from './Constants';

const MIME: Record<string, string> = {
  'html': 'text/html',
  'js': 'text/javascript',
  'mjs': 'text/javascript',
  'css': 'text/css',
  'json': 'application/json',
  'svg': 'image/svg+xml',
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'webp': 'image/webp',
  'gif': 'image/gif',
  'ico': 'image/x-icon',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'md': 'text/markdown',
  'txt': 'text/plain',
  'webmanifest': 'application/manifest+json'
};

export class RawfileHit {
  data: ArrayBuffer;
  mime: string;

  constructor(data: ArrayBuffer, mime: string) {
    this.data = data;
    this.mime = mime;
  }
}

/** 把 https://localhost/… 的请求映射到 rawfile/www 下的文件；单页应用的路由回落到 index.html */
export class RawfileServer {
  private ctx: common.UIAbilityContext;

  constructor(ctx: common.UIAbilityContext) {
    this.ctx = ctx;
  }

  handles(url: string): boolean {
    return url === APP_ORIGIN || url.startsWith(APP_ORIGIN + '/');
  }

  serve(url: string): RawfileHit | null {
    let path = url.substring(APP_ORIGIN.length);
    const q = path.search(/[?#]/);
    if (q >= 0) {
      path = path.substring(0, q);
    }
    path = decodeURIComponent(path);
    if (path === '' || path === '/') {
      path = '/index.html';
    }
    if (path.indexOf('..') >= 0) {
      return null;
    }
    const hit = this.read(path);
    if (hit) {
      return hit;
    }
    // 没有扩展名的路径是前端路由（如 /accounts/123），返回 index.html
    const last = path.substring(path.lastIndexOf('/') + 1);
    return last.indexOf('.') < 0 ? this.read('/index.html') : null;
  }

  private read(path: string): RawfileHit | null {
    try {
      const bytes: Uint8Array = this.ctx.resourceManager.getRawFileContentSync(RAWFILE_ROOT + path);
      const ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      return new RawfileHit(buf, MIME[ext] ?? 'application/octet-stream');
    } catch (e) {
      hilog.debug(0x0000, 'CRM', 'rawfile miss %{public}s', path);
      return null;
    }
  }
}
