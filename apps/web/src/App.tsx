import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { App as AntApp, Spin } from 'antd'
import LoginPage from './pages/LoginPage'
import AppShell from './layouts/AppShell'
import { getAccessToken } from './api/client'

/** 懒加载：除登录页外全部按需加载，降低首屏包体；Suspense 边界在 AppShell 的 Outlet 外 */
const HomePage = lazy(() => import('./pages/HomePage'))
const SsoCallbackPage = lazy(() => import('./pages/SsoCallbackPage'))
const LeadsPage = lazy(() => import('./pages/LeadsPage'))
const AccountsPage = lazy(() => import('./pages/AccountsPage'))
const OpportunitiesPage = lazy(() => import('./pages/OpportunitiesPage'))
const QuotesPage = lazy(() => import('./pages/QuotesPage'))
const QuoteDetailPage = lazy(() => import('./pages/quotes/QuoteDetailPage'))
const QuotePrintPage = lazy(() => import('./pages/quotes/QuotePrintPage'))
const ContractsPage = lazy(() => import('./pages/ContractsPage'))
const ContractPrintPage = lazy(() => import('./pages/contracts/ContractPrintPage'))
const ContractSignPage = lazy(() => import('./pages/contracts/ContractSignPage'))
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'))
const AccountDetailPage = lazy(() => import('./pages/accounts/AccountDetailPage'))
const OpportunityDetailPage = lazy(() => import('./pages/opportunities/OpportunityDetailPage'))
const TicketsPage = lazy(() => import('./pages/tickets/TicketsPage'))
const LeadDetailPage = lazy(() => import('./pages/leads/LeadDetailPage'))
const CampaignsPage = lazy(() => import('./pages/campaigns/CampaignsPage'))
const ActivitiesPage = lazy(() => import('./pages/activities/ActivitiesPage'))
const ReportsLayout = lazy(() => import('./pages/reports/ReportsLayout'))
const ReportsHome = lazy(() => import('./pages/reports/ReportsHome'))
const PipelineReports = lazy(() => import('./pages/reports/PipelineReports'))
const PerformanceReports = lazy(() => import('./pages/reports/PerformanceReports'))
const RevenueReports = lazy(() => import('./pages/reports/RevenueReports'))
const CustomerReports = lazy(() => import('./pages/reports/CustomerReports'))
const ActivityReports = lazy(() => import('./pages/reports/ActivityReports'))
const RiskReports = lazy(() => import('./pages/reports/RiskReports'))
const UsersPage = lazy(() => import('./pages/users/UsersPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const OrgAdminPage = lazy(() => import('./pages/org/OrgAdminPage'))
const GroupPage = lazy(() => import('./pages/group/GroupPage'))
const GroupScreenPage = lazy(() => import('./pages/group/GroupScreenPage'))
const GroupReportPage = lazy(() => import('./pages/group/GroupReportPage'))
const RenewalPage = lazy(() => import('./pages/contracts/RenewalPage'))
const ShareQuotePage = lazy(() => import('./pages/quotes/ShareQuotePage'))
const ImportWizardPage = lazy(() => import('./pages/import/ImportWizardPage'))
const SegmentDashboardPage = lazy(() => import('./pages/segments/SegmentDashboardPage'))
const ForecastWorkbenchPage = lazy(() => import('./pages/reports/ForecastWorkbenchPage'))
const WeeklyBriefPage = lazy(() => import('./pages/reports/WeeklyBriefPage'))
const SystemHealthPage = lazy(() => import('./pages/platform/SystemHealthPage'))
const TemplateGuidePage = lazy(() => import('./pages/platform/TemplateGuidePage'))
const PaymentWorkbenchPage = lazy(() => import('./pages/reports/PaymentWorkbenchPage'))
const CommissionPage = lazy(() => import('./pages/reports/CommissionPage'))
const ESignBoardPage = lazy(() => import('./pages/contracts/ESignBoardPage'))
const TodosPage = lazy(() => import('./pages/todos/TodosPage'))
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'))
const WebhooksPage = lazy(() => import('./pages/platform/WebhooksPage'))
const ApiTokensPage = lazy(() => import('./pages/platform/ApiTokensPage'))
const ApiDocsPage = lazy(() => import('./pages/platform/ApiDocsPage'))
const AuditPage = lazy(() => import('./pages/audit/AuditPage'))
const GoalsPage = lazy(() => import('./pages/goals/GoalsPage'))
const FieldDefsPage = lazy(() => import('./pages/fields/FieldDefsPage'))
const PoolPage = lazy(() => import('./pages/pool/PoolPage'))
const EnablementPage = lazy(() => import('./pages/enablement/EnablementPage'))
const ProductsPage = lazy(() => import('./pages/products/ProductsPage'))
const ContactsPage = lazy(() => import('./pages/contacts/ContactsPage'))
const MePage = lazy(() => import('./pages/me/MePage'))
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'))
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage'))
const CadencePage = lazy(() => import('./pages/cadence/CadencePage'))
const HelpPage = lazy(() => import('./pages/help/HelpPage'))

function RequireAuth({ children }: { children: JSX.Element }) {
  const loc = useLocation()
  if (!getAccessToken()) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  }
  return children
}

function PageFallback() {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Spin />
    </div>
  )
}

