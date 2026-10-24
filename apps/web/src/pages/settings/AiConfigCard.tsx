import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, AutoComplete, Button, Card, Form, Input, Select, Space, Tag, Typography } from 'antd'
import { useEffect } from 'react'
import { api } from '../../api/client'
import { t } from '../../i18n'

type Provider = 'mock' | 'openai' | 'anthropic'

interface AiConfig {
  provider: Provider
  baseUrl: string
  model: string
  hasKey: boolean
  keyUnreadable: boolean
  fromEnv: boolean
}

/** OpenAI 兼容接口的常用服务商：选中后自动填地址与模型 */
const OPENAI_PRESETS = [
  { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { key: 'qwen', label: () => t('ai.preset.qwen'), baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { key: 'moonshot', label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
]

const CLAUDE_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']

/** AI 助手接口：Claude（Anthropic）或 OpenAI 兼容接口；密钥加密保存，不回传 */
export function AiConfigCard({ className }: { className?: string }) {
  const { message } = App.useApp()
  const qc = useQueryClient()
  const [form] = Form.useForm<{ provider: Provider; baseUrl?: string; model?: string; apiKey?: string }>()
  const provider = Form.useWatch('provider', form)
  const q = useQuery({ queryKey: ['ai-config'], queryFn: () => api<AiConfig>('/ai/config') })

  useEffect(() => {
    if (q.data) form.setFieldsValue({ provider: q.data.provider, baseUrl: q.data.baseUrl, model: q.data.model, apiKey: '' })
  }, [q.data, form])

  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) => api<AiConfig>('/ai/config', { method: 'PUT', body: JSON.stringify(v) }),
    onSuccess: () => {
      message.success(t('common.save'))
      void qc.invalidateQueries({ queryKey: ['ai-config'] })
    },
    onError: (e: Error) => message.error(e.message),
  })
  const test = useMutation({
    mutationFn: () => api<{ ok: boolean; ms?: number; model?: string; error?: string }>('/ai/config/test', { method: 'POST' }),
    onSuccess: (r) =>
      r.ok ? message.success(t('ai.testOk', { model: r.model, ms: r.ms })) : message.error(t('ai.testFailed', { v: r.error ?? '' })),
    onError: (e: Error) => message.error(e.message),
  })

  const submit = async () => {
    const v = await form.validateFields()
    save.mutate({
      provider: v.provider,
      ...(v.provider !== 'mock' && v.baseUrl ? { baseUrl: v.baseUrl } : {}),
      ...(v.provider !== 'mock' && v.model ? { model: v.model } : {}),
      ...(v.apiKey ? { apiKey: v.apiKey } : {}),
    })
  }

  const status = q.data
  return (
    <Card size="small" className={className} title={t('ai.title')} loading={q.isLoading}>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('ai.intro')}
      </Typography.Paragraph>
      {status?.keyUnreadable && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('ai.keyUnreadable')} />}
      {status?.fromEnv && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('ai.fromEnv')} />}
      <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
        <Form.Item name="provider" label={t('ai.provider')}>
          <Select
            options={[
              { value: 'mock', label: t('ai.provider.mock') },
              { value: 'anthropic', label: 'Claude (Anthropic)' },
              { value: 'openai', label: t('ai.provider.openai') },
            ]}
            onChange={(p: Provider) => {
              if (p === 'anthropic') form.setFieldsValue({ baseUrl: '', model: 'claude-opus-5-5' })
              if (p === 'openai') form.setFieldsValue({ baseUrl: OPENAI_PRESETS[0].baseUrl, model: OPENAI_PRESETS[0].model })
            }}
          />
        </Form.Item>
        {provider === 'openai' && (
          <Form.Item label={t('ai.preset')}>
            <Space wrap>
              {OPENAI_PRESETS.map((p) => (
                <Button key={p.key} size="small" onClick={() => form.setFieldsValue({ baseUrl: p.baseUrl, model: p.model })}>
                  {typeof p.label === 'function' ? p.label() : p.label}
                </Button>
              ))}
            </Space>
          </Form.Item>
        )}
        {provider !== 'mock' && (
          <>
            {provider === 'openai' && (
              <Form.Item name="baseUrl" label={t('ai.baseUrl')} rules={[{ required: true, message: t('validation.required') }]}>
                <Input placeholder="https://…/v1" />
              </Form.Item>
            )}
            <Form.Item name="model" label={t('ai.model')} rules={[{ required: true, message: t('validation.required') }]}>
              {provider === 'anthropic' ? <AutoComplete options={CLAUDE_MODELS.map((m) => ({ value: m }))} /> : <Input />}
            </Form.Item>
            <Form.Item
              name="apiKey"
              label={t('ai.apiKey')}
              extra={status?.hasKey && !status.fromEnv ? t('ai.keyKeep') : t('ai.keyHint')}
              rules={[{ required: !status?.hasKey || status.fromEnv, message: t('validation.required') }]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </>
        )}
        <Space>
          <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
          <Button loading={test.isPending} disabled={status?.provider === 'mock'} onClick={() => test.mutate()}>
            {t('ai.test')}
          </Button>
          {status && (
            <Tag color={status.provider === 'mock' ? 'default' : status.hasKey ? 'green' : 'orange'}>
              {status.provider === 'mock' ? t('ai.provider.mock') : status.hasKey ? t('ai.active') : t('ai.noKey')}
            </Tag>
          )}
        </Space>
      </Form>
    </Card>
  )
}
