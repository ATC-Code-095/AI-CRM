import { useEffect, useState } from 'react'
import { t } from '../i18n'

export type UiThemeMode = 'light' | 'dark'

const KEY = 'crm.uiMode'
const ACCENT_KEY = 'crm.theme'

/**
 * 主题色预设：每套预设同时驱动品牌色阶（--crm-brand-*）。
 * 只改 --crm-accent 会导致「按钮还是蓝的、色条变绿了」，因此统一改色阶。
 */
export const ACCENT_PRESETS: Record<
  string,
  { label: string; accent: string; ramp: [string, string, string, string] }
> = {
  blue: { label: t('hook.useUiTheme.corporateBlue'), accent: '#2f6bff', ramp: ['#5f8dff', '#2f6bff', '#1f56e0', '#1a45b8'] },
  teal: { label: t('hook.useUiTheme.teal'), accent: '#14b8a6', ramp: ['#2dd4bf', '#14b8a6', '#0d9488', '#0f766e'] },
  purple: { label: t('hook.useUiTheme.violet'), accent: '#8b5cf6', ramp: ['#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9'] },
  orange: { label: t('hook.useUiTheme.warmOrange'), accent: '#f97316', ramp: ['#fb923c', '#f97316', '#ea580c', '#c2410c'] },
  slate: { label: t('hook.useUiTheme.graphite'), accent: '#475569', ramp: ['#64748b', '#475569', '#334155', '#1e293b'] },
}

export function getUiMode(): UiThemeMode {
  try {
    return (localStorage.getItem(KEY) as UiThemeMode) || 'light'
  } catch {
    return 'light'
  }
}

export function getAccentKey(): string {
  try {
    return localStorage.getItem(ACCENT_KEY) ?? 'blue'
  } catch {
    return 'blue'
  }
}

/** 写入 CSS 变量：品牌色阶 400/500/600/700 + 兼容旧变量名 */
export function applyAccent(key: string) {
  const preset = ACCENT_PRESETS[key] ?? ACCENT_PRESETS.blue
  const root = document.documentElement
  root.style.setProperty('--crm-brand-400', preset.ramp[0])
  root.style.setProperty('--crm-brand-500', preset.ramp[1])
  root.style.setProperty('--crm-brand-600', preset.ramp[2])
  root.style.setProperty('--crm-brand-700', preset.ramp[3])
  root.style.setProperty('--crm-accent', preset.accent)
  root.style.setProperty('--crm-accent-soft', preset.accent + '1a')
  try {
    localStorage.setItem(ACCENT_KEY, key)
  } catch {
    /* ignore */
  }
}

export function getAccent(): string {
  return (ACCENT_PRESETS[getAccentKey()] ?? ACCENT_PRESETS.blue).accent
}

export function applyUiChrome() {
  document.documentElement.setAttribute('data-mode', getUiMode())
  applyAccent(getAccentKey())
}

export function setUiMode(mode: UiThemeMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
  applyUiChrome()
}

export function useUiMode() {
  const [mode, setModeState] = useState<UiThemeMode>(() => getUiMode())
  const [accent, setAccentState] = useState<string>(() => getAccentKey())

  useEffect(() => {
    applyUiChrome()
  }, [])

  const setMode = (m: UiThemeMode) => {
    setUiMode(m)
    setModeState(m)
  }

  const setAccent = (key: string) => {
    applyAccent(key)
    setAccentState(key)
  }

  return { mode, setMode, dark: mode === 'dark', accent, setAccent }
}
