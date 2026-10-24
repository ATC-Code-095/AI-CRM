import { Module } from '@nestjs/common'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'
import { ContactsController } from './contacts.controller'

@Module({
  controllers: [AccountsController, ContactsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountModule {}
