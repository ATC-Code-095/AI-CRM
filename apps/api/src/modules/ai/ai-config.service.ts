import { Injectable } from '@nestjs/common'
import { BizException, ErrorCodes } from '@ai-crm/shared'
import { PrismaService } from '../../common/prisma/prisma.service'
import { seal, unseal } from '../../common/secret-box'
import { tr } from '../../common/locale'
import { AiProvider, complete, DEFAULT_MODELS, LlmConfig, LlmError } from './llm'

const KEY = 'ai.config'

interface Stored {
  provider: AiProvider
  baseUrl?: string
  model?: string
  apiKeySealed?: string
}

export interface AiConfigView {
  provider: AiProvider
  baseUrl: string
  model: string
  hasKey: boolean
  /** 已存密钥无法解密（加密密钥被更换），需要重新填写 */
  keyUnreadable: boolean
  /** 来自服务器环境变量（AI_API_KEY）而非系统设置 */
  fromEnv: boolean
}

@Injectable()
export class AiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private async stored(tenantId: string): Promise<{ id?: string; value: Stored }> {
    const row = await this.prisma.setting.findFirst({ where: { tenantId, key: KEY, scope: 'TENANT' } })
    if (row && row.value && typeof row.value === 'object') return { id: row.id, value: row.value as unknown as Stored }
    // 兼容旧配置：ai_provider = http 且服务器设置了 AI_API_KEY
    const legacy = await this.prisma.setting.findFirst({ where: { tenantId, key: 'ai_provider', scope: 'TENANT' } })
    if (legacy?.value === 'http' && process.env.AI_API_KEY) {
      return { value: { provider: 'openai', baseUrl: process.env.AI_BASE_URL, model: process.env.AI_MODEL } }
    }
    return { value: { provider: 'mock' } }
  }

  async view(tenantId: string): Promise<AiConfigView> {
    const { id, value } = await this.stored(tenantId)
    const fromEnv = !id && value.provider !== 'mock'
    const sealedOk = value.apiKeySealed ? unseal(value.apiKeySealed) !== null : false
    return {
      provider: value.provider,
      baseUrl: value.baseUrl ?? '',
      model: value.model || (value.provider === 'mock' ? '' : DEFAULT_MODELS[value.provider]),
      hasKey: fromEnv || sealedOk,
      keyUnreadable: Boolean(value.apiKeySealed) && !sealedOk,
      fromEnv,
    }
  }

  /** 运行时配置；未配置或密钥不可用时返回 null（走内置模拟） */
  async runtime(tenantId: string): Promise<LlmConfig | null> {
    const { id, value } = await this.stored(tenantId)
    if (value.provider === 'mock') return null
    const apiKey = id ? unseal(value.apiKeySealed) : process.env.AI_API_KEY
    if (!apiKey) return null
    return {
      provider: value.provider,
      apiKey,
      baseUrl: value.baseUrl || undefined,
      model: value.model || DEFAULT_MODELS[value.provider],
    }
  }

  /** apiKey 留空表示沿用已存密钥 */
  async save(tenantId: string, body: { provider: AiProvider; baseUrl?: string; model?: string; apiKey?: string }) {
    const { id, value: prev } = await this.stored(tenantId)
    if (body.baseUrl) {
      let u: URL
      try {
        u = new URL(body.baseUrl)
      } catch {
        throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('接口地址格式不正确', 'Invalid API base URL'))
      }
      if (u.protocol !== 'https:') {
        throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('接口地址必须是 https://', 'The API base URL must use https://'))
      }
    }
    const next: Stored = {
      provider: body.provider,
      ...(body.baseUrl ? { baseUrl: body.baseUrl.trim() } : {}),
      ...(body.model ? { model: body.model.trim() } : {}),
      ...(body.apiKey ? { apiKeySealed: seal(body.apiKey.trim()) } : prev.apiKeySealed ? { apiKeySealed: prev.apiKeySealed } : {}),
    }
    if (next.provider !== 'mock' && !next.apiKeySealed) {
      throw new BizException(ErrorCodes.VALIDATION_FAILED, tr('请填写接口密钥', 'Enter the API key'))
    }
    if (id) await this.prisma.setting.update({ where: { id }, data: { value: next as never } })
    else await this.prisma.setting.create({ data: { tenantId, key: KEY, scope: 'TENANT', value: next as never } })
    return this.view(tenantId)
  }

  /** 用当前配置发一个最小请求，返回耗时或失败原因 */
  async test(tenantId: string) {
    const cfg = await this.runtime(tenantId)
    if (!cfg) return { ok: false, error: tr('尚未配置外部 AI，当前使用内置模拟', 'No external AI configured; the built-in mock is in use') }
    const started = Date.now()
    try {
      const text = await complete(cfg, 'Reply with the single word OK.', 'ping', 20)
      return { ok: true, ms: Date.now() - started, model: cfg.model, sample: text.slice(0, 40) }
    } catch (e) {
      return { ok: false, error: e instanceof LlmError ? `${e.kind}: ${e.message}` : (e as Error).message }
    }
  }
}
