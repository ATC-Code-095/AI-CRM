import { Module } from '@nestjs/common'
import { WebhooksController } from './webhooks.controller'
import { WebhooksService } from './webhooks.service'
import { WebhookIngressController } from './webhook-ingress.controller'
import { ApiTokensController } from './api-tokens.controller'

@Module({
  controllers: [WebhooksController, WebhookIngressController, ApiTokensController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class PlatformModule {}
