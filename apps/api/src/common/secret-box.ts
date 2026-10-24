import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * 存库的第三方密钥（如 AI 接口密钥）用 AES-256-GCM 加密。
 * 加密密钥取环境变量 SETTINGS_SECRET；未设置时用 JWT_ACCESS_SECRET 派生（更换它后需重新填写已存密钥）。
 */
function key(): Buffer {
  const material = process.env.SETTINGS_SECRET || process.env.JWT_ACCESS_SECRET || 'dev-access-change-me'
  return createHash('sha256').update(`crm-settings:${material}`).digest()
}

export function seal(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

/** 解密失败（密钥已更换或数据被改）返回 null */
export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed) return null
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !data) return null
  try {
    const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
