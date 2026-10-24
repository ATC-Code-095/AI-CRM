import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Card, Popconfirm, Space, Tag } from 'antd'
import { useEffect } from 'react'
import { api, ssoRedirectUri, type SsoProvider } from '../../api/client'
import { SSO_LABEL } from '../../components/SsoButtons'
import { t } from '../../i18n'

/** 「我的」：绑定企业微信 / 钉钉 / 飞书账号后可扫码登录；企业未启用任何平台时不显示 */
export function IdentityBindings() {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['my-identities'],
    queryFn: () => api<{ identities: { provider: SsoProvider }[]; available: SsoProvider[] }>('/auth/identities'),
  })

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('bound')) message.success(t('sso.boundOk'))
  }, [message])

  const bind = useMutation({
    mutationFn: (p: SsoProvider) =>
      api<{ url: string }>(`/auth/identities/${p}/start`, { method: 'POST', body: JSON.stringify({ redirectUri: ssoRedirectUri(p) }) }),
    onSuccess: (r) => {
      window.location.href = r.url
    },
    onError: (e: Error) => message.error(e.message),
  })
  const unbind = useMutation({
    mutationFn: (p: SsoProvider) => api(`/auth/identities/${p}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-identities'] }),
    onError: (e: Error) => message.error(e.message),
  })

  const available = q.data?.available ?? []
  if (!available.length) return null
  const bound = new Set((q.data?.identities ?? []).map((i) => i.provider))
  return (
    <Card size="small" title={t('sso.bindings')} className="crm-panel-fixed" style={{ marginTop: 16 }}>
      {available.map((p) => (
        <div className="crm-me-row" key={p}>
          <span>
            {SSO_LABEL[p]()} {bound.has(p) ? <Tag color="green">{t('sso.bound')}</Tag> : <Tag>{t('sso.notBound')}</Tag>}
          </span>
          <Space size={6}>
            {bound.has(p) ? (
              <Popconfirm title={t('sso.unbindConfirm')} onConfirm={() => unbind.mutate(p)}>
                <Button size="small" danger>
                  {t('sso.unbind')}
                </Button>
              </Popconfirm>
            ) : (
              <Button size="small" type="primary" loading={bind.isPending && bind.variables === p} onClick={() => bind.mutate(p)}>
                {t('sso.bind')}
              </Button>
            )}
          </Space>
        </div>
      ))}
    </Card>
  )
}
