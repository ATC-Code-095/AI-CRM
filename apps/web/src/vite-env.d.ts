/// <reference types="vite/client" />

/** 构建时注入（vite.config.ts define），用于确认线上版本 */
declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string

interface ImportMetaEnv {
  /** 'true' 时生产构建也在登录页显示演示账号（仅用于演示站点） */
  readonly VITE_SHOW_DEMO_ACCOUNT?: string
}
