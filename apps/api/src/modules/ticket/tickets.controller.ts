import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS, TicketStatus, TicketSeverity, TicketType } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { TicketsService } from './tickets.service'

class CreateTicketDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsString()
  accountId!: string

  @IsOptional()
  @IsString()
  contactId?: string

  @IsIn(Object.values(TicketType))
  type!: TicketType

  @IsOptional()
  @IsIn(Object.values(TicketSeverity))
  severity?: TicketSeverity

  @IsOptional()
  @IsString()
  resolution?: string
}

class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string

  @IsOptional()
  @IsString()
  contactId?: string

  @IsOptional()
  @IsIn(Object.values(TicketType))
  type?: TicketType

  @IsOptional()
  @IsIn(Object.values(TicketSeverity))
  severity?: TicketSeverity

  @IsOptional()
  @IsString()
  resolution?: string
}

class TransitionDto {
  @IsIn(Object.values(TicketStatus))
  toStatus!: TicketStatus

  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  @IsString()
  resolution?: string
}

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('sla-alerts')
  @Permissions(PERMISSIONS.TICKET_READ)
  slaAlerts(@CurrentUser() me: AuthUser) {
    return this.tickets.slaAlerts(me)
  }

  @Get()
  @Permissions(PERMISSIONS.TICKET_READ)
  list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.tickets.list(me, Number(page), Number(pageSize), status, accountId)
  }

  @Get(':id')
  @Permissions(PERMISSIONS.TICKET_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.tickets.detail(me, id)
  }

  @Post()
  @Permissions(PERMISSIONS.TICKET_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(me, dto as unknown as Record<string, unknown>)
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.TICKET_WRITE)
  update(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.tickets.update(me, id, dto)
  }

  @Post(':id/transition')
  @Permissions(PERMISSIONS.TICKET_TRANSITION)
  transition(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.tickets.transition(me, id, dto)
  }
}
