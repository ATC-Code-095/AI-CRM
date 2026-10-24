import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { SettingsController } from './settings.controller'
import { DepartmentsController } from './departments.controller'
import { RolesController } from './roles.controller'
import { AuditController } from './audit.controller'
import { FieldDefinitionsController } from './field-definitions.controller'
import { PreferencesController } from './preferences.controller'
import { GroupController } from './group.controller'
import { GroupStore } from './group.store'

@Module({
  controllers: [
    UsersController,
    SettingsController,
    DepartmentsController,
    RolesController,
    AuditController,
    FieldDefinitionsController,
    PreferencesController,
    GroupController,
  ],
  providers: [
    UsersService,
    GroupStore,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [UsersService],
})
export class OrgModule {}
