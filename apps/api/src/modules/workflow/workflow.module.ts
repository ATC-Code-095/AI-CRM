import { Module } from '@nestjs/common'
import { NotifyModule } from '../notify/notify.module'
import { ApprovalsController } from './approvals.controller'
import { ApprovalsService } from './approvals.service'

@Module({
  imports: [NotifyModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class WorkflowModule {}
