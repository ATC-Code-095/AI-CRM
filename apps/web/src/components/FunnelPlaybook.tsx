import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Collapse, Input, Space, Tag, Typography } from 'antd'
import { useState } from 'react'
import { api } from '../api/client'
import { t } from '../i18n'

const STAGE_SCRIPTS: {
  /** 与管道阶段名匹配用的中文名（数据） */
  stage: string
  /** 标准阶段码：优先按它匹配（阶段名可能被翻译或改名） */
  code: string
  label: string
  goal: string
  scripts: string[]
  checklist: string[]
}[] = [
  {
    stage: '初步接洽',
    code: 'PROSPECTING',
    label: t('cmp.funnelPlaybook.stage.initialContact'),
    goal: t('cmp.funnelPlaybook.buildTrustAndConfirm'),
    scripts: [
      t('cmp.funnelPlaybook.howDoesYourCompany'),
      t('cmp.funnelPlaybook.ifPainPointWere'),
    ],
    checklist: [t('cmp.funnelPlaybook.confirmDecisionChain'), t('cmp.funnelPlaybook.scheduleNextConversation'), t('cmp.funnelPlaybook.recordPainPoints')],
  },
  {
    stage: '需求确认',
    code: 'DISCOVERY',
    label: t('cmp.funnelPlaybook.stage.needsConfirmed'),
    goal: t('cmp.funnelPlaybook.lockBudgetAndDecision'),
    scripts: [
      t('cmp.funnelPlaybook.isThereAnApproved'),
      t('cmp.funnelPlaybook.besidesYouWhoElse'),
    ],
    checklist: [t('cmp.funnelPlaybook.budgetRange'), t('contacts.role.economic'), t('cmp.funnelPlaybook.successCriteria')],
  },
  {
    stage: '方案/报价',
    code: 'PROPOSAL',
    label: t('cmp.funnelPlaybook.stage.proposalQuote'),
    goal: t('cmp.funnelPlaybook.valuePropositionDifferentiation'),
    scripts: [
      t('cmp.funnelPlaybook.ourSolutionFitsYour'),
      t('cmp.funnelPlaybook.theQuoteIncludesImplementation'),
    ],
    checklist: [t('cmp.funnelPlaybook.solutionReview'), t('cmp.funnelPlaybook.quoteSent'), t('cmp.funnelPlaybook.competitiveResponse')],
  },
  {
    stage: '谈判',
    code: 'NEGOTIATION',
    label: t('cmp.funnelPlaybook.stage.negotiation'),
    goal: t('cmp.funnelPlaybook.tradeTermsDriveSigning'),
    scripts: [
      t('cmp.funnelPlaybook.ifSignedThisQuarter'),
      t('cmp.funnelPlaybook.weCanAdjustPayment'),
    ],
    checklist: [t('cmp.funnelPlaybook.discountApproval'), t('cmp.funnelPlaybook.legalTerms'), t('cmp.funnelPlaybook.signingDate')],
  },
  {
    stage: '赢单',
    code: 'WON',
    label: t('cmp.funnelPlaybook.stage.won'),
    goal: t('cmp.funnelPlaybook.handoverUpsell'),
    scripts: [t('cmp.funnelPlaybook.thankYouForYour')],
    checklist: [t('cmp.funnelPlaybook.archiveContract'), t('cmp.funnelPlaybook.implementationHandover'), t('cmp.funnelPlaybook.upsellOpportunities')],
  },
  {
    stage: '输单',
    code: 'LOST',
    label: t('cmp.funnelPlaybook.stage.lost'),
    goal: t('cmp.funnelPlaybook.reviewWinBack'),
    scripts: [t('cmp.funnelPlaybook.couldYouShareThe')],
    checklist: [t('common.lossReason'), t('cmp.funnelPlaybook.competitorNotes'), t('cmp.funnelPlaybook.followUpIn3')],
  },
]

