import { Controller, Get } from '@nestjs/common'
import { BUILD_INFO } from '../../common/build-info'
import { Public } from '../../common/decorators'
import { getPerfStats } from '../../common/middleware/request-log.middleware'
import { PrismaService } from '../../common/prisma/prisma.service'
import Redis from 'ioredis'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    let db = 'up'
    try {
      await this.prisma.$queryRaw`SELECT 1`
    } catch {
      db = 'down'
    }

    let redis = 'skipped'
    const url = process.env.REDIS_URL
    if (url) {
      try {
        const client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 1500,
        })
        await client.connect()
        const pong = await client.ping()
        redis = pong === 'PONG' ? 'up' : 'down'
        client.disconnect()
      } catch {
        redis = 'down'
      }
    }

    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      redis,
      // 部署后据此确认线上运行的版本
      version: BUILD_INFO.version,
      commit: BUILD_INFO.commit,
      builtAt: BUILD_INFO.builtAt,
    }
  }

  /** 性能监控：近 15 分钟 p50/p95 与慢接口 */
  @Public()
  @Get('perf')
  perf() {
    return getPerfStats()
  }
}
