import { Alert, Button, Card, Spin } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, saveLogin, ssoRedirectUri, type MeUser, type SsoProvider } from '../api/client'
import { t } from '../i18n'

/**
 * 扫码后的回跳页：把平台给的授权码交给后端。
 * 后端按 state 判断是登录还是绑定：登录成功进入工作台，绑定成功回到「我的」。
 */
export default function SsoCallbackPage() {
  const { provider } = useParams<{ provider: SsoProvider }>()
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current || !provider) return
    ran.current = true
    const q = new URLSearchParams(window.location.search)
    // 钉钉回传 authCode，企业微信与飞书回传 code
    const code = q.get('code') || q.get('authCode') || ''
    const state = q.get('state') || ''
    if (!code || !state) {
      setError(t('sso.cancelled'))
      return
    }
    api<{ bound?: boolean; accessToken?: string; refreshToken?: string; user?: MeUser; tenantCode?: string | null }>(`/auth/sso/${provider}/callback`, {
      method: 'POST',
      body: JSON.stringify({ code, state, redirectUri: ssoRedirectUri(provider) }),
    })
      .then((r) => {
        if (r.bound) {
          nav('/me?bound=1', { replace: true })
        } else if (r.accessToken && r.refreshToken && r.user) {
          saveLogin({ accessToken: r.accessToken, refreshToken: r.refreshToken, user: r.user, tenantCode: r.tenantCode })
          nav('/', { replace: true })
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [provider, nav])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <Card style={{ width: 420, maxWidth: '100%' }}>
        {error ? (
          <>
            <Alert type="error" showIcon message={t('sso.failed')} description={error} />
            <Button type="primary" block style={{ marginTop: 16 }} onClick={() => nav('/login', { replace: true })}>
              {t('sso.backToLogin')}
            </Button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
            <div style={{ marginTop: 12 }}>{t('sso.verifying')}</div>
          </div>
        )}
      </Card>
    </div>
  )
}
