import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { RootController } from './root.controller'

@Module({
  controllers: [RootController, HealthController],
})
export class HealthModule {}
