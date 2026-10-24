import { useQuery } from '@tanstack/react-query'
import { Alert, Card, Spin, Tabs } from 'antd'
import { Children, isValidElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUrlState } from '../../hooks/useUrlState'
import { i18n, t } from '../../i18n'

/** 手册来源：docs/manual（中文）与 docs/manual/en（英文），构建时复制到 /manual，见 vite.config.ts manualPlugin */
const DOCS = [
  { key: 'user', label: t('help.userManual'), file: 'user-manual.md' },
  { key: 'admin', label: t('help.adminManual'), file: 'admin-manual.md' },
] as const

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : ''))
    .join('')
}

/** 与 GitHub 渲染 Markdown 时的标题锚点一致，手册目录里的 #链接 才能对上 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

/** 截图懒加载，加载后会撑高页面、使目标位置漂移：先跳转，再随图片加载重新对齐几次 */
function scrollToId(id: string) {
  const go = () => document.getElementById(id)?.scrollIntoView({ block: 'start' })
  go()
  for (const t of [300, 800, 1500]) setTimeout(go, t)
}

/** 英文界面读 en/ 下的手册；截图路径相对手册所在目录 */
function manualDir(): string {
  return (i18n.resolvedLanguage || i18n.language) === 'en-US' ? 'en/' : ''
}

export default function HelpPage() {
  const [doc, setDoc] = useUrlState('doc')
  const current = DOCS.find((d) => d.key === doc) ?? DOCS[0]
  const dir = manualDir()

  const mdQ = useQuery({
    queryKey: ['manual', dir, current.file],
    queryFn: async () => {
      const res = await fetch(`/manual/${dir}${current.file}`)
      if (!res.ok) throw new Error(t('help.failedToLoadManual', { status: res.status }))
      return res.text()
    },
    staleTime: 5 * 60_000,
  })

  const heading =
    (Tag: 'h1' | 'h2' | 'h3' | 'h4'): Components['h1'] =>
    ({ children }) => <Tag id={slugify(textOf(children))}>{children}</Tag>

  const components: Components = {
    h1: heading('h1'),
    h2: heading('h2'),
    h3: heading('h3'),
    h4: heading('h4'),
    img: ({ src, alt }) => (
      <img src={src && !/^(https?:)?\//.test(src) ? `/manual/${dir}${src}` : src} alt={alt ?? ''} loading="lazy" />
    ),
    a: ({ href = '', children }) => {
      if (href.startsWith('#')) {
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              scrollToId(decodeURIComponent(href.slice(1)))
            }}
          >
            {children}
          </a>
        )
      }
      const target = DOCS.find((d) => href.split('#')[0].endsWith(d.file))
      if (target) {
        return (
          <a
            href={`?doc=${target.key}`}
            onClick={(e) => {
              e.preventDefault()
              setDoc(target.key)
              window.scrollTo({ top: 0 })
            }}
          >
            {children}
          </a>
        )
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
  }

  return (
    <Card size="small" className="crm-manual-card">
      <Tabs
        activeKey={current.key}
        onChange={(k) => setDoc(k)}
        items={DOCS.map((d) => ({ key: d.key, label: d.label }))}
      />
      {mdQ.isLoading && (
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin />
        </div>
      )}
      {mdQ.error && <Alert type="error" showIcon message={(mdQ.error as Error).message} />}
      {mdQ.data && (
        <article className="crm-manual">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {mdQ.data}
          </ReactMarkdown>
        </article>
      )}
    </Card>
  )
}