export default function App() {
  return (
    <AntApp>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/login/sso/:provider"
          element={
            <Suspense fallback={null}>
              <SsoCallbackPage />
            </Suspense>
          }
        />
        {/* 客户打开的报价分享页：免登录，不套用系统布局 */}
        <Route
          path="/share/quote/:token"
          element={
            <Suspense fallback={<PageFallback />}>
              <ShareQuotePage />
            </Suspense>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:id" element={<LeadDetailPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:id" element={<AccountDetailPage />} />
          <Route
            path="contacts"
            element={
              <Suspense fallback={<PageFallback />}>
                <ContactsPage />
              </Suspense>
            }
          />
          <Route path="opportunities" element={<OpportunitiesPage />} />
          <Route path="opportunities/:id" element={<OpportunityDetailPage />} />
          <Route path="quotes" element={<QuotesPage />} />
          <Route path="quotes/:id" element={<QuoteDetailPage />} />
          <Route path="quotes/:id/print" element={<QuotePrintPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="contracts/:id/print" element={<ContractPrintPage />} />
          <Route path="contracts/:id/sign" element={<ContractSignPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route
            path="reports"
            element={
              <Suspense fallback={<PageFallback />}>
                <ReportsLayout />
              </Suspense>
            }
          >
            <Route
              index
              element={
                <Suspense fallback={<PageFallback />}>
                  <ReportsHome />
                </Suspense>
              }
            />
            <Route
              path="pipeline"
              element={
                <Suspense fallback={<PageFallback />}>
                  <PipelineReports />
                </Suspense>
              }
            />
            <Route
              path="performance"
              element={
                <Suspense fallback={<PageFallback />}>
                  <PerformanceReports />
                </Suspense>
              }
            />
            <Route
              path="revenue"
              element={
                <Suspense fallback={<PageFallback />}>
                  <RevenueReports />
                </Suspense>
              }
            />
            <Route
              path="customer"
              element={
                <Suspense fallback={<PageFallback />}>
                  <CustomerReports />
                </Suspense>
              }
            />
            <Route
              path="activity"
              element={
                <Suspense fallback={<PageFallback />}>
                  <ActivityReports />
                </Suspense>
              }
            />
            <Route
              path="risk"
              element={
                <Suspense fallback={<PageFallback />}>
                  <RiskReports />
                </Suspense>
              }
            />
          </Route>
          <Route
            path="goals"
            element={
              <Suspense fallback={<PageFallback />}>
                <GoalsPage />
              </Suspense>
            }
          />
          <Route
            path="fields"
            element={
              <Suspense fallback={<PageFallback />}>
                <FieldDefsPage />
              </Suspense>
            }
          />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route
            path="pool"
            element={
              <Suspense fallback={<PageFallback />}>
                <PoolPage />
              </Suspense>
            }
          />
          <Route
            path="enablement"
            element={
              <Suspense fallback={<PageFallback />}>
                <EnablementPage />
              </Suspense>
            }
          />
          <Route
            path="products"
            element={
              <Suspense fallback={<PageFallback />}>
                <ProductsPage />
              </Suspense>
            }
          />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route
            path="cadence"
            element={
              <Suspense fallback={<PageFallback />}>
                <CadencePage />
              </Suspense>
            }
          />
          <Route
            path="calendar"
            element={
              <Suspense fallback={<PageFallback />}>
                <CalendarPage />
              </Suspense>
            }
          />
          <Route
            path="users"
            element={
              <Suspense fallback={<PageFallback />}>
                <UsersPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
          <Route
            path="projects"
            element={
              <RequireAuth>
                <ProjectsPage />
              </RequireAuth>
            }
          />
          <Route
            path="todos"
            element={
              <RequireAuth>
                <TodosPage />
              </RequireAuth>
            }
          />
          <Route
            path="group/screen"
            element={
              <RequireAuth>
                <GroupScreenPage />
              </RequireAuth>
            }
          />
          <Route
            path="import"
            element={
              <RequireAuth>
                <ImportWizardPage />
              </RequireAuth>
            }
          />
          <Route
            path="reports/payments"
            element={
              <RequireAuth>
                <PaymentWorkbenchPage />
              </RequireAuth>
            }
          />
          <Route
            path="reports/commission"
            element={
              <RequireAuth>
                <CommissionPage />
              </RequireAuth>
            }
          />
          <Route
            path="esign/board"
            element={
              <RequireAuth>
                <ESignBoardPage />
              </RequireAuth>
            }
          />
          <Route
            path="platform/health"
            element={
              <RequireAuth>
                <SystemHealthPage />
              </RequireAuth>
            }
          />
          <Route
            path="platform/template-guide"
            element={
              <RequireAuth>
                <TemplateGuidePage />
              </RequireAuth>
            }
          />
          <Route
            path="reports/weekly-brief"
            element={
              <RequireAuth>
                <WeeklyBriefPage />
              </RequireAuth>
            }
          />
          <Route
            path="reports/forecast"
            element={
              <RequireAuth>
                <ForecastWorkbenchPage />
              </RequireAuth>
            }
          />
          <Route
            path="segments"
            element={
              <RequireAuth>
                <SegmentDashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="contracts/renewals"
            element={
              <RequireAuth>
                <RenewalPage />
              </RequireAuth>
            }
          />
          <Route
            path="group/report"
            element={
              <RequireAuth>
                <GroupReportPage />
              </RequireAuth>
            }
          />
          <Route
            path="group"
            element={
              <RequireAuth>
                <GroupPage />
              </RequireAuth>
            }
          />
          <Route
            path="org"
            element={
              <Suspense fallback={<PageFallback />}>
                <OrgAdminPage />
              </Suspense>
            }
          />
          <Route
            path="webhooks"
            element={
              <Suspense fallback={<PageFallback />}>
                <WebhooksPage />
              </Suspense>
            }
          />
          <Route
            path="tokens"
            element={
              <Suspense fallback={<PageFallback />}>
                <ApiTokensPage />
              </Suspense>
            }
          />
          <Route
            path="docs"
            element={
              <Suspense fallback={<PageFallback />}>
                <ApiDocsPage />
              </Suspense>
            }
          />
          <Route
            path="notifications"
            element={
              <Suspense fallback={<PageFallback />}>
                <NotificationsPage />
              </Suspense>
            }
          />
          <Route
            path="audit"
            element={
              <Suspense fallback={<PageFallback />}>
                <AuditPage />
              </Suspense>
            }
          />
          <Route
            path="me"
            element={
              <Suspense fallback={<PageFallback />}>
                <MePage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AntApp>
  )
}
