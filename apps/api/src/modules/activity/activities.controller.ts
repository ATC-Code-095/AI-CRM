import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'
import { ActivityType, PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { ActivitiesService } from './activities.service'

class CreateActivityDto {
  @IsIn(Object.values(ActivityType))
  type!: ActivityType

  @IsString()
  @MinLength(1)
  subject!: string

  @IsOptional()
  @IsString()
  entityType?: string

  @IsOptional()
  @IsString()
  entityId?: string

  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  dueAt?: Date

  @IsOptional()
  startAt?: Date
}

@ApiTags('activity')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get('my-today')
  @Permissions(PERMISSIONS.ACTIVITY_READ)
  myToday(@CurrentUser() me: AuthUser) {
    return this.activities.myToday(me)
  }

  @Get('visit-route')
  @Permissions(PERMISSIONS.ACTIVITY_READ)
  visitRoute(@CurrentUser() me: AuthUser, @Query('date') date?: string) {
    return this.activities.visitRoute(me, date)
  }

  @Post('visit-plan')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  visitPlan(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      date: string
      items: Array<{ accountId?: string; subject?: string; time?: string; location?: string }>
    },
  ) {
    return this.activities.visitPlan(me, body)
  }

  @Get()
  @Permissions(PERMISSIONS.ACTIVITY_READ)
  list(
    @CurrentUser() me: AuthUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.activities.list(me, {
      entityType,
      entityId,
      page: Number(page),
      pageSize: Number(pageSize),
      from,
      to,
      status,
    })
  }

  @Post('batch')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  createBatch(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      items: Array<{
        type?: string
        subject: string
        content?: string
        entityType?: string
        entityId?: string
        dueAt?: string | null
      }>
    },
  ) {
    return this.activities.createBatch(me, body?.items ?? [])
  }

  @Post()
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateActivityDto) {
    return this.activities.create(me, dto as unknown as Record<string, unknown>)
  }

  @Post('check-in')
  @Permissions(PERMISSIONS.ACTIVITY_CHECKIN)
  checkIn(
    @CurrentUser() me: AuthUser,
    @Body() body: { id: string; lat: number; lng: number; address?: string },
  ) {
    return this.activities.checkIn(me, body)
  }

  @Post('complete')
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  complete(@CurrentUser() me: AuthUser, @Body() body: { id: string }) {
    return this.activities.complete(me, body.id)
  }
}
