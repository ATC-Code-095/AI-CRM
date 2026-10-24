import { useMutation } from '@tanstack/react-query'
import { App, Button, Drawer, Empty, Segmented, Space, Spin, Tag, Typography } from 'antd'
import {
  BulbOutlined,
  CopyOutlined,
  FileSearchOutlined,
  PlusOutlined,
  RobotOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, isLoggedIn } from '../api/client'
import { EntityPicker } from './EntityPicker'
import { useUiLocale } from '../hooks/useUiLocale'
import { t } from '../i18n'

type EntityType = 'OPPORTUNITY' | 'ACCOUNT' | 'LEAD'
type Action = 'summary' | 'next' | 'risk' | 'coach'

interface Result {
  action: Action
  title: string
  content?: string
  list?: string[]
  scripts?: string[]
  level?: 'LOW' | 'MEDIUM' | 'HIGH'
}

const LEVEL_META: Record<string, { label: string; color: string }> = {
  LOW: { label: t('cmp.aiAssistant.lowRisk'), color: 'green' },
  MEDIUM: { label: t('cmp.aiAssistant.mediumRisk'), color: 'orange' },
  HIGH: { label: t('cmp.aiAssistant.highRisk'), color: 'red' },
}

/**
 * 全局 AI 助手（对标 Salesforce Einstein / HubSpot Breeze / 纷享销客 AI 助手）
 * 选中对象后可：生成摘要、下一步建议、风险预警、销售教练话术；
 * 结论可一键复制，或直接转成一条跟进记录。
 */
