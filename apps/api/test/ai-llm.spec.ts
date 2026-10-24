import { afterEach, describe, expect, it, vi } from 'vitest'
import { seal, unseal } from '../src/common/secret-box'
import { complete, LlmError } from '../src/modules/ai/llm'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } })

describe('AI provider client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('encrypts stored API keys and rejects tampered values', () => {
    const s = seal('sk-test-123')
    expect(s).not.toContain('sk-test-123')
    expect(unseal(s)).toBe('sk-test-123')
    const parts = s.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(unseal(parts.join('.'))).toBeNull()
    expect(unseal('garbage')).toBeNull()
  })

  it('calls the Anthropic Messages API with low effort and server-side fallback', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: 'Summary text' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 3 },
      }),
    )
    const text = await complete({ provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-opus-5-5' }, 'sys', 'hello')
    expect(text).toBe('Summary text')
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('https://api.anthropic.com/v1/messages')
    const headers = new Headers(init.headers as HeadersInit)
    // SDK 1.x 以 Authorization: Bearer 发送 API 密钥
    expect(headers.get('authorization')).toBe('Bearer sk-ant-x')
    expect(headers.get('anthropic-version')).toBeTruthy()
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ model: 'claude-opus-5-5', system: 'sys', output_config: { effort: 'low' }, fallbacks: 'default' })
    expect(body.temperature).toBeUndefined()
  })

  it('treats a refusal stop reason as an error so the caller falls back', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: 'refusal', usage: { input_tokens: 1, output_tokens: 0 } }),
    )
    await expect(complete({ provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-5-5' }, 's', 'u')).rejects.toMatchObject({ kind: 'refusal' })
  })

  it('maps an invalid Anthropic key to an auth error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401))
    const err = await complete({ provider: 'anthropic', apiKey: 'bad', model: 'claude-opus-5-5' }, 's', 'u').catch((e) => e)
    expect(err).toBeInstanceOf(LlmError)
    expect(err.kind).toBe('auth')
  })

  it('calls OpenAI-compatible chat completions with the configured base URL', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ choices: [{ message: { content: ' hi ' } }] }))
    const text = await complete({ provider: 'openai', apiKey: 'sk-ds', baseUrl: 'https://api.deepseek.com/v1/', model: 'deepseek-chat' }, 'sys', 'u')
    expect(text).toBe('hi')
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(new Headers(init.headers as HeadersInit).get('authorization')).toBe('Bearer sk-ds')
    expect(JSON.parse(String(init.body)).messages[0]).toEqual({ role: 'system', content: 'sys' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 429))
    await expect(complete({ provider: 'openai', apiKey: 'k', model: 'm' }, 's', 'u')).rejects.toMatchObject({ kind: 'rate_limit' })
  })
})
