import { Module } from '@nestjs/common'
import { SharesController } from './shares.controller'
import { SharesService } from './shares.service'

@Module({
  controllers: [SharesController],
  providers: [SharesService],
  exports: [SharesService],
})
export class ShareModule {}
