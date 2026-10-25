import { createHmac, timingSafeEqual } from 'crypto'

/** 校验 X-ZhiXiao-Signature: t=<unix>,v1=<hex> */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string | undefined,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  if (!header) return false
  const m = /t=(\d+),v1=([0-9a-f]+)/.exec(header)
  if (!m) return false
  const t = Number(m[1])
  const v1 = m[2]
  if (Math.abs(nowSec - t) > toleranceSec) return false
  const expect = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  const a = Buffer.from(v1, 'hex')
  const b = Buffer.from(expect, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
