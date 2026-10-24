import { Module } from '@nestjs/common'
import { EnablementController } from './enablement.controller'
import { TrackController } from './track.controller'

@Module({
  controllers: [EnablementController, TrackController],
})
export class EnablementModule {}
