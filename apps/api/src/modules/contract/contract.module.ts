import { Module } from '@nestjs/common'
import { PlatformModule } from '../platform/platform.module'
import { ContractsController } from './contracts.controller'
import { ContractService } from './contracts.service'

@Module({
  imports: [PlatformModule],
  controllers: [ContractsController],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