export function AiAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const loc = useLocation()
  const locale = useUiLocale()
  const [type, setType] = useState<EntityType>('OPPORTUNITY')
  const [entity, setEntity] = useState<{ entityType: string; entityId: string } | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState<Action | null>(null)

  // 在详情页打开时自动带入当前对象
  useEffect(() => {
    if (!open) return
    const m = loc.pathname.match(/^\/(opportunities|accounts|leads)\/([^/]+)/)
    if (m) {
      const map: Record<string, EntityType> = {
        opportunities: 'OPPORTUNITY',
        accounts: 'ACCOUNT',
        leads: 'LEAD',
      }
      setType(map[m[1]])
      setEntity({ entityType: map[m[1]], entityId: m[2] })
    }
  }, [open, loc.pathname])

  const run = async (action: Action) => {
    if (!entity?.entityId) {
      message.warning(t('cmp.aiAssistant.selectAnObjectTo'))
      return
    }
    if (action !== 'summary' && entity.entityType !== 'OPPORTUNITY') {
      message.warning(t('cmp.aiAssistant.nextStepsRiskCoaching'))
      return
    }
    setBusy(action)
    try {
      if (action === 'summary') {
        const r = await api<{ content: string }>('/ai/summarize', {
          method: 'POST',
          body: JSON.stringify({ entityType: entity.entityType, entityId: entity.entityId }),
        })
        setResults((prev) => [
          { action, title: t('cmp.aiAssistant.smartSummary'), content: r.content },
          ...prev.filter((p) => p.action !== action),
        ])
      } else if (action === 'next') {
        const r = await api<{ suggestions: string[] }>('/ai/suggest-next', {
          method: 'POST',
          body: JSON.stringify({ opportunityId: entity.entityId }),
        })
        setResults((prev) => [
          { action, title: t('cmp.aiAssistant.nextSteps'), list: r.suggestions },
          ...prev.filter((p) => p.action !== action),
        ])
      } else if (action === 'risk') {
        const r = await api<{ level: 'LOW' | 'MEDIUM' | 'HIGH'; reasons: string[] }>('/ai/risk', {
          method: 'POST',
          body: JSON.stringify({ opportunityId: entity.entityId }),
        })
        setResults((prev) => [
          { action, title: t('cmp.aiAssistant.riskAlerts'), level: r.level, list: r.reasons },
          ...prev.filter((p) => p.action !== action),
        ])
      } else {
        const r = await api<{ tips: string[]; scripts: string[] }>(
          `/reports/sales-coach/${entity.entityId}`,
        )
        setResults((prev) => [
          { action, title: t('cmp.aiAssistant.salesCoach'), list: r.tips, scripts: r.scripts },
          ...prev.filter((p) => p.action !== action),
        ])
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('cmp.aiAssistant.aiRequestFailed'))
    } finally {
      setBusy(null)
    }
  }

  const toActivityM = useMutation({
    mutationFn: (content: string) =>
      api('/activities', {
        method: 'POST',
        body: JSON.stringify({
          type: 'NOTE',
          subject: t('cmp.aiAssistant.aiSuggestedFollowUp'),
          content,
          entityType: entity?.entityType ?? 'ACCOUNT',
          entityId: entity?.entityId ?? '',
        }),
      }),
    onSuccess: () => message.success(t('cmp.aiAssistant.followUpCreated')),
    onError: (e: Error) => message.error(e.message),
  })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success(t('common.copied'))
    } catch {
      message.warning(t('cmp.aiAssistant.copyFailedPleaseSelect'))
    }
  }

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined style={{ color: 'var(--crm-accent)' }} />{t('feature.ai')}<Tag bordered={false} color="blue">
            {locale === 'zh-CN' ? t('common.langZh') : 'EN'}
          </Tag>
        </Space>
      }
      open={open}
      onClose={onClose}
      width={480}
      destroyOnHidden
    >
      <div className="crm-ai-section">
        <div className="crm-muted" style={{ marginBottom: 6 }}>{t('cmp.aiAssistant.selectAnObjectTo2')}</div>
        <Segmented
          size="small"
          block
          value={type}
          onChange={(v) => {
            setType(v as EntityType)
            setEntity(null)
            setResults([])
          }}
          options={[
            { label: t('nav.opportunities'), value: 'OPPORTUNITY' },
            { label: t('nav.accounts'), value: 'ACCOUNT' },
            { label: t('nav.leads'), value: 'LEAD' },
          ]}
        />
        <div style={{ marginTop: 8 }}>
          <EntityPicker value={entity} onChange={(v) => setEntity(v)} />
        </div>
      </div>

      <div className="crm-ai-actions">
        <Button
          type="primary"
          icon={<FileSearchOutlined />}
          loading={busy === 'summary'}
          disabled={!isLoggedIn()}
          onClick={() => void run('summary')}
        >{t('cmp.aiAssistant.generateSummary')}</Button>
        <Button
          icon={<BulbOutlined />}
          loading={busy === 'next'}
          onClick={() => void run('next')}
          disabled={type !== 'OPPORTUNITY'}
        >{t('cmp.aiAssistant.nextSteps')}</Button>
        <Button
          icon={<WarningOutlined />}
          loading={busy === 'risk'}
          onClick={() => void run('risk')}
          disabled={type !== 'OPPORTUNITY'}
        >{t('cmp.aiAssistant.riskAlerts')}</Button>
        <Button
          icon={<RobotOutlined />}
          loading={busy === 'coach'}
          onClick={() => void run('coach')}
          disabled={type !== 'OPPORTUNITY'}
        >{t('cmp.aiAssistant.salesCoach')}</Button>
      </div>

      {busy && (
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <Spin size="small" /> <span className="crm-muted">{t('cmp.aiAssistant.analyzing')}</span>
        </div>
      )}

      {!results.length && !busy ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={t('cmp.aiAssistant.selectAnObjectAnd')}
          style={{ marginTop: 24 }}
        />
      ) : null}

      {results.map((r) => (
        <div className="crm-ai-card" key={r.action}>
          <div className="crm-ai-card-head">
            <b>{r.title}</b>
            {r.level ? (
              <Tag color={LEVEL_META[r.level]?.color}>{LEVEL_META[r.level]?.label ?? r.level}</Tag>
            ) : null}
          </div>
          {r.content ? (
            <Typography.Paragraph style={{ marginBottom: 8 }}>{r.content}</Typography.Paragraph>
          ) : null}
          {r.list?.length ? (
            <ul className="crm-ai-list">
              {r.list.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : null}
          {r.scripts?.length ? (
            <div className="crm-ai-script">
              {r.scripts.map((s, i) => (
                <div key={i}>
                  <Tag bordered={false}>{t('cmp.aiAssistant.talkTrack')}</Tag>
                  {s}
                </div>
              ))}
            </div>
          ) : null}
          <Space size={6} style={{ marginTop: 8 }} wrap>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() =>
                void copy(
                  [r.content, ...(r.list ?? []), ...(r.scripts ?? [])].filter(Boolean).join('\n'),
                )
              }
            >{t('cmp.aiAssistant.copy')}</Button>
            <Button
              size="small"
              icon={<PlusOutlined />}
              loading={toActivityM.isPending}
              onClick={() =>
                toActivityM.mutate(
                  [r.content, ...(r.list ?? []), ...(r.scripts ?? [])].filter(Boolean).join('\n'),
                )
              }
            >{t('common.createFollowUp')}</Button>
            {entity ? (
              <Link to={`/reports`}>
                <Button size="small" type="text">{t('cmp.aiAssistant.verifyDataInReports')}</Button>
              </Link>
            ) : null}
          </Space>
        </div>
      ))}
    </Drawer>
  )
}

export default AiAssistant
