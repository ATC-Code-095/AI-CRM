import { Alert, App, Avatar, Badge, Button, Drawer, Dropdown, FloatButton, Grid, Input, Layout, Menu, Space, Spin, Tooltip } from 'antd'
import {
  BgColorsOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  HomeOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  PhoneOutlined,
  TeamOutlined,
  RiseOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Suspense, useEffect, useMemo, useState, startTransition, useCallback } from 'react'
import { api, clearTokens, isLoggedIn } from '../api/client'
import { setUiLocale, useUiLocale } from '../hooks/useUiLocale'
import { ACCENT_PRESETS, useUiMode } from '../hooks/useUiTheme'
import { NotificationBell } from '../components/NotificationBell'
import { GlobalSearch } from '../components/GlobalSearch'
import { CommandPalette, CommandTrigger, pushRecent, readRecent } from '../components/CommandPalette'
import { ShortcutHelp } from '../components/ShortcutHelp'
import { QuickCreateButton } from '../components/QuickCreateButton'
import { NAV_GROUPS, NAV_LABELS, menuKeyFor, navLabelFor } from '../navigation'
import { startNativePush, stopNativePush } from '../utils/nativePush'

const { Header, Sider, Content, Footer } = Layout
const { useBreakpoint } = Grid

const NAV_LABEL = NAV_LABELS

type MenuItem = Required<MenuProps>['items'][number]

