import { Global, Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotifyExternalController } from './notify-external.controller'
import { NotificationsService } from './notifications.service'
import { PushService } from './push.service'
import { BotsService } from './bots.service'
import { DevicePushService } from './device-push.service'
import { PushController } from './push.controller'

/** 全局模块：任何业务模块都可注入 PushService 发通知 */
@Global()
@Module({
  controllers: [NotificationsController, NotifyExternalController, PushController],
  providers: [NotificationsService, PushService, BotsService, DevicePushService],
  exports: [NotificationsService, PushService, BotsService, DevicePushService],
})
export class NotifyModule {}
