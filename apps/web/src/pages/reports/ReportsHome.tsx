import { Card, Space, Typography } from 'antd'
import {
  AlertOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  FundOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExportCsvButton } from '../../components/ExportCsvButton'
import { t } from '../../i18n'

interface Tile {
  key: string
  title: string
  desc: string
  to: string
  tags: string[]
  color: string
  icon: ReactNode
}

const GROUPS: Tile[] = [
  {
    key: 'pipeline',
    title: t('common.pipeline'),
    desc: t('reports.funnelStageConversionStage'),
    to: '/reports/pipeline',
    tags: [t('reports.funnel'), t('reports.conversion'), t('reports.gantt')],
    color: '#2f6bff',
    icon: <FundOutlined />,
  },
  {
    key: 'performance',
    title: t('common.salesGoals'),
    desc: t('reports.productivityRankingRegionalPerformance'),
    to: '/reports/performance',
    tags: [t('reports.productivity'), t('common.region'), t('reports.forecast')],
    color: '#22a06b',
    icon: <DashboardOutlined />,
  },
  {
    key: 'revenue',
    title: t('common.paymentsFinance'),
    desc: t('reports.paymentForecastRenewalsBoard'),
    to: '/reports/revenue',
    tags: [t('nav.payments'), t('reports.renewals'), t('reports.expiry')],
    color: '#f59e0b',
    icon: <WalletOutlined />,
  },
  {
    key: 'customer',
    title: t('common.customerInsights'),
    desc: t('reports.rfmLifecycleTagCloud'),
    to: '/reports/customer',
    tags: ['RFM', t('reports.healthy'), t('common.tags')],
    color: '#7c5cf0',
    icon: <TeamOutlined />,
  },
  {
    key: 'activity',
    title: t('common.activityEfficiency'),
    desc: t('reports.followUpEfficiencyTouchpoint'),
    to: '/reports/activity',
    tags: [t('nav.activities'), t('common.calendar'), t('common.followUpVisit')],
    color: '#0ea5e9',
    icon: <ClockCircleOutlined />,
  },
  {
    key: 'risk',
    title: t('common.riskQuality'),
    desc: t('reports.funnelAlertsLostTo'),
    to: '/reports/risk',
    tags: [t('common.warnings'), t('enum.stage.LOST'), t('reports.quality')],
    color: '#e5484d',
    icon: <AlertOutlined />,
  },
]

/**
 * 报表中心首页：分类入口大卡（统一宽高，颜色与图标区分业务域）
 */
export default function ReportsHome() {
  return (
    <div>
      <Card size="small" className="crm-block-fit" style={{ marginBottom: 16 }}>
        <Typography.Paragraph style={{ marginBottom: 10, color: 'var(--crm-muted)' }}>{t('reports.reportsAreGroupedBy')}</Typography.Paragraph>
        <Space wrap>
          <ExportCsvButton path="/leads?export=csv" filename="leads.csv" label={t('reports.exportLeads')} />
          <ExportCsvButton path="/accounts?export=csv" filename="accounts.csv" label={t('reports.exportAccounts')} />
          <ExportCsvButton
            path="/opportunities?export=csv"
            filename="opportunities.csv"
            label={t('reports.exportDeals')}
          />
          <ExportCsvButton
            path="/reports/sales-funnel?export=csv"
            filename="sales-funnel.csv"
            label={t('reports.exportFunnel')}
          />
        </Space>
      </Card>
      <div className="crm-grid crm-cols-3 crm-h-tile">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            to={g.to}
            className="crm-report-tile"
            style={{ '--tile-color': g.color } as CSSProperties}
          >
            <span
              className="crm-report-tile-icon"
              style={{ background: `${g.color}14`, color: g.color }}
            >
              {g.icon}
            </span>
            <span className="crm-report-tile-title">{g.title}</span>
            <span className="crm-report-tile-desc">{g.desc}</span>
            <span className="crm-report-tile-tags">
              {g.tags.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11,
                    padding: '1px 8px',
                    borderRadius: 999,
                    background: `${g.color}12`,
                    color: g.color,
                  }}
                >
                  {t}
                </span>
              ))}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
