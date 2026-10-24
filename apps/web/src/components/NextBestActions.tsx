import { useQuery } from '@tanstack/react-query'
import { Card, List, Tag } from 'antd'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { t } from '../i18n'

/** 下一步最佳行动（对标 Salesforce Einstein Next Best Action） */
export function NextBestActions({ oppId, accountId }: { oppId?: string; accountId?: string }) {
  const q = useQuery({
    queryKey: ['nba', oppId, accountId],
    queryFn: () =>
      api<{
        items: { title: string; reason: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; action: string; href?: string }[]
      }>('/reports/next-actions', {
        method: 'POST',
        body: JSON.stringify({ opportunityId: oppId, accountId }),
      }),
    retry: false,
  })

  const items = q.data?.items ?? []
  if (!items.length) return null

  return (
    <Card size="small" title={t('cmp.nextBestActions.nextBestActions')} style={{ marginBottom: 12 }}>
      <List
        size="small"
        dataSource={items.slice(0, 5)}
        renderItem={(it) => (
          <List.Item>
            <List.Item.Meta
              title={
                <span>
                  <Tag
                    color={it.priority === 'HIGH' ? 'red' : it.priority === 'MEDIUM' ? 'orange' : 'default'}
                  >
                    {it.priority === 'HIGH' ? t('common.high') : it.priority === 'MEDIUM' ? t('common.medium2') : t('common.low')}
                  </Tag>
                  {it.href ? <Link to={it.href}>{it.title}</Link> : it.title}
                </span>
              }
              description={t('cmp.nextBestActions.suggestion', { reason: it.reason, action: it.action })}
            />
          </List.Item>
        )}
      />
    </Card>
  )
}
