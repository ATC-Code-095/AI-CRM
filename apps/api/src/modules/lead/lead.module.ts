import { Module } from '@nestjs/common'
import { NotifyModule } from '../notify/notify.module'
import { LeadsController } from './leads.controller'
import { LeadsService } from './leads.service'

@Module({
  imports: [NotifyModule],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadModule {}
