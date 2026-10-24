import { i18nReady } from './i18n'

// 先确定界面语言并加载对应词典，再加载应用本体（部分模块在导入时就会调用 t()）
void i18nReady.then(() => import('./bootstrap'))

// 注册 PWA Service Worker（仅生产）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // 已有旧 SW 时，新版本接管后自动刷新，避免旧缓存白屏
        const hadController = !!navigator.serviceWorker.controller
        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!hadController || refreshing) return
          refreshing = true
          window.location.reload()
        })
        reg.update().catch(() => undefined)
      })
      .catch(() => undefined)
  })
}
