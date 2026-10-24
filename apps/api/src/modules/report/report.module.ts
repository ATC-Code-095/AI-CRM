import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { GoalsController } from './goals.controller'

@Module({
  controllers: [ReportsController, GoalsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportModule {}
