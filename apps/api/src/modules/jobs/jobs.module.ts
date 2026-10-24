import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { NotifyModule } from '../notify/notify.module'
import { JobsController } from './jobs.controller'
import { JobsService } from './jobs.service'

@Module({
  imports: [ScheduleModule.forRoot(), NotifyModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
