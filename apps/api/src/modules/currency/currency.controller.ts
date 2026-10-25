import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { IsArray, IsBoolean, IsNotEmpty, IsNumberString, IsOptional, IsString, Matches } from 'class-validator'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { CurrencyService } from './currency.service'

class BaseDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string
}

class RateDto {
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string

  /** 1 单位该币种 = rate 单位本位币 */
  @IsNumberString()
  rate!: string

  @IsString()
  @IsNotEmpty()
  effectiveDate!: string
}

class AutoDto {
  @IsBoolean()
  enabled!: boolean

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  currencies?: string[]
}

/** 多币种：本位币与汇率。汇率可手工录入，也可每天从欧洲央行参考汇率自动更新，按日期生效 */
@ApiTags('currency')
@Controller('currency')
export class CurrencyController {
  constructor(private readonly svc: CurrencyService) {}

  @Get()
  @ApiOperation({ summary: '本位币、可用币种与汇率（任何登录用户可读，用于单据选择币种）' })
  overview(@CurrentUser() me: AuthUser) {
    return this.svc.overview(me)
  }

  @Put('base')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '设置本位币（仅在未录入汇率、无外币单据时允许）' })
  setBase(@CurrentUser() me: AuthUser, @Body() dto: BaseDto) {
    return this.svc.setBase(me, dto.currency)
  }

  @Post('rates')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '新增或更新某币种某日起的汇率' })
  addRate(@CurrentUser() me: AuthUser, @Body() dto: RateDto) {
    return this.svc.addRate(me, dto)
  }

  @Delete('rates/:id')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  removeRate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.svc.removeRate(me, id)
  }

  @Get('auto')
  @Permissions(PERMISSIONS.ORG_SETTING_READ)
  @ApiOperation({ summary: '汇率自动更新配置与上次结果' })
  getAuto(@CurrentUser() me: AuthUser) {
    return this.svc.getAuto(me.tenantId)
  }

  @Put('auto')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '开启 / 关闭每日自动更新汇率，选择币种' })
  setAuto(@CurrentUser() me: AuthUser, @Body() dto: AutoDto) {
    return this.svc.setAuto(me, dto)
  }

  @Post('auto/run')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '立即从欧洲央行参考汇率更新一次' })
  runAuto(@CurrentUser() me: AuthUser) {
    return this.svc.runAuto(me.tenantId, me.id)
  }

  @Post('recompute')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  @ApiOperation({ summary: '按当前汇率表重新折算全部单据的本位币金额' })
  recompute(@CurrentUser() me: AuthUser) {
    return this.svc.recompute(me)
  }
}
