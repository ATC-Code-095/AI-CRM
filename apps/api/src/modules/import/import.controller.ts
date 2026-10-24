import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { ImportService } from './import.service'

class ImportCsvDto {
  @IsString()
  @MinLength(1)
  csv!: string
}

@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(private readonly importer: ImportService) {}

  @Post('leads')
  @Permissions(PERMISSIONS.LEAD_WRITE)
  importLeads(@CurrentUser() me: AuthUser, @Body() dto: ImportCsvDto) {
    return this.importer.importLeads(me, dto.csv)
  }

  @Post('preview')
  @Permissions(PERMISSIONS.LEAD_WRITE)
  preview(@Body() dto: ImportCsvDto) {
    return this.importer.preview(dto.csv ?? '')
  }

  @Post('contacts')
  @Permissions(PERMISSIONS.CONTACT_WRITE)
  importContacts(@CurrentUser() me: AuthUser, @Body() dto: ImportCsvDto) {
    return this.importer.importContacts(me, dto.csv)
  }

  @Post('accounts')
  @Permissions(PERMISSIONS.ACCOUNT_WRITE)
  importAccounts(@CurrentUser() me: AuthUser, @Body() dto: ImportCsvDto) {
    return this.importer.importAccounts(me, dto.csv)
  }

  @Post('leads-upload')
  @Permissions(PERMISSIONS.LEAD_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  importLeadsFile(@CurrentUser() me: AuthUser, @UploadedFile() file?: { buffer: Buffer }) {
    const text = file?.buffer?.toString('utf8') ?? ''
    return this.importer.importLeads(me, text)
  }
}
