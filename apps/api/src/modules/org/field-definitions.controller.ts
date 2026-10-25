import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'
import { ApiTags } from '@nestjs/swagger'
import {
  PERMISSIONS,
  LeadStatus,
  LeadSource,
  AccountLevel,
  AccountStage,
  QuoteStatus,
  ContractStatus,
  PaymentStatus,
  TicketStatus,
  ActivityType,
  ActivityStatus,
  ApprovalStatus,
  StdStageCode,
  EntityType,
} from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { BizException, ErrorCodes } from '@zhixiao-crm/shared'
import { tr } from '../../common/locale'

class CreateFieldDto {
  @IsString()
  @MinLength(1)
  entity!: string

  @IsString()
  @MinLength(1)
  apiName!: string

  @IsString()
  @MinLength(1)
  label!: string

  @IsString()
  dataType!: string

  @IsOptional()
  @IsBoolean()
  required?: boolean
}

class UpdateFieldDto {
  @IsOptional()
  @IsString()
  label?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsBoolean()
  required?: boolean
}

@ApiTags('field-definitions')
@Controller('field-definitions')
export class FieldDefinitionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.FIELD_DEFINITION_READ)
  list(@CurrentUser() me: AuthUser, @Query('entity') entity?: string) {
    return this.prisma.fieldDefinition.findMany({
      where: {
        tenantId: me.tenantId,
        deletedAt: null,
        ...(entity ? { entity } : {}),
      },
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }],
    })
  }

  @Post()
  @Permissions(PERMISSIONS.FIELD_DEFINITION_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateFieldDto) {
    return this.prisma.fieldDefinition.create({
      data: {
        tenantId: me.tenantId,
        entity: dto.entity,
        apiName: dto.apiName,
        label: dto.label,
        dataType: dto.dataType,
        required: dto.required ?? false,
        isActive: true,
      },
    })
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.FIELD_DEFINITION_WRITE)
  async update(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFieldDto,
  ) {
    const row = await this.prisma.fieldDefinition.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!row) throw new BizException(ErrorCodes.NOT_FOUND, 'field not found')
    return this.prisma.fieldDefinition.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
      },
    })
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.FIELD_DEFINITION_WRITE)
  async remove(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    await this.prisma.fieldDefinition.updateMany({
      where: { id, tenantId: me.tenantId },
      data: { deletedAt: new Date() },
    })
    return { ok: true }
  }

  /** 数据字典：枚举 + 实体字段 + 自定义字段 */
  @Get('dictionary')
  @Permissions(PERMISSIONS.FIELD_DEFINITION_READ)
  async dictionary(@CurrentUser() me: AuthUser) {
    const customFields = await this.prisma.fieldDefinition.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }],
      select: {
        entity: true,
        apiName: true,
        label: true,
        dataType: true,
        required: true,
        isActive: true,
      },
    })

    const enumMap = (E: Record<string, string>) =>
      Object.entries(E).map(([k, v]) => ({ code: v, label: k }))

    return {
      enums: [
        { name: 'LeadStatus', label: tr('线索状态', 'Lead status'), items: enumMap(LeadStatus) },
        { name: 'LeadSource', label: tr('线索来源', 'Lead source'), items: enumMap(LeadSource) },
        { name: 'AccountLevel', label: tr('客户等级', 'Account level'), items: enumMap(AccountLevel) },
        { name: 'AccountStage', label: tr('客户阶段', 'Account stage'), items: enumMap(AccountStage) },
        { name: 'QuoteStatus', label: tr('报价状态', 'Quote status'), items: enumMap(QuoteStatus) },
        { name: 'ContractStatus', label: tr('合同状态', 'Contract status'), items: enumMap(ContractStatus) },
        { name: 'PaymentStatus', label: tr('回款状态', 'Payment status'), items: enumMap(PaymentStatus) },
        { name: 'TicketStatus', label: tr('工单状态', 'Ticket status'), items: enumMap(TicketStatus) },
        { name: 'ActivityType', label: tr('活动类型', 'Activity type'), items: enumMap(ActivityType) },
        { name: 'ActivityStatus', label: tr('活动状态', 'Activity status'), items: enumMap(ActivityStatus) },
        { name: 'ApprovalStatus', label: tr('审批状态', 'Approval status'), items: enumMap(ApprovalStatus) },
        { name: 'StdStageCode', label: tr('商机阶段码', 'Opportunity stage code'), items: enumMap(StdStageCode) },
        { name: 'EntityType', label: tr('实体类型', 'Entity type'), items: enumMap(EntityType) },
      ],
      entities: [
        { code: 'LEAD', label: tr('线索', 'Lead'), fields: ['name', 'source', 'status', 'score', 'ownerId', 'expectedAmount'] },
        { code: 'ACCOUNT', label: tr('客户', 'Account'), fields: ['name', 'level', 'stage', 'industry', 'ownerId', 'tags'] },
        { code: 'OPPORTUNITY', label: tr('商机', 'Opportunity'), fields: ['name', 'amount', 'winRate', 'stage', 'competitor', 'nextStep'] },
        { code: 'QUOTE', label: tr('报价', 'Quote'), fields: ['quoteNo', 'subject', 'status', 'total', 'discountRateMax'] },
        { code: 'CONTRACT', label: tr('合同', 'Contract'), fields: ['contractNo', 'total', 'expireDate', 'status', 'receivedAmount'] },
        { code: 'PAYMENT', label: tr('回款', 'Payment'), fields: ['paymentNo', 'amount', 'paidAt', 'status'] },
        { code: 'ACTIVITY', label: tr('跟进', 'Activity'), fields: ['type', 'subject', 'dueAt', 'status', 'checkInLat'] },
        { code: 'TICKET', label: tr('工单', 'Ticket'), fields: ['ticketNo', 'title', 'severity', 'status', 'slaDueAt'] },
      ],
      customFields,
    }
  }
}
