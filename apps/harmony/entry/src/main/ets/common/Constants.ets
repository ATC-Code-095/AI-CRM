/** AppStorage 中待交给网页的通知数据（JSON 字符串） */
export const PUSH_KEY: string = 'crmPendingPush';

/**
 * 网页包放在 resources/rawfile/www（由 scripts/sync-mobile.sh 生成），
 * 以 https://localhost 的地址加载：与 Android App 同源，服务器 CORS 已内置放行。
 */
export const APP_ORIGIN: string = 'https://localhost';
export const RAWFILE_ROOT: string = 'www';
