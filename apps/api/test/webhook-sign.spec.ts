import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from '../src/common/webhook-sign'

function sign(secret: string, t: number, raw: string) {
  return createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
}

describe('webhook signature', () => {
  it('stable hmac', () => {
    const sig = sign('s3cret', 1700000000, '{"a":1}')
    expect(sig).toHaveLength(64)
    expect(sign('s3cret', 1700000000, '{"a":1}')).toBe(sig)
    expect(sign('other', 1700000000, '{"a":1}')).not.toBe(sig)
  })

  it('header format t=,v1=', () => {
    const t = 1700000000
    const v1 = sign('s', t, 'x')
    const header = `t=${t},v1=${v1}`
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
  })

  it('verifyWebhookSignature accepts valid and rejects bad', () => {
    const secret = 's3cret'
    const raw = '{"a":1}'
    const t = Math.floor(Date.now() / 1000)
    const v1 = sign(secret, t, raw)
    expect(verifyWebhookSignature(secret, raw, `t=${t},v1=${v1}`)).toBe(true)
    expect(verifyWebhookSignature(secret, raw, `t=${t},v1=${'0'.repeat(64)}`)).toBe(false)
    expect(verifyWebhookSignature(secret, raw, undefined)).toBe(false)
    expect(verifyWebhookSignature(secret, raw, `t=${t - 10000},v1=${v1}`)).toBe(false)
  })
})
