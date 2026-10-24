import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, Typography, App } from 'antd'
import { useTranslation } from 'react-i18next'
import { authApi, saveLogin } from '../api/client'
import { SsoButtons } from '../components/SsoButtons'
import { setUiLocale, useUiLocale } from '../hooks/useUiLocale'

/** 演示账号是超级管理员：仅本地开发显示；演示站点需要时构建加 VITE_SHOW_DEMO_ACCOUNT=true */
const SHOW_DEMO_ACCOUNT = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNT === 'true'

export default function LoginPage() {
  const { t } = useTranslation()
  const locale = useUiLocale()
  const nav = useNavigate()
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true)
    try {
      const res = await authApi.login(values.email, values.password)
      saveLogin(res)
      message.success(t('common.save'))
      nav('/')
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('error.code.40100'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #0f172a 0%, #1e3a8a 45%, #2b5fd9 100%)',
        padding: 12,
      }}
    >
      <Card
        style={{ width: 400, maxWidth: '100%', borderRadius: 16, boxShadow: '0 20px 50px rgba(15,23,42,0.35)' }}
        styles={{ body: { padding: 32 } }}
      >
        <Typography.Title level={3} style={{ textAlign: 'center', marginTop: 0, marginBottom: 24 }}>
          {t('app.name')}
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            label={t('login.email')}
            name="email"
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Input
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder={SHOW_DEMO_ACCOUNT ? 'admin@demo.com' : 'name@company.com'}
              size="large"
            />
          </Form.Item>
          <Form.Item
            label={t('login.password')}
            name="password"
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Input.Password
              autoComplete="current-password"
              placeholder={SHOW_DEMO_ACCOUNT ? 'Demo@12345' : undefined}
              size="large"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} size="large">
            {t('common.confirm')}
          </Button>
        </Form>
        <SsoButtons />
        {SHOW_DEMO_ACCOUNT && (
          <div style={{ marginTop: 16, textAlign: 'center', color: '#646A73', fontSize: 12 }}>
            {/* 账号密码写在此分支内：生产构建会整段剔除，词典里只保留不含凭据的标签 */}
            {t('login.demoAccount')}admin@demo.com / Demo@12345
          </div>
        )}
        <Button
          type="link"
          block
          style={{ marginTop: 8 }}
          onClick={() => setUiLocale(locale === 'zh-CN' ? 'en-US' : 'zh-CN')}
        >
          {locale === 'zh-CN' ? 'English' : t('common.langZh')}
        </Button>
      </Card>
    </div>
  )
}
