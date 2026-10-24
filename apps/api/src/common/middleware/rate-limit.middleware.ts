import { HttpException, HttpStatus, Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'

/** IP + path + user 三维限流 */
const buckets = new Map<string, number[]>()

const LIMITS: Array<{ match: RegExp; max: number; windowMs: number; byUser?: boolean }> = [
  // 登录：开发/E2E 放宽到 20；生产可用 LOGIN_RATE_LIMIT 收紧
  {
    match: /\/auth\/login$/,
    max: Number(process.env.LOGIN_RATE_LIMIT ?? 20),
    windowMs: 60_000,
  },
  { match: /\/auth\/refresh$/, max: 30, windowMs: 60_000 },
  { match: /\/forms\/.+\/submit$/, max: 5, windowMs: 60_000 },
  { match: /\/search$/, max: 60, windowMs: 60_000, byUser: true },
  // 写接口防刷
  { match: /\/leads$/, max: 120, windowMs: 60_000, byUser: true },
  { match: /\/accounts$/, max: 120, windowMs: 60_000, byUser: true },
  { match: /\/opportunities$/, max: 120, windowMs: 60_000, byUser: true },
  { match: /\/activities$/, max: 180, windowMs: 60_000, byUser: true },
  { match: /\/meetings$/, max: 60, windowMs: 60_000, byUser: true },
  { match: /\/email-templates$/, max: 60, windowMs: 60_000, byUser: true },
  // 导出/批量
  { match: /\/export=csv$/, max: 20, windowMs: 60_000, byUser: true },
  { match: /\/jobs\//, max: 10, windowMs: 60_000, byUser: true },
]

function bump(key: string, windowMs: number, max: number) {
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  const remaining = Math.max(0, max - hits.length)
  const resetAt = hits.length ? Math.ceil((hits[0] + windowMs - now) / 1000) : Math.ceil(windowMs / 1000)
  return { hits, remaining, resetAt }
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const path = req.path
    const rule = LIMITS.find((r) => r.match.test(path))
    if (!rule) return next()

    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    // JWT sub 可能未解析，用 header 近似 userId；无则仅 IP
    const auth = req.headers.authorization ?? ''
    const userId = auth ? String(auth.length) : 'anon'
    const key = rule.byUser ? `${ip}:${userId}:${path}` : `${ip}:${path}`
    const { hits, remaining, resetAt } = bump(key, rule.windowMs, rule.max)

    res.setHeader('X-RateLimit-Limit', String(rule.max))
    res.setHeader('X-RateLimit-Remaining', String(remaining))
    res.setHeader('X-RateLimit-Reset', String(resetAt))

    if (hits.length >= rule.max) {
      res.setHeader('Retry-After', String(Math.ceil(rule.windowMs / 1000)))
      throw new HttpException(
        {
          code: 42900,
          message: 'Too many requests',
          data: { retryAfter: Math.ceil(rule.windowMs / 1000) },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    hits.push(Date.now())
    buckets.set(key, hits)

    // 内存水位保护：超过 2 万键时清理过期
    if (buckets.size > 20000) {
      const now = Date.now()
      for (const [k, arr] of buckets) {
        const live = arr.filter((t) => now - t < 60_000)
        if (!live.length) buckets.delete(k)
        else buckets.set(k, live)
      }
    }
    next()
  }
}

export function resetRateLimits() {
  buckets.clear()
}
