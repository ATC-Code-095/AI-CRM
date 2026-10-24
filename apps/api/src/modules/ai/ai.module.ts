import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { MockAiAdapter } from './mock-ai.adapter'
import { AiGateway } from './ai-gateway'
import { AiConfigService } from './ai-config.service'

@Module({
  controllers: [AiController],
  providers: [MockAiAdapter, AiGateway, AiConfigService],
  exports: [AiGateway],
})
export class AiModule {}
