import { useQuery } from '@tanstack/react-query'
import { Card, Progress, Table, Tag, Typography } from 'antd'
import { api } from '../api/client'
import { t } from '../i18n'

/** 目标级联（Quota Hierarchy）：公司 → 团队 → 个人 */
export function GoalCascade() {
  const q = useQuery({
    queryKey: ['goal-cascade'],
    queryFn: () =>
      api<{
        periodKey: string
        companyTotal: string
        people: {
          userId: string
          name: string
          manager: string
          target: string
          metrics: Record<string, number>
        }[]
        managers: string[]
      }>('/goals/cascade'),
    retry: false,
  })

  const total = Number(q.data?.companyTotal ?? 0)
  const people = q.data?.people ?? []
  const max = Math.max(...people.map((p) => Number(p.target)), 1)

  return (
    <Card
      size="small"
      className="crm-panel-fixed"
      title={t('cmp.goalCascade.goalCascade', { v: q.data?.periodKey ?? '' })}
      style={{ marginBottom: 12 }}
      extra={<Tag color="blue">{t('cmp.goalCascade.companyTotal', { v: q.data?.companyTotal ?? '0' })}</Tag>}
    >
      {/* 公司层 */}
      <div
        style={{
          background: 'linear-gradient(90deg, #eef2ff, #f8fafc)',
          border: '1px solid #c7d2fe',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: '#1e293b' }}>{t('cmp.goalCascade.groupCompanyGoals')}</span>
          <b style={{ fontSize: 18, color: '#2b5fd9' }}>{q.data?.companyTotal ?? '0'}</b>
        </div>
        <Progress percent={100} showInfo={false} strokeColor="#2b5fd9" size="small" />
      </div>

      {/* 个人层可视化 */}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>{t('cmp.goalCascade.personalGoalShareTeams')}</Typography.Text>
      <div style={{ marginTop: 8 }}>
        {people.slice(0, 6).map((p) => {
          const pct = total > 0 ? (Number(p.target) / total) * 100 : 0
          return (
            <div key={p.userId} style={{ marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  marginBottom: 2,
                }}
              >
                <span>
                  {p.name}
                  {p.manager ? (
                    <span style={{ color: '#94a3b8' }}>{' '}{t('cmp.goalCascade.manager', { manager: p.manager })}</span>
                  ) : null}
                </span>
                <span>
                  {p.target} · {pct.toFixed(1)}%
                </span>
              </div>
              <div
                style={{
                  height: 10,
                  background: '#f1f5f9',
                  borderRadius: 5,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, (Number(p.target) / max) * 100)}%`,
                    height: '100%',
                    background:
                      pct >= 20
                        ? 'linear-gradient(90deg, #2b5fd9, #60a5fa)'
                        : 'linear-gradient(90deg, #0d9488, #5eead4)',
                    borderRadius: 5,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <Table
        style={{ marginTop: 8 }}
        rowKey="userId"
        size="small"
        pagination={{ pageSize: 5 }}
        loading={q.isLoading}
        dataSource={people}
        columns={[
          { title: t('common.sales'), dataIndex: 'name', width: 100 },
          {
            title: t('common.parent'),
            dataIndex: 'manager',
            width: 90,
            render: (v: string) => v || '-',
          },
          {
            title: t('nav.goals'),
            dataIndex: 'target',
            width: 100,
            render: (v: string) => <b>{v}</b>,
          },
          {
            title: t('common.share'),
            render: (_: unknown, r: { target: string }) => {
              const pct = total > 0 ? (Number(r.target) / total) * 100 : 0
              return (
                <div>
                  <Progress percent={Math.round(pct)} size="small" strokeColor="#0d9488" />
                </div>
              )
            },
          },
        ]}
      />
    </Card>
  )
}
