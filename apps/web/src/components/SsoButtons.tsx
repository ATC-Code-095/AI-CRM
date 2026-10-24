import { useQuery } from '@tanstack/react-query'
import { App, Button, Divider, Space } from 'antd'
import { useState } from 'react'
import { api, ssoRedirectUri, type SsoProvider } from '../api/client'
import { t } from '../i18n'

export const SSO_LABEL: Record<SsoProvider, () => string> = {
  wechat_work: () => t('sso.wechatWork'),
  dingtalk: () => t('sso.dingtalk'),
  feishu: () => t('sso.feishu'),
}

/** 登录页的扫码登录按钮：只显示该企业启用了的平台（地址栏 ?tenant= 或上次登录的企业） */
export function SsoButtons() {
  const { message } = App.useApp()
  const [busy, setBusy] = useState<SsoProvider | null>(null)
  const tenant = new URLSearchParams(window.location.search).get('tenant') || localStorage.getItem('tenant_code') || ''
  const q = useQuery({
    queryKey: ['sso-providers', tenant],
    queryFn: () => api<{ tenant: string | null; providers: SsoProvider[] }>(`/auth/sso/providers${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ''}`),
    retry: false,
  })
  const providers = q.data?.providers ?? []
  if (!providers.length) return null

  const go = async (p: SsoProvider) => {
    setBusy(p)
    try {
      const qs = new URLSearchParams({ redirectUri: ssoRedirectUri(p), ...(q.data?.tenant ? { tenant: q.data.tenant } : {}) })
      const { url } = await api<{ url: string }>(`/auth/sso/${p}/start?${qs}`)
      window.location.href = url
    } catch (e) {
      message.error((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <>
      <Divider plain style={{ fontSize: 12 }}>
        {t('sso.or')}
      </Divider>
      <Space direction="vertical" style={{ width: '100%' }}>
        {providers.map((p) => (
          <Button key={p} block loading={busy === p} onClick={() => void go(p)}>
            {t('sso.signInWith', { v: SSO_LABEL[p]() })}
          </Button>
        ))}
      </Space>
    </>
  )
}
