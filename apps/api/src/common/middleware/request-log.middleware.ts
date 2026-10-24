import { Injectable, Logger, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'crypto'

/** 滑动窗口性能样本（内存，单实例） */
const samples: Array<{ path: string; ms: number; status: number; at: number }> = []
const MAX = 2000

export function recordSample(path: string, ms: number, status: number) {
  samples.push({ path, ms, status, at: Date.now() })
  if (samples.length > MAX) samples.splice(0, samples.length - MAX)
}

export function getPerfStats() {
  const now = Date.now()
  const recent = samples.filter((s) => now - s.at < 15 * 60_000)
  const durations = recent.map((s) => s.ms).sort((a, b) => a - b)
  const pct = (p: number) =>
    durations.length ? durations[Math.min(durations.length - 1, Math.floor((durations.length * p) / 100))] : 0
  const byPath = new Map<string, { count: number; totalMs: number; maxMs: number }>()
  for (const s of recent) {
    const key = s.path.split('?')[0]
    const row = byPath.get(key) ?? { count: 0, totalMs: 0, maxMs: 0 }
    row.count++
    row.totalMs += s.ms
    row.maxMs = Math.max(row.maxMs, s.ms)
    byPath.set(key, row)
  }
  return {
    windowMinutes: 15,
    total: recent.length,
    errorCount: recent.filter((s) => s.status >= 400).length,
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    avg: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0,
    slowest: [...byPath.entries()]
      .map(([path, v]) => ({
        path,
        count: v.count,
        avgMs: Math.round(v.totalMs / v.count),
        maxMs: v.maxMs,
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 10),
  }
}

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now()
    const requestId = (req.headers['x-request-id'] as string) || randomUUID()
    res.setHeader('x-request-id', requestId)
    res.on('finish', () => {
      const ms = Date.now() - start
      recordSample(req.originalUrl, ms, res.statusCode)
      if (ms > 500 || res.statusCode >= 400) {
        this.logger.log(
          JSON.stringify({
            requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            ms,
          }),
        )
      }
    })
    next()
  }
}
