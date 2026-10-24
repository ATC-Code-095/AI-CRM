import { useTranslation } from 'react-i18next'
import { i18n } from '../i18n'
import { api, isLoggedIn } from '../api/client'

export function useUiLocale() {
  const { i18n: inst } = useTranslation()
  return (inst.resolvedLanguage || inst.language || 'zh-CN') as string
}

/**
 * 切换界面语言：写入 localStorage `ui_locale` 后整页刷新，让模块级文案也切到新语言。
 * 已登录时同步保存到账号（服务端据此生成通知、定时任务提醒等文字）。
 */
export function setUiLocale(locale: 'zh-CN' | 'en-US') {
  const current = i18n.resolvedLanguage || i18n.language
  const saved = isLoggedIn()
    ? api('/auth/preferences', { method: 'POST', body: JSON.stringify({ locale }) }).catch(() => undefined)
    : Promise.resolve()
  void Promise.all([i18n.changeLanguage(locale), saved]).then(() => {
    if (current !== locale && typeof window !== 'undefined' && import.meta.env.MODE !== 'test') window.location.reload()
  })
}
