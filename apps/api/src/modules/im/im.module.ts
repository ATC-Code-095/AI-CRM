import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ImAdminController, SsoController } from './im.controller'
import { ImService } from './im.service'

@Module({
  imports: [AuthModule],
  controllers: [ImAdminController, SsoController],
  providers: [ImService],
})
export class ImModule {}
