import { useQuery } from '@tanstack/react-query'
import { Space, Tag, Timeline, Typography } from 'antd'
import dayjs from 'dayjs'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { t } from '../i18n'

type Ev = {
  key: string
  at: string
  type: 'QUOTE' | 'CONTRACT' | 'PAYMENT' | 'OPP'
  title: string
  amount?: string
  to?: string
}

/** 客户业务时间线：商机/报价/合同/回款 */
export function BizTimeline({ accountId, limit = 12 }: { accountId: string; limit?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['biz-timeline', accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const [qs, cs, ps, os] = await Promise.all([
        api<{ items: { id: string; quoteNo: string; subject: string; total: string; createdAt: string; status: string }[] }>(
          `/quotes?pageSize=20&accountId=${accountId}`,
        ),
        api<{ items: { id: string; contractNo: string; title: string; total: string; createdAt: string; status: string }[] }>(
          `/contracts?pageSize=20&accountId=${accountId}`,
        ),
        api<{ items: { id: string; paymentNo: string; amount: string; paidAt: string; status: string }[] }>(
          `/payments?pageSize=20&contractId=`,
        ),
        api<{ items: { id: string; name: string; amount: string; createdAt: string; stage?: { name?: string } }[] }>(
          `/opportunities?pageSize=20&accountId=${accountId}`,
        ),
      ])
      const evs: Ev[] = []
      for (const q of qs.items ?? []) {
        evs.push({
          key: `q-${q.id}`,
          at: q.createdAt,
          type: 'QUOTE',
          title: t('cmp.bizTimeline.quote', { quoteNo: q.quoteNo, subject: q.subject }),
          amount: q.total,
          to: `/quotes/${q.id}`,
        })
      }
      for (const c of cs.items ?? []) {
        evs.push({
          key: `c-${c.id}`,
          at: c.createdAt,
          type: 'CONTRACT',
          title: t('cmp.bizTimeline.contract', { contractNo: c.contractNo, title: c.title }),
          amount: c.total,
          to: `/contracts`,
        })
      }
      for (const p of ps.items ?? []) {
        evs.push({
          key: `p-${p.id}`,
          at: p.paidAt,
          type: 'PAYMENT',
          title: t('cmp.bizTimeline.payment', { paymentNo: p.paymentNo }),
          amount: p.amount,
        })
      }
      for (const o of os.items ?? []) {
        evs.push({
          key: `o-${o.id}`,
          at: o.createdAt,
          type: 'OPP',
          title: t('common.deal', { name: o.name }),
          amount: o.amount,
          to: `/opportunities/${o.id}`,
        })
      }
      evs.sort((a, b) => (a.at < b.at ? 1 : -1))
      return { items: evs.slice(0, limit) }
    },
    retry: false,
  })

  const color: Record<string, string> = {
    QUOTE: 'orange',
    CONTRACT: 'green',
    PAYMENT: 'blue',
    OPP: 'purple',
  }

  if (isLoading) return <Typography.Text type="secondary">{t('common.loading')}</Typography.Text>
  if (!(data?.items ?? []).length)
    return <Typography.Text type="secondary">{t('cmp.bizTimeline.noBusinessEvents')}</Typography.Text>

  return (
    <Timeline
      items={(data?.items ?? []).map((e) => ({
        color: color[e.type],
        children: (
          <div style={{ fontSize: 12 }}>
            <Space>
              <Tag color={color[e.type]} bordered={false}>
                {e.type}
              </Tag>
              {e.to ? <Link to={e.to}>{e.title}</Link> : <span>{e.title}</span>}
              {e.amount ? <b>{e.amount}</b> : null}
            </Space>
            <div style={{ color: '#94a3b8', marginTop: 2 }}>{dayjs(e.at).format('YYYY-MM-DD')}</div>
          </div>
        ),
      }))}
    />
  )
}
