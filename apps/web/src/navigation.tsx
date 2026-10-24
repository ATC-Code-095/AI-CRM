import type { ReactNode } from 'react'
import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BookOutlined,
  BulbOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  ContactsOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FlagOutlined,
  FundOutlined,
  HomeOutlined,
  NodeIndexOutlined,
  PhoneOutlined,
  ReconciliationOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  SettingOutlined,
  ShoppingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
  WalletOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { t } from './i18n'

/**
 * 全站信息架构（唯一来源）
 * 对标 Salesforce / HubSpot / 销售易 / 纷享销客 的主流菜单：
 * 工作台 → 营销获客 → 客户资产 → 销售过程 → 商务履约 → 客户成功 → 分析 → 协作 → 平台管理
 * 侧栏菜单、面包屑、⌘K 命令面板共用。
 */
export interface NavLeaf {
  /** 路由路径，同时作为菜单 key */
  key: string
  /** i18n 键（可选，缺失时用 label） */
  labelKey?: string
  label: string
  icon?: ReactNode
  /** 命令面板里的额外搜索关键词（拼音 / 英文别名） */
  keywords?: string
}

export interface NavGroup {
  key: string
  labelKey?: string
  label: string
  items: NavLeaf[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'g-marketing',
    labelKey: 'nav.growth',
    label: t('nav.growth'),
    items: [
      {
        key: '/campaigns',
        labelKey: 'nav.campaigns',
        label: t('nav.campaigns2'),
        icon: <ThunderboltOutlined />,
        keywords: 'campaign marketing yingxiao',
      },
      {
        key: '/leads',
        labelKey: 'nav.leads',
        label: t('common.leads'),
        icon: <FlagOutlined />,
        keywords: 'lead xiansuo xian_suo leads',
      },
      {
        key: '/pool',
        labelKey: 'nav.pool',
        label: t('nav.leadPool'),
        icon: <SafetyOutlined />,
        keywords: 'pool gonghai duplicate chachong',
      },
    ],
  },
  {
    key: 'g-customers',
    labelKey: 'nav.customers',
    label: t('nav.customers'),
    items: [
      {
        key: '/accounts',
        labelKey: 'nav.accounts',
        label: t('nav.accounts'),
        icon: <TeamOutlined />,
        keywords: 'account company kehu ke_hu customer',
      },
      {
        key: '/contacts',
        labelKey: 'nav.contacts',
        label: t('nav.contacts'),
        icon: <ContactsOutlined />,
        keywords: 'contact lianxiren',
      },
      {
        key: '/enablement',
        labelKey: 'nav.enablement',
        label: t('nav.customerSuccess'),
        icon: <BookOutlined />,
        keywords: 'success enablement nps knowledge kehu',
      },
    ],
  },
  {
    key: 'g-sales',
    labelKey: 'nav.sales',
    label: t('nav.sales'),
    items: [
      {
        key: '/opportunities',
        labelKey: 'nav.opportunities',
        label: t('nav.opportunities'),
        icon: <RiseOutlined />,
        keywords: 'opportunity deal shangji shang_ji opp',
      },
      {
        key: '/projects',
        labelKey: 'nav.projects',
        label: t('nav.projects'),
        icon: <AppstoreOutlined />,
        keywords: 'project xiangmu xiang_mu prj',
      },
      {
        key: '/quotes',
        labelKey: 'nav.quotes',
        label: t('nav.quotes'),
        icon: <FileTextOutlined />,
        keywords: 'quote baojia bao_jia price',
      },
      {
        key: '/activities',
        labelKey: 'nav.activities',
        label: t('nav.followUps'),
        icon: <PhoneOutlined />,
        keywords: 'activity follow genjin',
      },
      {
        key: '/calendar',
        label: t('home.calendar'),
        icon: <CalendarOutlined />,
        keywords: 'calendar schedule riqi agenda',
      },
      {
        key: '/cadence',
        label: t('nav.cadences'),
        icon: <BulbOutlined />,
        keywords: 'cadence sequence jihua playbook',
      },
    ],
  },
  {
    key: 'g-revenue',
    labelKey: 'nav.fulfilment',
    label: t('nav.fulfilment'),
    items: [
      {
        key: '/contracts',
        labelKey: 'nav.contracts',
        label: t('nav.contracts'),
        icon: <ReconciliationOutlined />,
        keywords: 'contract hetong he_tong',
      },
      {
        key: '/contracts/renewals',
        label: t('common.renewals'),
        icon: <ReconciliationOutlined />,
        keywords: 'renewal xufei renew contract',
      },
      {
        key: '/import',
        label: t('feature.import'),
        icon: <ReconciliationOutlined />,
        keywords: 'import csv daoru shuju',
      },
      {
        key: '/segments',
        label: t('common.segmentDashboard'),
        icon: <ReconciliationOutlined />,
        keywords: 'segment fenqun customer',
      },
      {
        key: '/reports/forecast',
        label: t('common.forecastWorkbench'),
        icon: <ReconciliationOutlined />,
        keywords: 'forecast yuce prediction quota',
      },
      {
        key: '/reports/weekly-brief',
        label: t('common.weeklySalesBrief'),
        icon: <ReconciliationOutlined />,
        keywords: 'brief zhoubao weekly report',
      },
      {
        key: '/reports/payments',
        label: t('nav.receivablesAging'),
        icon: <ReconciliationOutlined />,
        keywords: 'payment aging huikuan forecast',
      },
      {
        key: '/esign/board',
        label: t('nav.eSignProgress'),
        icon: <ReconciliationOutlined />,
        keywords: 'esign sign seal yinzhang qianzhang',
      },
      {
        key: '/products',
        labelKey: 'nav.products',
        label: t('nav.products'),
        icon: <ShoppingOutlined />,
        keywords: 'product price chanpin',
      },
      {
        key: '/tickets',
        labelKey: 'nav.tickets',
        label: t('nav.serviceTickets'),
        icon: <CustomerServiceOutlined />,
        keywords: 'ticket service gongdan',
      },
    ],
  },
  {
    key: 'g-insight',
    labelKey: 'nav.analytics',
    label: t('nav.analytics'),
    items: [
      {
        key: '/reports',
        label: t('common.reportCenter'),
        icon: <DashboardOutlined />,
        keywords: 'report baobiao dashboard analytics',
      },
      {
        key: '/reports/pipeline',
        label: t('common.pipeline'),
        icon: <FundOutlined />,
        keywords: 'pipeline guandao funnel',
      },
      {
        key: '/reports/performance',
        label: t('common.salesGoals'),
        icon: <BarChartOutlined />,
        keywords: 'performance target yeji',
      },
      {
        key: '/goals',
        labelKey: 'nav.goals',
        label: t('nav.quotas'),
        icon: <FundOutlined />,
        keywords: 'goal quota mubiao peie',
      },
      {
        key: '/reports/commission',
        label: t('nav.commissions'),
        icon: <WalletOutlined />,
        keywords: 'commission yongjin ticheng payout',
      },
    ],
  },
  {
    key: 'g-collab',
    labelKey: 'nav.collab',
    label: t('nav.collab'),
    items: [
      {
        key: '/todos',
        labelKey: 'nav.todos',
        label: t('common.todoCenter'),
        icon: <CheckCircleOutlined />,
        keywords: 'todo task daiban dai_ban inbox',
      },
      {
        key: '/approvals',
        labelKey: 'nav.approvals',
        label: t('common.approvalCenter'),
        icon: <CheckCircleOutlined />,
        keywords: 'approval shenpi shen_pi',
      },
      {
        key: '/help',
        label: t('nav.helpCenter'),
        icon: <QuestionCircleOutlined />,
        keywords: 'help manual shouce bangzhu caozuo 操作手册 用户手册 管理员手册',
      },
    ],
  },
  {
    key: 'g-admin',
    labelKey: 'nav.settings',
    label: t('nav.settings'),
    items: [
      {
        key: '/group',
        labelKey: 'nav.group',
        label: t('nav.groupStructure'),
        icon: <BankOutlined />,
        keywords: 'group jituan ji_tuan entity legal org',
      },
      {
        key: '/org',
        labelKey: 'nav.org',
        label: t('nav.organization'),
        icon: <TeamOutlined />,
        keywords: 'org zuzhi department',
      },
      { key: '/users', labelKey: 'nav.users', label: t('nav.users'), icon: <UserOutlined />, keywords: 'user yonghu' },
      {
        key: '/fields',
        labelKey: 'nav.fields',
        label: t('common.dataDictionary'),
        icon: <AppstoreOutlined />,
        keywords: 'field zidian',
      },
      {
        key: '/webhooks',
        labelKey: 'nav.webhooks',
        label: t('nav.integrations'),
        icon: <NodeIndexOutlined />,
        keywords: 'webhook jicheng api',
      },
      {
        key: '/tokens',
        labelKey: 'nav.tokens',
        label: t('nav.accessTokens'),
        icon: <SafetyCertificateOutlined />,
        keywords: 'token api',
      },
      {
        key: '/platform/health',
        label: t('common.systemHealth'),
        icon: <SafetyCertificateOutlined />,
        keywords: 'health monitor system perf jiankang',
      },
      {
        key: '/platform/template-guide',
        label: t('common.templateGuide'),
        icon: <AppstoreOutlined />,
        keywords: 'template guide help moban shuoming',
      },
      {
        key: '/docs',
        labelKey: 'nav.docs',
        label: t('nav.docs'),
        icon: <CloudServerOutlined />,
        keywords: 'api docs openapi',
      },
      {
        key: '/audit',
        labelKey: 'nav.audit',
        label: t('common.auditLog'),
        icon: <AuditOutlined />,
        keywords: 'audit shenji log',
      },
      {
        key: '/settings',
        labelKey: 'nav.settings',
        label: t('common.settings'),
        icon: <SettingOutlined />,
        keywords: 'setting shezhi config',
      },
    ],
  },
]

