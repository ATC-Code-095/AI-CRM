import type AnthropicClient from '@anthropic-ai/sdk'

/** 用到 Claude 时才加载 SDK：服务器缺少该依赖时 API 仍能启动，调用失败后退回内置结果 */
async function loadAnthropic(): Promise<typeof AnthropicClient> {
  return (await import('@anthropic-ai/sdk')).default
}

export type AiProvider = 'mock' | 'openai' | 'anthropic'

export interface LlmConfig {
  provider: Exclude<AiProvider, 'mock'>
  apiKey: string
  /** OpenAI 兼容接口的地址（如 https://api.deepseek.com/v1）；Anthropic 留空走官方地址 */
  baseUrl?: string
  model: string
}

export const DEFAULT_MODELS: Record<LlmConfig['provider'], string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4o-mini',
}

const TIMEOUT_MS = 60_000

/** 支持服务端拒答回退（fallbacks: "default"）的 Claude 模型 */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1'])

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'rate_limit' | 'timeout' | 'refusal' | 'bad_request' | 'unavailable',
  ) {
    super(message)
  }
}

/** 单轮文本生成：system 为角色与输出要求，user 为业务数据与问题 */
export async function complete(cfg: LlmConfig, system: string, user: string, maxTokens = 2000): Promise<string> {
  return cfg.provider === 'anthropic' ? completeAnthropic(cfg, system, user, maxTokens) : completeOpenAi(cfg, system, user, maxTokens)
}

async function completeAnthropic(cfg: LlmConfig, system: string, user: string, maxTokens: number): Promise<string> {
  let Anthropic: typeof AnthropicClient
  try {
    Anthropic = await loadAnthropic()
  } catch (e) {
    throw new LlmError(`Anthropic SDK unavailable: ${(e as Error).message}`, 'unavailable')
  }
  const client = new Anthropic({
    apiKey: cfg.apiKey,
    ...(cfg.baseUrl ? { baseURL: cfg.baseUrl } : {}),
    timeout: TIMEOUT_MS,
    maxRetries: 2,
  })
  const useFallback = !cfg.baseUrl && FALLBACK_MODELS.has(cfg.model)
  try {
    const res = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      // CRM 摘要与建议是短任务，低推理强度即可
      output_config: { effort: 'low' },
      // 安全分类器误拒时由服务端自动换模型重试
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    })
    if (res.stop_reason === 'refusal') throw new LlmError('model declined the request', 'refusal')
    return res.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim()
  } catch (e) {
    if (e instanceof LlmError) throw e
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      throw new LlmError(`authentication failed (${e.status})`, 'auth')
    }
    if (e instanceof Anthropic.RateLimitError) throw new LlmError('rate limited', 'rate_limit')
    if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) {
      throw new LlmError(`bad request (${e.status}): ${e.message}`, 'bad_request')
    }
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new LlmError('timeout', 'timeout')
    if (e instanceof Anthropic.APIError) throw new LlmError(`API error ${e.status ?? ''}`.trim(), 'unavailable')
    throw new LlmError((e as Error).message, 'unavailable')
  }
}

async function completeOpenAi(cfg: LlmConfig, system: string, user: string, maxTokens: number): Promise<string> {
  const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = (e as Error).name === 'TimeoutError'
    throw new LlmError(timeout ? 'timeout' : (e as Error).message, timeout ? 'timeout' : 'unavailable')
  }
  if (res.status === 401 || res.status === 403) throw new LlmError(`authentication failed (${res.status})`, 'auth')
  if (res.status === 429) throw new LlmError('rate limited', 'rate_limit')
  if (res.status >= 400 && res.status < 500) throw new LlmError(`bad request (${res.status})`, 'bad_request')
  if (!res.ok) throw new LlmError(`HTTP ${res.status}`, 'unavailable')
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return (json.choices?.[0]?.message?.content ?? '').trim()
}
