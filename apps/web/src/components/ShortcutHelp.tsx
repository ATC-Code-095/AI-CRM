import { Modal, Tag, Typography } from 'antd'
import { t } from '../i18n'

const ROWS: { keys: string[]; desc: string }[] = [
  { keys: ['⌘', 'K'], desc: t('cmp.shortcutHelp.openCommandPaletteSearch') },
  { keys: ['?'], desc: t('cmp.shortcutHelp.showThisHelp') },
  { keys: ['1'], desc: t('nav.home') },
  { keys: ['2'], desc: t('common.leads') },
  { keys: ['3'], desc: t('nav.accounts') },
  { keys: ['4'], desc: t('nav.opportunities') },
  { keys: ['5'], desc: t('nav.quotes') },
  { keys: ['6'], desc: t('nav.contracts') },
  { keys: ['7'], desc: t('nav.projects') },
  { keys: ['8'], desc: t('common.reportCenter') },
  { keys: ['9'], desc: t('common.todoCenter') },
  { keys: ['g', 'h'], desc: t('cmp.shortcutHelp.goToHome') },
  { keys: ['g', 'l'], desc: t('cmp.shortcutHelp.goToLeads') },
  { keys: ['g', 'a'], desc: t('cmp.shortcutHelp.goToAccounts') },
  { keys: ['g', 'o'], desc: t('cmp.shortcutHelp.goToDeals') },
  { keys: ['g', 'c'], desc: t('cmp.shortcutHelp.goToCalendar') },
  { keys: ['g', 'r'], desc: t('cmp.shortcutHelp.goToReportCenter') },
  { keys: ['g', 't'], desc: t('cmp.shortcutHelp.goToFollowUps') },
  { keys: ['c'], desc: t('cmp.shortcutHelp.quickCreateLeadAccount') },
  { keys: ['Esc'], desc: t('cmp.shortcutHelp.closeDialogDrawer') },
]

/**
 * 键盘快捷键帮助（对标 Salesforce「Keyboard Shortcuts」、GitHub 风格 g 组合键）
 */
export function ShortcutHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal title={t('cmp.shortcutHelp.keyboardShortcuts')} open={open} onCancel={onClose} footer={null} width={460}>
      <div className="crm-shortcut-list">
        {ROWS.map((r) => (
          <div className="crm-shortcut-row" key={r.desc}>
            <span className="crm-shortcut-keys">
              {r.keys.map((k) => (
                <Tag key={k} bordered={false} className="crm-kbd">
                  {k}
                </Tag>
              ))}
            </span>
            <span>{r.desc}</span>
          </div>
        ))}
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>{t('cmp.shortcutHelp.shortcutsAreDisabledWhile')}</Typography.Paragraph>
    </Modal>
  )
}

export default ShortcutHelp