/** 菜单 key → 主菜单高亮项（/reports/xxx 高亮 /reports） */
export function menuKeyFor(pathname: string): string {
  const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.key)).sort(
    (a, b) => b.length - a.length,
  )
  return all.find((k) => pathname === k || pathname.startsWith(k + '/')) ?? pathname
}

/** 菜单项的当前语言名称；「最近访问」「常用」里存的是访问时的名称，切换语言后用它显示 */
export function navLabelFor(path: string, fallback: string): string {
  for (const g of NAV_GROUPS) {
    const hit = g.items.find((i) => i.key === path)
    if (hit) return hit.labelKey ? t(hit.labelKey) : hit.label
  }
  return fallback
}

/** 路径 → 面包屑文案 */
export const NAV_LABELS: Record<string, string> = {
  home: t('nav.home'),
  leads: t('common.leads'),
  campaigns: t('nav.campaigns2'),
  pool: t('nav.leadPool'),
  accounts: t('nav.accounts'),
  contacts: t('nav.contacts'),
  opportunities: t('nav.opportunities'),
  activities: t('nav.followUps'),
  quotes: t('nav.quotes'),
  projects: t('nav.projects'),
  products: t('nav.products'),
  contracts: t('nav.contracts'),
  tickets: t('nav.serviceTickets'),
  reports: t('common.analytics'),
  pipeline: t('common.pipeline'),
  performance: t('common.salesGoals'),
  revenue: t('common.paymentsFinance'),
  customer: t('common.customerInsights'),
  activity: t('common.activityEfficiency'),
  risk: t('common.riskQuality'),
  approvals: t('common.approvalCenter'),
  todos: t('common.todoCenter'),
  enablement: t('nav.customerSuccess'),
  goals: t('nav.quotas'),
  fields: t('common.dataDictionary'),
  group: t('nav.groupStructure'),
  org: t('nav.organization'),
  users: t('nav.users'),
  webhooks: t('nav.integrations'),
  tokens: t('nav.accessTokens'),
  docs: t('nav.docs'),
  notifications: t('common.notificationCenter'),
  calendar: t('home.calendar'),
  cadence: t('nav.cadences'),
  audit: t('common.auditLog'),
  settings: t('common.settings'),
  me: t('nav.me'),
}

/** 命令面板的「导航」条目：扁平化所有页面 */
export const NAV_SEARCH_ITEMS: Array<NavLeaf & { group: string }> = [
  {
    key: '/home',
    labelKey: 'nav.home',
    label: t('nav.home'),
    icon: <HomeOutlined />,
    keywords: 'home gongzuotai dashboard workbench',
    group: t('command.navigate'),
  },
  ...NAV_GROUPS.flatMap((g) =>
    g.items.map((i) => ({ ...i, group: g.label })),
  ),
]
