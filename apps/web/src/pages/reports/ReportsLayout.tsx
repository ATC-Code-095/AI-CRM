import { Typography } from 'antd'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FundOutlined,
  DashboardOutlined,
  WalletOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import { t } from '../../i18n'

const CATEGORIES = [
  { key: '/reports', label: t('common.reportCenter'), icon: <HomeOutlined />, color: '#2b5fd9' },
  { key: '/reports/pipeline', label: t('common.pipeline'), icon: <FundOutlined />, color: '#2b5fd9' },
  { key: '/reports/performance', label: t('common.salesGoals'), icon: <DashboardOutlined />, color: '#0d9488' },
  { key: '/reports/revenue', label: t('common.paymentsFinance'), icon: <WalletOutlined />, color: '#d97706' },
  { key: '/reports/customer', label: t('common.customerInsights'), icon: <TeamOutlined />, color: '#7c3aed' },
  { key: '/reports/activity', label: t('common.activityEfficiency'), icon: <ClockCircleOutlined />, color: '#0369a1' },
  { key: '/reports/risk', label: t('common.riskQuality'), icon: <AlertOutlined />, color: '#e11d48' },
]

/** 报表中心布局：按类别分组导航 */
export default function ReportsLayout() {
  const loc = useLocation()
  const nav = useNavigate()
  const active =
    CATEGORIES.slice()
      .sort((a, b) => b.key.length - a.key.length)
      .find((c) => loc.pathname === c.key || loc.pathname.startsWith(c.key + '/'))?.key ??
    '/reports'

  return (
    <div className="crm-reports-shell">
      <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>{t('common.analytics')}</Typography.Title>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div className="crm-reports-nav">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              to={c.key}
              onClick={(e) => {
                e.preventDefault()
                nav(c.key)
              }}
              className={`crm-reports-nav-item${active === c.key ? ' active' : ''}`}
              style={{
                borderLeftColor: c.color,
                color: active === c.key ? c.color : undefined,
                background: active === c.key ? `${c.color}12` : undefined,
              }}
            >
              <span className="crm-reports-nav-icon">{c.icon}</span>
              <span>{c.label}</span>
            </Link>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }} className="crm-reports">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
