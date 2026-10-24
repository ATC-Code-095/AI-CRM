import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import zhCN from './locales/zh-CN.json'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // 中文词典内置；英文词典约 135 KB，只在界面语言为英文时按需加载（见 i18nReady）
    resources: {
      'zh-CN': { translation: zhCN },
    },
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'ui_locale',
    },
  })

function syncLocale(lng: string) {
  dayjs.locale(lng === 'en-US' ? 'en' : 'zh-cn')
  if (typeof document !== 'undefined') document.documentElement.lang = lng
}
i18n.on('languageChanged', syncLocale)

/**
 * 词典就绪：检测到英文时先加载英文词典再切换。main.tsx 等它完成后才加载应用本体。
 * 切换语言会整页刷新（见 setUiLocale），刷新后在这里加载对应词典。
 */
export const i18nReady: Promise<void> = (async () => {
  if (i18n.language === 'en-US') {
    const en = (await import('./locales/en-US.json')).default
    i18n.addResourceBundle('en-US', 'translation', en, true, true)
    await i18n.changeLanguage('en-US')
  }
  syncLocale(i18n.resolvedLanguage || i18n.language)
})()

/**
 * 全局翻译函数：组件外（列定义、常量、工具函数）也可直接使用。
 * 切换语言会整页刷新（见 setUiLocale），因此模块级常量里的 t() 结果始终与当前语言一致。
 */
export const t = i18n.t.bind(i18n) as typeof i18n.t

let zhIndex: Map<string, string> | undefined
/**
 * 接口返回的固定中文标签（如报表分类名）按中文词典反查后翻译；查不到原样返回。
 * 仅用于系统生成的标签，用户录入的业务数据不要经过它。
 */
export function tLabel(zh: string): string {
  if ((i18n.resolvedLanguage || i18n.language) === 'zh-CN') return zh
  if (!zhIndex) {
    zhIndex = new Map()
    for (const [k, v] of Object.entries(zhCN as Record<string, string>)) if (!zhIndex.has(v)) zhIndex.set(v, k)
  }
  const key = zhIndex.get(zh)
  return key ? t(key) : zh
}

export { i18n }
