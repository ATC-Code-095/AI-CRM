import { useQuery } from '@tanstack/react-query'
import { App, Button, Card, Space, Tag, Typography } from 'antd'
import { getAccessToken, apiUrl, webUrl } from '../../api/client'
import { ErpTable } from '../../components/ErpTable'
import { t } from '../../i18n'

interface OpenApiDoc {
  paths: Record<string, Record<string, { summary?: string; tags?: string[] }>>
}

/** 开发者接口文档站（内嵌 OpenAPI 目录 + curl） */
export default function ApiDocsPage() {
  const { message } = App.useApp()
  const q = useQuery({
    queryKey: ['openapi-catalog'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/v1/docs-json'))
      return (await res.json()) as OpenApiDoc
    },
    retry: false,
  })

  const rows = Object.entries(q.data?.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, meta]) => ({
      key: `${method} ${path}`,
      method: method.toUpperCase(),
      path,
      summary: meta.summary || meta.tags?.[0] || '',
    })),
  )

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>{t('platform.openApiDocs')}</Typography.Title>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap>
          <Button onClick={() => window.open(apiUrl('/api/v1/docs'), '_blank')}>Swagger UI</Button>
          <Button onClick={() => window.open(apiUrl('/api/v1/docs-json'), '_blank')}>OpenAPI JSON</Button>
          <Button
            onClick={() => {
              const token = getAccessToken() ?? '<TOKEN>'
              const snippet = [
                t('platform.signIn'),
                `curl -X POST ${webUrl('/api/v1')}/auth/login \\`,
                `  -H 'Content-Type: application/json' \\`,
                t('platform.dEmailPassword'),
                ``,
                t('platform.businessRequest'),
                `curl -H "Authorization: Bearer ${token}" \\`,
                `  ${webUrl('/api/v1')}/reports/dashboard`,
              ].join('\n')
              void navigator.clipboard.writeText(snippet)
              message.success(t('common.curlExampleCopied'))
            }}
          >{t('common.copyCurlExample')}</Button>
          <Tag color="blue">Base: {webUrl('/api/v1')}</Tag>
          <Tag>{t('platform.endpoints', { length: rows.length })}</Tag>
        </Space>
        <Typography.Paragraph style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: '#646A73' }}>{t('platform.authentication')}<code>Authorization: Bearer &lt;access_token&gt;</code>{t('platform.longLivedTokensCan', { v: ' ' })}
          <code>X-RateLimit-*</code>。
        </Typography.Paragraph>
      </Card>
      <Card size="small" title={t('platform.endpointCatalog')}>
        <ErpTable
          rowKey="key"
          storageKey="api-docs"
          loading={q.isLoading}
          dataSource={rows as unknown as Record<string, unknown>[]}
          columns={[
            {
              title: t('common.method'),
              dataIndex: 'method',
              width: 80,
              filterType: 'select',
              filterOptions: ['GET','POST','PUT','PATCH','DELETE'].map((s)=>({value:s,label:s})),
              render: (m: unknown) => (
                <Tag color={String(m) === 'GET' ? 'green' : String(m) === 'POST' ? 'blue' : String(m) === 'DELETE' ? 'red' : 'orange'}>
                  {String(m)}
                </Tag>
              ),
            },
            {
              title: t('common.path'),
              dataIndex: 'path',
              filterType: 'text',
              render: (v: unknown) => <code style={{ fontSize: 11 }}>{String(v)}</code>,
            },
            { title: t('common.notes'), dataIndex: 'summary' },
            {
              title: t('common.actions'),
              dataIndex: '__op',
              render: (_: unknown, row: Record<string, unknown>) => (
                <Button
                  size="small"
                  onClick={() => {
                    const r = row as { method: string; path: string }
                    const token = getAccessToken() ?? '<TOKEN>'
                    const body = r.method === 'GET' ? '' : " \\\n  -H 'Content-Type: application/json' -d '{}'"
                    const snippet = `curl -X ${r.method} ${webUrl('/api/v1')}${r.path} \\\n  -H "Authorization: Bearer ${token}"${body}`
                    void navigator.clipboard.writeText(snippet)
                    message.success(t('common.copied'))
                  }}
                >{t('platform.copyCurl')}</Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
