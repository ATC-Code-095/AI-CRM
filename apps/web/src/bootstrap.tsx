/** 应用入口（由 main.tsx 在语言词典就绪后动态加载，保证模块级 t() 拿到正确语言） */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigProvider, theme as antdTheme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import { I18nextProvider } from 'react-i18next'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { i18n } from './i18n'
import { useUiLocale } from './hooks/useUiLocale'
import { useUiMode } from './hooks/useUiTheme'
import './index.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function Root() {
  const locale = useUiLocale()
  const { dark } = useUiMode()
  return (
    <ConfigProvider
      locale={locale === 'en-US' ? enUS : zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary:
            getComputedStyle(document.documentElement).getPropertyValue('--crm-accent').trim() ||
            '#0026ff',
          borderRadius: 4,
          fontSize: 13,
          colorText: dark ? '#e5e7eb' : '#1a1a1a',
          colorBgLayout: dark ? '#161618' : '#f2f3f5',
          wireframe: false,
        },
        components: {
          Layout: {
            headerBg: '#3b3b3f',
            siderBg: '#161618',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
            itemBorderRadius: 8,
            itemMarginInline: 4,
          },
          Card: {
            borderRadiusLG: 12,
          },
        },
      }}
    >
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
