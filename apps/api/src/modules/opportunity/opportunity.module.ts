import { Module } from '@nestjs/common'
import { PlatformModule } from '../platform/platform.module'
import { OpportunitiesController } from './opportunities.controller'
import { OpportunitiesService } from './opportunities.service'

@Module({
  imports: [PlatformModule],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunityModule {}
