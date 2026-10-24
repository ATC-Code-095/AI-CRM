import { t } from '../i18n'
/** 模板文档导出：存 Word（.doc）/ 输出 PDF（打印） */

export function buildTemplateHtml(opts: {
  title: string
  meta?: { name?: string; category?: string; duration?: string; payment?: string }
  terms: string
  lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
}) {
  const rows = (opts.lines ?? [])
    .map(
      (l, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(l.name)}</td><td>${l.qty}</td><td>${l.unitPrice}</td><td>${l.amount}</td></tr>`,
    )
    .join('')
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title>
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12pt; color:#1e293b; }
  h1 { font-size: 18pt; text-align: center; }
  .meta { margin: 12px 0; font-size: 11pt; color:#475569; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #94a3b8; padding: 6px 8px; font-size: 10.5pt; }
  th { background: #f1f5f9; }
  .terms { margin-top: 16px; white-space: pre-wrap; line-height: 1.7; }
</style></head>
<body>
  <h1>${escapeHtml(opts.title)}</h1>
  <div class="meta">
    ${opts.meta?.name ? t('util.docExport.template', { name: escapeHtml(opts.meta.name) }) : ''}
    ${opts.meta?.category ? t('util.docExport.category', { category: escapeHtml(opts.meta.category) }) : ''}
    ${opts.meta?.duration ? t('util.docExport.termMonths', { duration: escapeHtml(opts.meta.duration) }) : ''}
    ${opts.meta?.payment ? t('util.docExport.payment', { payment: escapeHtml(opts.meta.payment) }) : ''}
  </div>
  ${
    opts.lines?.length
      ? t('util.docExport.itemQtyUnitPrice', { rows })
      : ''
  }
  <div class="terms">${escapeHtml(opts.terms)}</div>
</body></html>`
}

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 保存为 Word（.doc，Office 可直接打开） */
export function exportWord(opts: {
  title: string
  meta?: { name?: string; category?: string; duration?: string; payment?: string }
  terms: string
  lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
  filename?: string
}) {
  const html = buildTemplateHtml(opts)
  const blob = new Blob(['﻿' + html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${opts.filename || opts.title || t('common.template')}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

/** 输出 PDF：新窗口打印/另存 PDF */
export function exportPdf(opts: {
  title: string
  meta?: { name?: string; category?: string; duration?: string; payment?: string }
  terms: string
  lines?: { name: string; qty: string; unitPrice: string; amount: string }[]
}) {
  const html = buildTemplateHtml(opts)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

/** 带鉴权打开/下载文件（避免 window.open 丢 token 401） */
export async function openAuthedFile(url: string, fileName?: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
  })
  if (!res.ok) throw new Error(t('util.docExport.downloadFailedHttp', { status: res.status }))
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = fileName || url.split('/').pop() || 'file'
  a.click()
  setTimeout(() => URL.revokeObjectURL(objUrl), 2000)
}

/** 模板占位符替换：打印时填入真实数据 */
export function fillTemplatePlaceholders(
  html: string,
  vars: Record<string, string | number | null | undefined>,
) {
  let out = String(html ?? '')
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v == null || v === '' ? '—' : String(v))
  }
  return out
}

/** 金额数字 → 人民币大写（合同用） */
export function toChineseAmount(n: number | string): string {
  const num = Number(n)
  if (!isFinite(num) || num < 0) return ''
  const D = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const U = ['', '拾', '佰', '仟']
  const BU = ['', '万', '亿', '万亿']

  const yuan = Math.floor(Math.abs(num))
  const jiao = Math.floor(Math.abs(num) * 10) % 10
  const fen = Math.floor(Math.abs(num) * 100) % 10

  const toYuan = (value: number): string => {
    if (value === 0) return '零'
    const sections: number[] = []
    let rest = value
    while (rest > 0) {
      sections.push(rest % 10000)
      rest = Math.floor(rest / 10000)
    }
    let out = ''
    for (let i = sections.length - 1; i >= 0; i--) {
      const sec = sections[i]
      const secStr = (() => {
        let s = ''
        let zero = false
        let rest = sec
        // 段内按千/百/十/个
        const arr: number[] = []
        for (let k = 0; k < 4; k++) {
          arr.unshift(rest % 10)
          rest = Math.floor(rest / 10)
        }
        // arr[0]=仟 ...
        for (let k = 0; k < 4; k++) {
          const d = arr[k]
          const unit = U[3 - k]
          if (d === 0) {
            if (s !== '') zero = true
          } else {
            if (zero) s += '零'
            s += D[d] + unit
            zero = false
          }
        }
        return s
      })()
      if (secStr) {
        // 段前有非零段且本段不足 4 位（前导零）→ 加「零」
        if (out !== '' && sec < 1000) out += '零'
        out += secStr + BU[i]
      } else if (out !== '') {
        // 中间全零段
        if (!out.endsWith('零')) out += '零'
      }
    }
    return out.replace(/零+$/, '').replace(/零+/g, '零')
  }

  let s = toYuan(yuan) + '元'
  if (jiao === 0 && fen === 0) s += '整'
  else {
    if (jiao > 0) s += D[jiao] + '角'
    else if (fen > 0) s += '零'
    if (fen > 0) s += D[fen] + '分'
    else s += '整'
  }
  return s
}

/** 下载 HTML 正文为 .doc（Word 可打开）或 .html */
export function downloadHtmlDoc(html: string, filename: string, kind: 'doc' | 'html' = 'doc') {
  const css = `
    body { font-family: 'Microsoft YaHei','PingFang SC',sans-serif; font-size: 12px; color:#1e293b; }
    table { border-collapse: collapse; width: 100%; }
    table td, table th { border: 1px solid #94a3b8; padding: 6px 8px; }
    h1,h2,h3 { text-align: center; }
  `
  const full =
    kind === 'doc'
      ? `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`
  const blob = new Blob(['\ufeff' + full], {
    type: kind === 'doc' ? 'application/msword' : 'text/html;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${kind === 'doc' ? 'doc' : 'html'}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
