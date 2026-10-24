import { AsyncLocalStorage } from 'async_hooks'
import type { NextFunction, Request, Response } from 'express'

/** 界面语言：服务端生成给用户看的文字（报表说明、建议、通知等）按它输出 */
export type UiLocale = 'zh-CN' | 'en-US'

/** 中英两种写法；存库或发给他人时按接收人的语言取值 */
export interface Bilingual {
  zh: string
  en: string
}

const store = new AsyncLocalStorage<UiLocale>()

export function normalizeLocale(v?: string | null): UiLocale {
  return v && v.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

/** 当前请求的界面语言：前端每个请求带 X-UI-Locale；无请求上下文（定时任务）时为中文 */
export function currentLocale(): UiLocale {
  return store.getStore() ?? 'zh-CN'
}

/** 在指定语言下执行（定时任务给某个用户生成内容时使用） */
export function withLocale<T>(locale: UiLocale, fn: () => T): T {
  return store.run(locale, fn)
}

/** 按当前（或指定）语言取中英文之一 */
export function tr(zh: string, en: string, locale: UiLocale = currentLocale()): string {
  return locale === 'en-US' ? en : zh
}

export function pick(text: string | Bilingual, locale: UiLocale = currentLocale()): string {
  return typeof text === 'string' ? text : tr(text.zh, text.en, locale)
}

/** 请求级中间件：X-UI-Locale 优先，其次 Accept-Language，默认中文 */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers['x-ui-locale'] ?? req.headers['accept-language']
  store.run(normalizeLocale(Array.isArray(header) ? header[0] : header), next)
}

/**
 * 系统预置的名称（种子写入数据库的阶段、管道、审批定义等）。
 * 租户未改名时，英文界面按此显示；改过名的按原样显示。前端词典 sys.* 与此保持一致。
 */
const SYSTEM_LABELS: Record<string, string> = {
  初步接洽: 'Prospecting',
  需求确认: 'Discovery',
  '方案/报价': 'Proposal',
  谈判: 'Negotiation',
  赢单: 'Won',
  输单: 'Lost',
  标准B2B管道: 'Standard B2B pipeline',
  报价折扣审批: 'Quote discount approval',
  合同金额审批: 'Contract amount approval',
}

export function sysLabel(name: string | null | undefined, locale: UiLocale = currentLocale()): string {
  if (!name) return ''
  return locale === 'en-US' ? (SYSTEM_LABELS[name] ?? name) : name
}

/** 只翻译这些字段名下、且值完全等于系统预置名称的字符串，避免误改业务数据 */
const LABEL_KEYS = new Set(['name', 'stageName', 'stage', 'label', 'title', 'pipelineName', 'definitionName', 'fromStage', 'toStage', 'from', 'to', 'currentStage', 'stageLabel'])

/**
 * 英文界面下，把接口返回数据里的系统预置名称（阶段、管道、审批定义）换成英文。
 * 在响应拦截器中调用；租户改过的名称不在表内，保持原样。
 */
export function localizeSystemLabels<T>(data: T, locale: UiLocale): T {
  if (locale !== 'en-US') return data
  const seen = new WeakSet<object>()
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 12 || v === null || typeof v !== 'object') return v
    if (seen.has(v as object)) return v
    seen.add(v as object)
    if (v instanceof Date || Buffer.isBuffer(v)) return v
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = walk(v[i], depth + 1)
      return v
    }
    const o = v as Record<string, unknown>
    for (const k of Object.keys(o)) {
      const x = o[k]
      if (typeof x === 'string') {
        if (LABEL_KEYS.has(k) && SYSTEM_LABELS[x]) o[k] = SYSTEM_LABELS[x]
      } else if (x && typeof x === 'object') {
        o[k] = walk(x, depth + 1)
      }
    }
    return o
  }
  return walk(data, 0) as T
}
