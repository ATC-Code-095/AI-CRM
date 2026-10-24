import { useMutation, useQuery } from '@tanstack/react-query'
import { App, Avatar, Button, Card, Space, Switch, Tag, Typography } from 'antd'
import {
  ApiOutlined,
  BellOutlined,
  CalendarOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  DeleteOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, clearTokens, getAccessToken, isLoggedIn } from '../../api/client'
import { ACCENT_PRESETS, useUiMode } from '../../hooks/useUiTheme'
import { setUiLocale, useUiLocale } from '../../hooks/useUiLocale'
import { clearDrafts, getLastSync, loadDrafts, removeDraft, syncDrafts } from '../../utils/offlineDraft'
import { t } from '../../i18n'
import { stopNativePush } from '../../utils/nativePush'
import { IdentityBindings } from './IdentityBindings'

interface Me {
  id: string
  name: string
  email: string
  roles?: string[]
  dataScope?: string
  departmentId?: string | null
  locale?: string
  timezone?: string
  permissions?: string[]
}

/**
 * 我的（移动端底部 Tab「我的」/ 桌面端个人中心）
 * 账号信息 + 外观偏好 + 离线草稿同步 + 常用管理入口。
 */
export default function MePage() {
  const { message, modal } = App.useApp()
  const nav = useNavigate()
  const locale = useUiLocale()
  const { dark, setMode, accent, setAccent } = useUiMode()
  const [drafts, setDrafts] = useState(() => loadDrafts())
  const [lastSync, setLastSync] = useState<string | null>(() => getLastSync())

  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    enabled: isLoggedIn(),
    retry: false,
  })

  const cached = (() => {
    try {
      return JSON.parse(localStorage.getItem('me_cache') || '{}') as Partial<Me>
    } catch {
      return {}
    }
  })()

  const me: Partial<Me> = meQ.data ?? cached

  useEffect(() => {
    setDrafts(loadDrafts())
  }, [])

  const syncM = useMutation({
    mutationFn: () =>
      syncDrafts((kind: string, payload: Record<string, unknown>) =>
        api(kind === 'activity' ? '/activities' : `/${kind}s`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      ),
    onSuccess: (r: { ok: number; failed: number }) => {
      setDrafts(loadDrafts())
      setLastSync(getLastSync())
      message.success(t('me.syncCompleteSucceeded', { ok: r.ok, v: r.failed ? t('common.failed', { failed: r.failed }) : '' }))
    },
    onError: (e: Error) => message.error(e.message),
  })

  const logout = () => {
    modal.confirm({
      title: t('common.logout'),
      content: t('me.signOutOfThis'),
      okText: t('me.signOut'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await stopNativePush()
        clearTokens()
        localStorage.removeItem('me_cache')
        nav('/login')
      },
    })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="crm-me-header">
        <Avatar size={52} style={{ background: 'rgba(255,255,255,0.22)', fontSize: 22 }}>
          {(me.name ?? 'U').slice(0, 1)}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <div className="crm-me-name">{me.name ?? t('common.user')}</div>
          <div className="crm-me-sub">
            {me.email ?? '-'} · {me.roles?.[0] ?? 'USER'}
            {me.departmentId ? t('me.department', { v: String(me.departmentId).slice(-6) }) : ''}
          </div>
          <div className="crm-me-sub">{t('me.dataScopePermissionsToken', { v: me.dataScope ?? '-', v2: me.permissions?.length ?? 0, v3: ' ' })}
            {getAccessToken() ? t('me.valid') : t('me.expired')}
          </div>
        </div>
      </div>

      <Card size="small" title={t('me.appearance')} className="crm-panel-fixed crm-panel-sm">
        <div className="crm-me-row">
          <span>{t('common.language')}</span>
          <Space size={6}>
            <Button
              size="small"
              type={locale === 'zh-CN' ? 'primary' : 'default'}
              onClick={() => setUiLocale('zh-CN')}
            >{t('common.langZh')}</Button>
            <Button
              size="small"
              type={locale === 'en-US' ? 'primary' : 'default'}
              onClick={() => setUiLocale('en-US')}
            >
              English
            </Button>
          </Space>
        </div>
        <div className="crm-me-row">
          <span>{t('theme.dark')}</span>
          <Switch checked={dark} onChange={(v) => setMode(v ? 'dark' : 'light')} />
        </div>
        <div className="crm-me-row">
          <span>{t('theme.accent')}</span>
          <Space size={8}>
            {Object.entries(ACCENT_PRESETS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                title={p.label}
                aria-label={p.label}
                className={`crm-theme-dot${accent === key ? ' active' : ''}`}
                style={{ background: p.accent }}
                onClick={() => setAccent(key)}
              >
                {accent === key ? '✓' : ''}
              </button>
            ))}
          </Space>
        </div>
      </Card>

      <Card
        size="small"
        title={t('me.offlineDrafts', { v: drafts.length ? `(${drafts.length})` : '' })}
        className="crm-panel-fixed"
        style={{ marginTop: 16 }}
        extra={
          <Space size={6}>
            <Button
              size="small"
              icon={<CloudSyncOutlined />}
              loading={syncM.isPending}
              disabled={!drafts.length}
              onClick={() => syncM.mutate()}
            >{t('common.syncNow')}</Button>
            <Button
              size="small"
              danger
              disabled={!drafts.length}
              onClick={() => {
                clearDrafts()
                setDrafts([])
                message.success(t('me.draftsCleared'))
              }}
            >{t('common.clear')}</Button>
          </Space>
        }
      >
        {lastSync ? (
          <div className="crm-muted" style={{ marginBottom: 8 }}>{t('me.lastSynced', { v: new Date(lastSync).toLocaleString('zh-CN') })}
          </div>
        ) : null}
        {drafts.length ? (
          drafts.map((d) => (
            <div className="crm-me-row" key={d.id}>
              <span>
                <Tag color="orange">{d.kind}</Tag>
                {String(d.payload.subject ?? d.payload.name ?? d.id)}
                <span className="crm-muted" style={{ marginLeft: 8 }}>
                  {new Date(d.createdAt).toLocaleString('zh-CN')}
                </span>
              </span>
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  removeDraft(d.id)
                  setDrafts(loadDrafts())
                }}
              />
            </div>
          ))
        ) : (
          <div className="crm-muted">{t('me.noOfflineDraftsFollow')}</div>
        )}
      </Card>

      <IdentityBindings />

      <Card size="small" title={t('home.quickActions')} className="crm-panel-fixed" style={{ marginTop: 16 }}>
        <div className="crm-grid crm-cols-2 crm-h-auto" style={{ marginBottom: 0 }}>
          <Link to="/notifications">
            <Button block icon={<BellOutlined />}>{t('common.notificationCenter')}</Button>
          </Link>
          <Link to="/approvals">
            <Button block icon={<CheckCircleOutlined />}>{t('common.awaitingMe')}</Button>
          </Link>
          <Link to="/calendar">
            <Button block icon={<CalendarOutlined />}>{t('me.myCalendar')}</Button>
          </Link>
          <Link to="/activities">
            <Button block icon={<CloudSyncOutlined />}>{t('me.myFollowUps')}</Button>
          </Link>
          <Link to="/reports">
            <Button block icon={<AuditOutlined />}>{t('common.reportCenter')}</Button>
          </Link>
          <Link to="/tokens">
            <Button block icon={<SafetyCertificateOutlined />}>
              API Token
            </Button>
          </Link>
          <Link to="/docs">
            <Button block icon={<ApiOutlined />}>{t('nav.docs')}</Button>
          </Link>
          <Link to="/settings">
            <Button block icon={<SettingOutlined />}>{t('common.settings')}</Button>
          </Link>
        </div>
        <Button
          block
          danger
          icon={<LogoutOutlined />}
          style={{ marginTop: 12 }}
          onClick={logout}
        >{t('common.logout')}</Button>
      </Card>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12 }}>{t('me.zhixiaoCrmAiSales', { __APP_VERSION__, __APP_COMMIT__, v: ' ', v2: me.timezone ?? 'Asia/Shanghai' })}
      </Typography.Paragraph>
    </div>
  )
}
