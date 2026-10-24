import { Button, Space, Tooltip } from 'antd'
import { useEffect, useRef } from 'react'
import { t } from '../i18n'

/** 所见即所得富文本编辑器：contentEditable + execCommand，模板正文编辑用 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 280,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const skip = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (skip.current) {
      skip.current = false
      return
    }
    if (el.innerHTML !== value) {
      el.innerHTML = value || ''
    }
  }, [value])

  const emit = () => {
    const el = ref.current
    if (!el) return
    skip.current = true
    onChange(el.innerHTML)
  }

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  const insertHtml = (html: string) => {
    ref.current?.focus()
    document.execCommand('insertHTML', false, html)
    emit()
  }

  const tools: { label: string; title: string; run: () => void }[] = [
    { label: 'B', title: t('cmp.richTextEditor.bold'), run: () => cmd('bold') },
    { label: 'I', title: t('cmp.richTextEditor.italic'), run: () => cmd('italic') },
    { label: 'U', title: t('cmp.richTextEditor.underline'), run: () => cmd('underline') },
    { label: 'H1', title: t('cmp.richTextEditor.h1'), run: () => cmd('formatBlock', '<h1>') },
    { label: 'H2', title: t('cmp.richTextEditor.h2'), run: () => cmd('formatBlock', '<h2>') },
    { label: 'H3', title: t('cmp.richTextEditor.h3'), run: () => cmd('formatBlock', '<h3>') },
    { label: t('common.body'), title: t('cmp.richTextEditor.bodyParagraph'), run: () => cmd('formatBlock', '<p>') },
    { label: t('cmp.richTextEditor.list'), title: t('cmp.richTextEditor.bulletedList'), run: () => cmd('insertUnorderedList') },
    { label: t('cmp.richTextEditor.n1List'), title: t('cmp.richTextEditor.numberedList'), run: () => cmd('insertOrderedList') },
    { label: t('cmp.richTextEditor.left'), title: t('cmp.richTextEditor.alignLeft'), run: () => cmd('justifyLeft') },
    { label: t('common.medium2'), title: t('cmp.richTextEditor.center'), run: () => cmd('justifyCenter') },
    { label: t('cmp.richTextEditor.right'), title: t('cmp.richTextEditor.alignRight'), run: () => cmd('justifyRight') },
    { label: '—', title: t('cmp.richTextEditor.divider'), run: () => insertHtml('<hr/>') },
    { label: t('cmp.richTextEditor.indent'), title: t('cmp.richTextEditor.increaseIndent'), run: () => cmd('indent') },
    { label: t('cmp.richTextEditor.clear'), title: t('cmp.richTextEditor.clearFormatting'), run: () => cmd('removeFormat') },
    { label: t('cmp.richTextEditor.undo'), title: t('cmp.richTextEditor.undo'), run: () => cmd('undo') },
    { label: t('cmp.richTextEditor.redo'), title: t('cmp.richTextEditor.redo'), run: () => cmd('redo') },
    { label: t('cmp.richTextEditor.table'), title: t('cmp.richTextEditor.insertTwoColumnTable'), run: () =>
        insertHtml(
          t('cmp.richTextEditor.itemDescription'),
        ),
    },
  ]

  return (
    <div className="rte-root">
      <Space wrap style={{ marginBottom: 8 }}>
        {tools.map((t) => (
          <Tooltip key={t.title} title={t.title}>
            <Button size="small" onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
              {t.label}
            </Button>
          </Tooltip>
        ))}
      </Space>
      <div
        ref={ref}
        className="rte-edit"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder ?? t('cmp.richTextEditor.editTemplateBodyHere')}
        style={{
          minHeight,
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          padding: 12,
          lineHeight: 1.8,
          fontSize: 13,
          background: '#fff',
          overflow: 'auto',
        }}
        onInput={emit}
        onBlur={emit}
      />
    </div>
  )
}
