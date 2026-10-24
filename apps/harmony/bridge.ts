/**
 * HarmonyOS NEXT 壳说明（docs/11）
 * 目录：apps/harmony/ 使用 DevEco Studio 打开
 * 业务 UI = 内嵌 Web（apps/web/dist 同步到 rawfile/www）
 * JS Bridge 对齐 packages/mobile-bridge 的 MobileBridge
 */

export const HARMONY_BRIDGE_STUB = {
  // ArkTS 侧通过 javaScriptProxy 注入，命名一致
  names: [
    'getPlatform',
    'getAppVersion',
    'getDevice',
    'requestPermissions',
    'getCurrentPosition',
    'reverseGeocode',
    'openExternal',
    'callPhone',
    'secureGet',
    'secureSet',
  ],
  platform: 'harmony' as const,
}
