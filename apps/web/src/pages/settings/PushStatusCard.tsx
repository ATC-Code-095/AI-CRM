import { useQuery } from '@tanstack/react-query'
import { Card, Descriptions, Tag, Typography } from 'antd'
import { api } from '../../api/client'
import { t } from '../../i18n'

interface PushStatus {
  apns: { configured: boolean; bundleId?: string; production?: boolean }
  fcm: { configured: boolean; projectId?: string }
  hms?: { configured: boolean; projectId?: string }
}

/** 手机推送通道状态（APNs / FCM / 华为 Push Kit）：凭证在服务器环境变量中配置，这里只显示是否生效 */
export function PushStatusCard({ className }: { className?: string }) {
  const q = useQuery({ queryKey: ['push-status'], queryFn: () => api<PushStatus>('/push/status') })
  const on = (v?: boolean) => (v ? <Tag color="green">{t('push.configured')}</Tag> : <Tag>{t('push.notConfigured')}</Tag>)
  return (
    <Card size="small" className={className} title={t('push.title')} loading={q.isLoading}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('push.intro')}
      </Typography.Paragraph>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label={t('push.apns')}>
          {on(q.data?.apns.configured)}
          {q.data?.apns.configured && (
            <span className="crm-muted">
              {q.data.apns.bundleId} · {q.data.apns.production ? t('push.production') : t('push.sandbox')}
            </span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t('push.fcm')}>
          {on(q.data?.fcm.configured)}
          {q.data?.fcm.configured && <span className="crm-muted">{q.data.fcm.projectId}</span>}
        </Descriptions.Item>
        <Descriptions.Item label={t('push.hms')}>
          {on(q.data?.hms?.configured)}
          {q.data?.hms?.configured && <span className="crm-muted">{q.data.hms.projectId}</span>}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