export default function AppShell() {
  const { t } = useTranslation()
  const locale = useUiLocale()
  const { dark, setMode, accent, setAccent } = useUiMode()
  const loc = useLocation()
  const nav = useNavigate()
  const { message } = App.useApp()
  /** 懒加载路由切换包在 transition 里，避免 React #426（同步输入中 Suspense） */
  const safeNav = useCallback(
    (to: string) => {
      startTransition(() => {
        nav(to)
      })
    },
    [nav],
  )
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const me = JSON.parse(localStorage.getItem('me_cache') || '{}') as {
    name?: string
    roles?: string[]
    email?: string
  }
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('crm.menuCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuQuery, setMenuQuery] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v)
    try {
      localStorage.setItem('crm.menuCollapsed', v ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const todoQ = useQuery({
    queryKey: ['menu-badges'],
    queryFn: () =>
      api<{
        approvals: number
        pendingSign: number
        expiring7: number
        expiring30: number
        overduePay: number
        overdueLead: number
        unread: number
        contracts: number
      }>('/reports/menu-badges'),
    enabled: isLoggedIn(),
    retry: false,
    refetchInterval: 60_000,
  })
  const badges = todoQ.data
  const todoCount = badges?.approvals ?? 0
  const contractBadge = badges?.contracts ?? 0
  const leadBadge = badges?.overdueLead ?? 0
  const notifyBadge = badges?.unread ?? 0
  const payBadge = badges?.overduePay ?? 0

  const badgeLabel = (label: string, count: number) => (
    <span className="crm-menu-badge-wrap">
      {label}
      {count > 0 && (
        <span className="crm-menu-badge">{count > 99 ? '99+' : count}</span>
      )}
    </span>
  )

  // 手机 App 内：注册推送，点击推送跳到对应单据（网页中不执行）
  useEffect(() => {
    startNativePush((to) => nav(to))
  }, [nav])

  // 全局键盘快捷键：? 帮助、g+字母 跳转、c 快捷新建
  useEffect(() => {
    let gPrefix = false
    let gTimer: ReturnType<typeof setTimeout> | undefined
    const GO: Record<string, string> = {
      h: '/home',
      l: '/leads',
      a: '/accounts',
      o: '/opportunities',
      c: '/calendar',
      r: '/reports',
      t: '/activities',
      n: '/notifications',
    }
    /** 数字键 1-9 直达常用页面 */
    const NUM: Record<string, string> = {
      '1': '/home',
      '2': '/leads',
      '3': '/accounts',
      '4': '/opportunities',
      '5': '/quotes',
      '6': '/contracts',
      '7': '/projects',
      '8': '/reports',
      '9': '/todos',
    }
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName?.toLowerCase() ?? ''
      const typing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        el?.isContentEditable === true
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen((v) => !v)
        return
      }
      if (gPrefix) {
        const path = GO[e.key.toLowerCase()]
        gPrefix = false
        if (gTimer) clearTimeout(gTimer)
        if (path) {
          e.preventDefault()
          safeNav(path)
        }
        return
      }
      if (e.key.toLowerCase() === 'g') {
        gPrefix = true
        gTimer = setTimeout(() => {
          gPrefix = false
        }, 1500)
        return
      }
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('crm:quick-create'))
        return
      }
      if (NUM[e.key]) {
        e.preventDefault()
        safeNav(NUM[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (gTimer) clearTimeout(gTimer)
    }
  }, [safeNav])

  // 记录最近访问，供 ⌘K 命令面板「最近访问」使用
  useEffect(() => {
    const parts = loc.pathname.split('/').filter(Boolean)
    const label = NAV_LABEL[parts[parts.length - 1]] ?? NAV_LABEL[parts[0]] ?? loc.pathname
    if (loc.pathname !== '/login') pushRecent(loc.pathname, label)
  }, [loc.pathname])

  const crumbs = useMemo(() => {
    const parts = loc.pathname.split('/').filter(Boolean)
    return parts.map((p, i) => ({
      key: p + i,
      label: NAV_LABEL[p] ?? p,
      path: '/' + parts.slice(0, i + 1).join('/'),
    }))
  }, [loc.pathname])

  // 待办到期提醒：每 5 分钟轮询一次
  useEffect(() => {
    if (!isLoggedIn()) return
    const check = () => {
      void api<{ total: number }>('/approvals/todo?pageSize=1')
        .then((r) => {
          if ((r.total ?? 0) > 0) {
            message.info(t('shell.youHavePendingApprovals', { total: r.total }))
          }
        })
        .catch(() => undefined)
    }
    const timer = window.setInterval(check, 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [message, t])

  const themeOptions = [
    ...Object.entries(ACCENT_PRESETS).map(([key, p]) => ({
      key,
      label: (
        <Space>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: p.accent,
              display: 'inline-block',
              boxShadow: key === accent ? `0 0 0 2px ${p.accent}55` : undefined,
            }}
          />
          {p.label}
          {key === accent ? t('shell.current') : ''}
        </Space>
      ),
      color: p.accent,
      active: key === accent,
    })),
    {
      key: 'mode-toggle',
      label: dark ? t('shell.switchToLightMode') : t('shell.switchToDarkMode'),
      color: dark ? '#fbbf24' : '#64748b',
      active: false,
    },
  ]

  const applyTheme = (key: string) => {
    if (key === 'mode-toggle') {
      setMode(dark ? 'light' : 'dark')
      return
    }
    setAccent(key)
  }

  /** 菜单搜索：命中 label / 拼音 keywords / 路径，支持多词与缩写 */
  const searchItems = useMemo<MenuItem[]>(() => {
    const raw = menuQuery.trim().toLowerCase()
    const terms = raw.split(/\s+/).filter(Boolean)
    const hits: MenuItem[] = []
    if (terms.length) {
      for (const g of NAV_GROUPS) {
        for (const i of g.items) {
          const hay = `${i.label} ${i.labelKey ? t(i.labelKey) : ''} ${i.keywords ?? ''} ${i.key}`.toLowerCase()
          if (!terms.every((term) => hay.includes(term))) continue
          const text = i.labelKey ? String(t(i.labelKey)) : i.label
          const idx = text.toLowerCase().indexOf(terms[0])
          const label =
            idx >= 0 ? (
              <span className="crm-menu-hit">
                {text.slice(0, idx)}
                <mark style={{ background: 'rgba(253,224,71,0.35)', color: 'inherit', borderRadius: 2 }}>
                  {text.slice(idx, idx + terms[0].length)}
                </mark>
                {text.slice(idx + terms[0].length)}
                <em>{g.labelKey ? t(g.labelKey) : g.label}</em>
              </span>
            ) : (
              <span className="crm-menu-hit">
                {text}
                <em>{g.labelKey ? t(g.labelKey) : g.label}</em>
              </span>
            )
          hits.push({
            key: i.key,
            icon: i.icon,
            label,
          } as MenuItem)
        }
      }
    }
    if (terms.some((term) => '工作台 home gongzuotai dashboard'.includes(term))) {
      hits.unshift({ key: '/home', icon: <HomeOutlined />, label: t('nav.home') } as MenuItem)
    }
    return hits
  }, [menuQuery, t])

  /** 侧栏菜单：由 navigation.tsx 的唯一信息架构生成，报表二级菜单单独分组 */
  const desktopItems = useMemo(() => {
    const home = { key: '/home', icon: <HomeOutlined />, label: t('nav.home') }
    // 菜单分组拖拽排序（记忆）
    const groupOrder = (() => {
      try {
        return JSON.parse(localStorage.getItem('crm.menuGroupOrder') ?? '[]') as string[]
      } catch {
        return []
      }
    })()
    const recent = readRecent()
      .filter((r) => r.path !== '/home' && r.path !== loc.pathname)
      .slice(0, 4)
      .map((r) => ({
        key: r.path,
        icon: <ClockCircleOutlined />,
        label: navLabelFor(r.path, r.label),
      }))
    let pins: { path: string; label: string }[] = []
    try {
      pins = JSON.parse(localStorage.getItem('crm.menuPins') ?? '[]') as {
        path: string
        label: string
      }[]
    } catch {
      pins = []
    }
    const pinGroup: MenuItem[] = pins.length
      ? [
          {
            key: 'g-pins',
            label: t('shell.pinned'),
            type: 'group' as const,
            children: pins.slice(0, 6).map((p) => ({
              key: p.path,
              icon: <HomeOutlined />,
              label: (
                <span className="crm-menu-hit">
                  {navLabelFor(p.path, p.label)}
                  <em
                    title={t('shell.unpin')}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      try {
                        const raw = localStorage.getItem('crm.menuPins')
                        const list = raw
                          ? (JSON.parse(raw) as { path: string; label: string }[])
                          : []
                        localStorage.setItem(
                          'crm.menuPins',
                          JSON.stringify(list.filter((x) => x.path !== p.path)),
                        )
                      } catch {
                        /* ignore */
                      }
                      setMenuQuery((q) => (q === ' ' ? '' : ' '))
                    }}
                  >
                    ✕
                  </em>
                </span>
              ),
            })),
          },
        ]
      : []
    const recentGroup: MenuItem[] = recent.length
      ? [
          {
            key: 'g-recent',
            label: t('nav.recent') === 'nav.recent' ? t('command.recent') : t('nav.recent'),
            type: 'group' as const,
            children: recent,
          },
        ]
      : []
    const groups = NAV_GROUPS.map((g) => {
      const isReports = g.key === 'g-insight'
      const dragProps = {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData('text/group', g.key)
        },
        onDragOver: (e: React.DragEvent) => e.preventDefault(),
        onDrop: (e: React.DragEvent) => {
          const from = e.dataTransfer.getData('text/group')
          if (!from || from === g.key) return
          const keys = NAV_GROUPS.map((x) => x.key)
          const fi = keys.indexOf(from)
          const ti = keys.indexOf(g.key)
          keys.splice(ti, 0, keys.splice(fi, 1)[0])
          try {
            localStorage.setItem('crm.menuGroupOrder', JSON.stringify(keys))
          } catch {
            /* ignore */
          }
          setMenuQuery((q) => (q === ' ' ? '' : ' '))
        },
        style: { cursor: 'grab' as const },
      }
      const isCollab = g.key === 'g-collab'
      const children: MenuItem[] = g.items
        .filter((i) => {
          if (isReports) return i.key === '/reports'
          // 审批带待办角标，统一由下方单独渲染
          if (isCollab) return i.key !== '/approvals'
          return true
        })
        .map((i) => {
          const text = i.labelKey ? t(i.labelKey) : i.label
          const badgeCount =
            i.key === '/contracts' || i.key === '/quotes'
              ? contractBadge
              : i.key === '/leads'
                ? leadBadge
                : i.key === '/notifications'
                  ? notifyBadge
                  : i.key === '/payments' || i.key === '/group'
                    ? payBadge
                    : 0
          return {
            key: i.key,
            icon: i.icon,
            label: badgeCount > 0 ? badgeLabel(String(text), badgeCount) : text,
          }
        })
      if (isReports) {
        const rest = g.items.filter(
          (i) => i.key !== '/reports' && !i.key.startsWith('/reports/') && i.key !== '/approvals',
        )
        children.push(
          ...rest.map((i) => {
            const text = i.label
            const badgeCount = i.key === '/contracts' ? contractBadge : 0
            return {
              key: i.key,
              icon: i.icon,
              label: badgeCount > 0 ? badgeLabel(String(text), badgeCount) : text,
            } as MenuItem
          }),
        )
      }
      // 审批项只渲染一次（带待办角标），归属「协作」组
      if (isCollab) {
        children.push({
          key: '/approvals',
          icon: <CheckCircleOutlined />,
          label: badgeLabel(t('nav.approvals'), todoCount),
        })
      }
      return {
        key: g.key,
        label: (
          <span {...dragProps} title={t('shell.dragToReorderGroups')}>
            {t(g.labelKey ?? g.key)}
          </span>
        ),
        type: 'group' as const,
        children,
      } as MenuItem
    })
    const ordered =
      groupOrder.length > 0
        ? [...groups].sort((a, b) => {
            const ka = String((a as { key?: string })?.key ?? '')
            const kb = String((b as { key?: string })?.key ?? '')
            const ia = groupOrder.indexOf(ka)
            const ib = groupOrder.indexOf(kb)
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
          })
        : groups
    return [home as MenuItem, ...pinGroup, ...recentGroup, ...ordered]
  }, [t, todoCount, contractBadge, leadBadge, notifyBadge, payBadge, loc.pathname])

  // docs/06 §2：手机底部 5 入口 = 工作台 / 客户 / 商机 / 跟进 / 我的
  const mobileItems = [
    { key: '/home', label: t('nav.home'), icon: <HomeOutlined /> },
    { key: '/accounts', label: t('nav.accounts'), icon: <TeamOutlined /> },
    { key: '/opportunities', label: t('nav.opportunities'), icon: <RiseOutlined /> },
    {
      key: '/activities',
      label: (
        <Badge size="small" count={todoCount} offset={[8, -2]}>
          {t('nav.activities')}
        </Badge>
      ),
      icon: <PhoneOutlined />,
    },
    { key: '/me', label: t('nav.me'), icon: <UserOutlined /> },
  ]

  const activeKey = mobileItems.some((i) => loc.pathname.startsWith(i.key))
    ? mobileItems.find((i) => loc.pathname.startsWith(i.key))!.key
    : loc.pathname

  const userMenu = {
    items: [
      { key: 'name', label: me.name ?? t('common.user'), disabled: true },
      { key: 'role', label: me.roles?.[0] ?? 'USER', disabled: true },
      { type: 'divider' as const },
      {
        key: 'locale',
        icon: <GlobalOutlined />,
        label: locale === 'zh-CN' ? 'English' : t('common.langZh'),
      },
      {
        key: 'theme',
        icon: <BgColorsOutlined />,
        label: dark ? t('theme.light') : t('theme.dark'),
      },
      { key: 'shortcuts', icon: <QuestionCircleOutlined />, label: t('shell.keyboardShortcuts') },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: t('common.logout'), danger: true },
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') {
        void stopNativePush().finally(() => {
          clearTokens()
          localStorage.removeItem('me_cache')
          safeNav('/login')
        })
      } else if (key === 'locale') {
        setUiLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')
      } else if (key === 'theme') {
        setMode(dark ? 'light' : 'dark')
      } else if (key === 'shortcuts') {
        setHelpOpen(true)
      }
    },
  }

  return (
    <Layout style={{ minHeight: '100vh' }} className="crm-shell">
      {!isMobile && (
        <Sider
          width={232}
          theme="dark"
          collapsedWidth={72}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          className="crm-sider"
        >
          <div className="crm-brand">
            <div className="crm-logo">Z</div>
            {!collapsed && (
              <div className="crm-brand-text">
                <div className="crm-brand-name">{t('app.shortName')}</div>
                <div className="crm-brand-sub">Sales Platform</div>
              </div>
            )}
            {!collapsed && (
              <Button
                type="text"
                size="small"
                icon={<MenuFoldOutlined />}
                onClick={() => setCollapsed(true)}
                className="crm-collapse-btn"
              />
            )}
          </div>
          {collapsed && (
            <Button
              type="text"
              size="small"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setCollapsed(false)}
              className="crm-expand-btn"
            />
          )}
          {!collapsed && (
            <div className="crm-menu-search">
              <Input
                allowClear
                size="small"
                prefix={<SearchOutlined />}
                placeholder={t('shell.searchMenuShortcuts')}
                value={menuQuery}
                onChange={(e) => setMenuQuery(e.target.value)}
              />
              <div className="crm-menu-hint">{t('shell.kSearchShortcuts1')}</div>
            </div>
          )}
          <div className="crm-menu-wrap">
            {menuQuery.trim() ? (
              <Menu
                theme="dark"
                mode="inline"
                inlineCollapsed={collapsed}
                selectedKeys={[menuKeyFor(loc.pathname)]}
                items={
                  searchItems.length
                    ? searchItems
                    : [{ key: '__empty', disabled: true, label: t('shell.noMatchingMenu') } as MenuItem]
                }
                className="crm-menu"
                onClick={({ key }) => {
                  if (typeof key === 'string' && key.startsWith('/')) {
                    safeNav(key)
                    setMenuQuery('')
                  }
                }}
              />
            ) : (
              <Menu
                theme="dark"
                mode="inline"
                inlineCollapsed={collapsed}
                defaultOpenKeys={(() => {
                  try {
                    const raw = localStorage.getItem('crm.menuOpen')
                    if (raw) return JSON.parse(raw) as string[]
                  } catch {
    /* ignore */
  }
                  return ['g-collab', 'g-insight']
                })()}
                onOpenChange={(keys) => {
                  try {
                    localStorage.setItem('crm.menuOpen', JSON.stringify(keys))
                  } catch {
    /* ignore */
  }
                }}
                selectedKeys={[menuKeyFor(loc.pathname)]}
                items={desktopItems}
                className="crm-menu"
                onClick={({ key }) => {
                  if (typeof key === 'string' && key.startsWith('/')) safeNav(key)
                }}
              />
            )}
          </div>
        </Sider>
      )}
      <Layout>
        <Header className="crm-header">
          <div className="crm-header-left">
            {isMobile ? (
              <Button
                type="text"
                icon={<AppstoreOutlined />}
                onClick={() => setDrawerOpen(true)}
              />
            ) : (
              <div className="crm-crumbs">
                {crumbs.map((c, i) => (
                  <span key={c.key}>
                    {i > 0 && <span className="crm-crumb-sep">/</span>}
                    {i === crumbs.length - 1 ? (
                      <span className="crm-crumb-current">{c.label}</span>
                    ) : (
                      <Link to={c.path} className="crm-crumb-link">
                        {c.label}
                      </Link>
                    )}
                  </span>
                ))}
                {loc.pathname !== '/home' && (
                  <Button
                    type="text"
                    size="small"
                    title={t('shell.pinToFavorites')}
                    style={{ marginLeft: 6, color: 'rgba(255,255,255,0.7)' }}
                    onClick={() => {
                      try {
                        const raw = localStorage.getItem('crm.menuPins')
                        const list = raw
                          ? (JSON.parse(raw) as { path: string; label: string }[])
                          : []
                        const label = crumbs[crumbs.length - 1]?.label ?? loc.pathname
                        const next = [
                          { path: loc.pathname, label },
                          ...list.filter((x) => x.path !== loc.pathname),
                        ].slice(0, 8)
                        localStorage.setItem('crm.menuPins', JSON.stringify(next))
                        message.success(t('shell.pinnedToPinned'))
                        setMenuQuery('')
                      } catch {
                        /* ignore */
                      }
                    }}
                  >{t('shell.pin')}</Button>
                )}
              </div>
            )}
          </div>
          <div className="crm-header-center">{!isMobile && <CommandTrigger />}</div>
          <div className="crm-header-right">
            <QuickCreateButton />
            <NotificationBell />
            <Dropdown
              trigger={['click']}
              menu={{
                items: themeOptions.map((x) => ({
                  key: x.key,
                  label: (
                    <Space>
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 99,
                          background: x.color,
                          display: 'inline-block',
                        }}
                      />
                      {x.label}
                      {x.active ? <span style={{ color: x.color }}>✓</span> : null}
                    </Space>
                  ),
                })),
                onClick: ({ key }) => applyTheme(key),
              }}
            >
              <Tooltip title={t('shell.theme')}>
                <Button type="text" icon={<BgColorsOutlined />} />
              </Tooltip>
            </Dropdown>
            <Dropdown menu={userMenu} trigger={['click']}>
              <div className="crm-user">
                <Avatar size={28} style={{ background: 'var(--crm-accent)' }}>
                  {(me.name ?? 'U').slice(0, 1)}
                </Avatar>
                {!isMobile && (
                  <span className="crm-user-name">{me.name ?? t('common.user')}</span>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content className="crm-content">
          {todoCount > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12, borderRadius: 10 }}
              message={t('shell.youHaveApprovalsPending', { todoCount })}
              action={
                <Button size="small" type="primary" onClick={() => safeNav('/approvals')}>{t('common.review')}</Button>
              }
            />
          )}
          {/* 子路由全部懒加载，统一兜底，避免同步导航挂起触发 React #426 */}
          <Suspense
            fallback={
              <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </Content>
        <div className="crm-statusbar">
          <Space size={12}>
            <span>{t('shell.zhixiaoCrmTestEnvironment')}</span>
            <span style={{ opacity: 0.5 }}>|</span>
            <span>{me.name ?? t('common.user')} · {me.roles?.[0] ?? 'USER'}</span>
          </Space>
          <Space size={12}>
            <span>{new Date().toLocaleDateString('zh-CN')}</span>
            <span style={{ opacity: 0.5 }} title={t('shell.frontendVersionWrittenAt')}>
              v{__APP_VERSION__} · {__APP_COMMIT__}
            </span>
            <span style={{ opacity: 0.5 }}>{window.location.host}</span>
          </Space>
        </div>
        {isMobile && (
          <Footer className="crm-mobile-tabs">
            {mobileItems.map((i) => (
              <Link key={i.key} to={i.key} className={`crm-tab ${activeKey === i.key ? 'active' : ''}`}>
                <span className="crm-tab-icon">{i.icon}</span>
                <span className="crm-tab-label">{i.label}</span>
              </Link>
            ))}
          </Footer>
        )}
        {isMobile && (
          <>
            <div style={{ padding: '4px 0 8px' }}>
              <GlobalSearch compact />
            </div>
            <FloatButton.Group trigger="click" style={{ right: 16, bottom: 76 }} tooltip={t('command.quickCreate')}>
              <FloatButton tooltip={t('common.newFollowUp')} onClick={() => safeNav('/activities')} />
              <FloatButton tooltip={t('common.newLead')} onClick={() => safeNav('/leads')} />
              <FloatButton tooltip={t('common.newAccount')} onClick={() => safeNav('/accounts')} />
              <FloatButton tooltip={t('nav.quotes')} onClick={() => safeNav('/quotes')} />
            </FloatButton.Group>
          </>
        )}
      </Layout>
      <CommandPalette />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={260}
          styles={{ body: { padding: 0, background: '#0f172a' } }}
        >
          <div className="crm-brand" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="crm-logo">Z</div>
            <div className="crm-brand-text">
              <div className="crm-brand-name">{t('app.shortName')}</div>
              <div className="crm-brand-sub">Sales Platform</div>
            </div>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[menuKeyFor(loc.pathname)]}
            items={desktopItems}
            className="crm-menu"
            onClick={({ key }) => {
              if (typeof key === 'string' && key.startsWith('/')) safeNav(key)
              setDrawerOpen(false)
            }}
          />
        </Drawer>
      )}
    </Layout>
  )
}