/** 漏斗阶段剧本（对标 Salesforce Path / 销售方法论 Playbook） */
export function FunnelPlaybook({
  accountId,
  currentStage,
  currentStageCode,
}: {
  accountId?: string
  currentStage?: string
  currentStageCode?: string
} = {}) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [customText, setCustomText] = useState('')
  const [customScripts, setCustomScripts] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('crm.playbook.custom') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const matched =
    STAGE_SCRIPTS.find((s) => currentStageCode && s.code === currentStageCode) ??
    STAGE_SCRIPTS.find((s) =>
      currentStage ? s.stage.includes(currentStage) || currentStage.includes(s.stage.slice(0, 2)) : false,
    )
  const [history, setHistory] = useState<{ at: string; count: number }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('crm.playbook.history') ?? '[]') as {
        at: string
        count: number
      }[]
    } catch {
      return []
    }
  })
  const saveWithHistory = (next: string[]) => {
    setCustomScripts(next)
    const hist = [{ at: new Date().toISOString(), count: next.length }, ...history].slice(0, 8)
    setHistory(hist)
    try {
      localStorage.setItem('crm.playbook.custom', JSON.stringify(next))
      localStorage.setItem('crm.playbook.history', JSON.stringify(hist))
    } catch {
      /* ignore */
    }
  }
  const addCustom = () => {
    const text = customText.trim()
    if (!text) return
    saveWithHistory([text, ...customScripts].slice(0, 20))
    setCustomText('')
    message.success(t('cmp.funnelPlaybook.addedToCustomPlaybook'))
  }
  const shareCustom = () => {
    void api('/preferences', {
      method: 'PUT',
      body: JSON.stringify({
        key: 'shared.playbook.custom',
        value: customScripts,
      }),
    })
      .then(() => message.success(t('common.sharedWithTeam')))
      .catch((e: Error) => message.error(e.message))
  }
  const loadTeam = () => {
    void api<{ items: { ownerName: string; value: string[] }[] }>(
      '/preferences/shared?key=shared.playbook.custom',
    )
      .then((r) => {
        const all = r.items.flatMap((x) => x.value ?? [])
        const merged = Array.from(new Set([...customScripts, ...all])).slice(0, 30)
        setCustomScripts(merged)
        try {
          localStorage.setItem('crm.playbook.custom', JSON.stringify(merged))
        } catch {
          /* ignore */
        }
        message.success(t('cmp.funnelPlaybook.loadedTeamPlaybookItems', { length: all.length }))
      })
      .catch((e: Error) => message.error(e.message))
  }
  const writeFollow = useMutation({
    mutationFn: (s: (typeof STAGE_SCRIPTS)[number]) =>
      api('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'TASK',
          subject: t('cmp.funnelPlaybook.playbookFollowUp', { stage: s.label }),
          content: [t('cmp.funnelPlaybook.goal', { goal: s.goal }), t('cmp.funnelPlaybook.talkTrack', { v: s.scripts.join(' ') }), t('cmp.funnelPlaybook.checks', { v: s.checklist.join(' / ') })].join(
            '\n',
          ),
          entityType: 'ACCOUNT',
          entityId: accountId ?? '',
          status: 'PLANNED',
          dueAt: new Date(Date.now() + 86400000).toISOString(),
        }),
      }),
    onSuccess: () => {
      message.success(t('cmp.funnelPlaybook.followUpTaskCreated'))
      void qc.invalidateQueries({ queryKey: ['activities'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: Error) => message.error(e.message),
  })

  return (
    <Card size="small" title={t('cmp.funnelPlaybook.funnelStagePlaybook')} style={{ marginBottom: 12 }}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>{t('cmp.funnelPlaybook.goalsReferenceTalkTracks')}</Typography.Paragraph>
      {matched && (
        <div
          style={{
            background: '#eef2ff',
            border: '1px solid #c7d2fe',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 10,
            fontSize: 12,
          }}
        >
          <Tag color="blue">{t('cmp.funnelPlaybook.smartPick')}</Tag>{t('cmp.funnelPlaybook.currentStage')}{currentStage}{t('cmp.funnelPlaybook.suggestedPlaybook')}<b>{matched.label}</b> — {matched.goal}
          <Button
            size="small"
            type="primary"
            style={{ marginLeft: 8 }}
            loading={writeFollow.isPending}
            onClick={() => writeFollow.mutate(matched)}
          >{t('cmp.funnelPlaybook.adoptLogFollowUp')}</Button>
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('cmp.funnelPlaybook.customPlaybookLibrary')}</div>
        <Space.Compact style={{ width: '100%', marginBottom: 6 }}>
          <Button size="small" onClick={shareCustom}>{t('cmp.funnelPlaybook.shareWithTeam')}</Button>
          <Button size="small" onClick={loadTeam}>{t('cmp.funnelPlaybook.loadTeam')}</Button>
        </Space.Compact>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="small"
            placeholder={t('cmp.funnelPlaybook.enterACustomTalk')}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            onPressEnter={addCustom}
          />
          <Button size="small" onClick={addCustom}>{t('common.add')}</Button>
        </Space.Compact>
        {customScripts.map((script, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: '#475569',
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>· {script}</span>
            <Button
              size="small"
              type="text"
              danger
              onClick={() => {
                saveWithHistory(customScripts.filter((_, j) => j !== i))
              }}
            >{t('common.del')}</Button>
          </div>
        ))}
        {history.length > 0 && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{t('cmp.funnelPlaybook.versionHistory')}{history
              .slice(0, 3)
              .map((h) => t('cmp.funnelPlaybook.items', { count: h.count, v: h.at.slice(5, 10) }))
              .join(' · ')}
            <Button
              size="small"
              type="link"
              onClick={() => {
                // 回滚到上一版本（删掉最近一次）
                const prev = history[1]
                if (!prev) {
                  message.info(t('cmp.funnelPlaybook.alreadyTheEarliestVersion'))
                  return
                }
                saveWithHistory(customScripts.slice(1))
                message.success(t('cmp.funnelPlaybook.rolledBackKeepingVersions', { count: prev.count }))
              }}
            >{t('cmp.funnelPlaybook.rollBack')}</Button>
          </div>
        )}
      </div>
      <Collapse
        size="small"
        items={STAGE_SCRIPTS.map((s) => ({
          key: s.stage,
          label: (
            <span>
              <Tag color="blue">{s.label}</Tag>
              {s.goal}
            </span>
          ),
          children: (
            <div style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('common.referenceTalkTracks')}</div>
              {s.scripts.map((script) => (
                <div key={script} style={{ marginBottom: 4, color: '#475569' }}>
                  · {script}
                </div>
              ))}
              <div style={{ fontWeight: 600, margin: '8px 0 4px' }}>{t('cmp.funnelPlaybook.checklist')}</div>
              <Space wrap size={6}>
                {s.checklist.map((c) => (
                  <Tag key={c}>{c}</Tag>
                ))}
              </Space>
              <div style={{ marginTop: 10 }}>
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    loading={writeFollow.isPending}
                    onClick={() => writeFollow.mutate(s)}
                  >{t('cmp.funnelPlaybook.writeFollowUp')}</Button>
                  <Button
                    size="small"
                    onClick={() => {
                      const text = [`【${s.label}】${s.goal}`, ...s.scripts.map((script) => `· ${script}`), t('cmp.funnelPlaybook.checks', { v: s.checklist.join(' / ') })].join('\n')
                      void navigator.clipboard.writeText(text)
                      message.success(t('cmp.funnelPlaybook.playbookCopied'))
                    }}
                  >{t('cmp.funnelPlaybook.copyPlaybook')}</Button>
                </Space>
              </div>
            </div>
          ),
        }))}
      />
    </Card>
  )
}
