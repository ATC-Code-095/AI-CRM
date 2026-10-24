import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { ContractService } from './contracts.service'

class ContractLineDto {
  @IsString()
  productId!: string

  @IsString()
  name!: string

  @IsString()
  qty!: string

  @IsString()
  unitPrice!: string

  @IsOptional()
  @IsString()
  discountRate?: string

  @IsString()
  amount!: string
}

class PutLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractLineDto)
  lines!: ContractLineDto[]
}

class PlanDto {
  @IsString()
  seq!: string

  @IsString()
  dueDate!: string

  @IsString()
  amount!: string
}

class PlansDto {
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => PlanDto)
  plans!: PlanDto[]
}

class CreateContractDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsString()
  accountId!: string

  @IsOptional()
  @IsString()
  opportunityId?: string

  @IsOptional()
  @IsString()
  terms?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  templateId?: string

  /** 币种（3 位代码）；不填时沿用关联商机的币种，否则为本位币 */
  @IsOptional()
  @IsString()
  currency?: string
}

class CreatePaymentDto {
  @IsString()
  contractId!: string

  @IsOptional()
  @IsString()
  paymentPlanId?: string

  @IsString()
  amount!: string

  @IsString()
  paidAt!: string

  @IsOptional()
  @IsString()
  method?: string

  @IsOptional()
  @IsString()
  remark?: string
}

@ApiTags('contracts')
@Controller()
export class ContractsController {
  constructor(private readonly contracts: ContractService) {}

  @Get('contracts')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  list(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('accountId') accountId?: string,
  ) {
    return this.contracts.list(me, Number(page), Number(pageSize), accountId)
  }

  @Get('esign/board')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  async eSignBoard(@CurrentUser() me: AuthUser) {
    return this.contracts.eSignBoard(me)
  }

  @Get('contracts/renewal-pipeline')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  async renewalPipeline(@CurrentUser() me: AuthUser) {
    return this.contracts.renewalPipeline(me)
  }

  @Get('contracts/:id')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.detail(me, id)
  }

  @Post('contracts')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  create(@CurrentUser() me: AuthUser, @Body() dto: CreateContractDto) {
    return this.contracts.create(me, dto as unknown as Record<string, unknown>)
  }

  @Post('contracts/batch-delete')
  @Permissions(PERMISSIONS.CONTRACT_DELETE)
  async batchDelete(@CurrentUser() me: AuthUser, @Body() body: { ids: string[] }) {
    return this.contracts.batchDelete(me, body.ids ?? [])
  }

  @Post('contracts/batch-request-sign')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  async batchRequestSign(@CurrentUser() me: AuthUser, @Body() body: { ids: string[] }) {
    return this.contracts.batchRequestSign(me, body.ids ?? [])
  }

  @Post('contracts/:id/renew')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  async renew(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body?: { withQuote?: boolean },
  ) {
    return this.contracts.renew(me, id, { withQuote: !!body?.withQuote })
  }

  @Post('contracts/:id/effective')
  @Permissions(PERMISSIONS.CONTRACT_EFFECTIVE)
  effective(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.effective(me, id)
  }

  @Post('contracts/:id/terminate')
  @Permissions(PERMISSIONS.CONTRACT_EFFECTIVE)
  terminate(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.contracts.terminate(me, id, body?.reason)
  }

  @Post('contracts/:id/request-sign')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  requestSign(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.requestSign(me, id)
  }

  @Post('contracts/:id/confirm-sign')
  @Permissions(PERMISSIONS.CONTRACT_EFFECTIVE)
  confirmSign(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.confirmSign(me, id)
  }

  @Post('contracts/:id/esign')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  async eSign(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { party: 'A' | 'B'; sealName?: string },
  ) {
    return this.contracts.eSign(me, id, body)
  }

  @Get('contracts/:id/esign')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  async eSignStatus(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.eSignStatus(me, id)
  }

  @Get('esign/seals')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  async listSeals(@CurrentUser() me: AuthUser) {
    return this.contracts.listSeals(me)
  }

  @Post('esign/seals')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  async createSeal(
    @CurrentUser() me: AuthUser,
    @Body() body: { name: string; type?: string; party?: string },
  ) {
    return this.contracts.createSeal(me, body)
  }

  /** 电子签服务商配置：内置 / e签宝 / 法大大 */
  @Get('esign/provider')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  async getEsignProvider(@CurrentUser() me: AuthUser) {
    return this.contracts.getEsignProvider(me)
  }

  @Put('esign/provider')
  @Permissions(PERMISSIONS.ORG_SETTING_WRITE)
  async setEsignProvider(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      provider: 'BUILTIN' | 'EQB' | 'FADADA'
      appId?: string
      appSecret?: string
      orgId?: string
      callbackUrl?: string
      enabled?: boolean
    },
  ) {
    return this.contracts.setEsignProvider(me, body)
  }

  @Patch('contracts/:id')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  async update(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { title?: string; terms?: string; templateId?: string },
  ) {
    return this.contracts.updateMeta(me, id, body)
  }

  @Put('contracts/:id/lines')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  putLines(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: PutLinesDto,
  ) {
    return this.contracts.putLines(me, id, (body.lines ?? []) as never)
  }

  @Get('invoices')
  @Permissions(PERMISSIONS.PAYMENT_READ)
  async listInvoices(@CurrentUser() me: AuthUser, @Query('contractId') contractId?: string) {
    return this.contracts.listInvoices(me, contractId)
  }

  @Get('invoices/reconcile')
  @Permissions(PERMISSIONS.PAYMENT_READ)
  async invoiceReconcile(
    @CurrentUser() me: AuthUser,
    @Query('onlyIssues') onlyIssues?: string,
    @Query('export') exp?: string,
    @Res({ passthrough: true }) res?: { set: (h: Record<string, string>) => void },
  ) {
    const data = await this.contracts.invoiceReconcile(me, onlyIssues === '1' || onlyIssues === 'true')
    if (exp !== 'csv') return data
    const header = [
      'contractNo',
      'title',
      'accountName',
      'status',
      'contractTotal',
      'invoicedAmount',
      'receivedAmount',
      'pendingInvoice',
      'pendingPayment',
      'invoicePayGap',
      'flags',
      'level',
    ]
    const csv = [
      header.join(','),
      ...data.items.map((r: Record<string, unknown>) =>
        header
          .map((h) => {
            const v = h === 'flags' ? (r.flags as string[]).join('|') : r[h]
            return `"${String(v ?? '').replace(/"/g, '""')}"`
          })
          .join(','),
      ),
    ].join('\n')
    res?.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoice-reconcile_${Date.now()}.csv"`,
    })
    return '﻿' + csv
  }

  @Post('invoices/:id/status')
  @Permissions(PERMISSIONS.PAYMENT_WRITE)
  async updateInvoiceStatus(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: 'VOID' | 'REVERSED' | 'ISSUED'; remark?: string },
  ) {
    return this.contracts.updateInvoiceStatus(me, id, body?.status ?? 'ISSUED', body?.remark)
  }

  @Post('invoices')
  @Permissions(PERMISSIONS.PAYMENT_WRITE)
  async createInvoice(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      contractId: string
      invoiceNo: string
      amount: string
      type?: string
      remark?: string
    },
  ) {
    return this.contracts.createInvoice(me, body)
  }

  @Get('change-orders')
  @Permissions(PERMISSIONS.CONTRACT_READ)
  async listChangeOrders(@CurrentUser() me: AuthUser, @Query('contractId') contractId?: string) {
    return this.contracts.listChangeOrders(me, contractId)
  }

  @Post('change-orders')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  async createChangeOrder(
    @CurrentUser() me: AuthUser,
    @Body() body: { contractId: string; title: string; reason: string; amountDelta?: string },
  ) {
    return this.contracts.createChangeOrder(me, body)
  }

  @Post('change-orders/:id/decide')
  @Permissions(PERMISSIONS.CONTRACT_EFFECTIVE)
  async decideChangeOrder(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT' },
  ) {
    return this.contracts.approveChangeOrder(me, id, body?.action ?? 'APPROVE')
  }

  @Get('payment-plans')
  @Permissions(PERMISSIONS.PAYMENT_READ)
  async listPaymentPlans(
    @CurrentUser() me: AuthUser,
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.contracts.listPaymentPlans(me, {
      contractId,
      status,
      overdue: overdue === 'true' || overdue === '1',
    })
  }

  @Post('payment-plans/:id/nudge')
  @Permissions(PERMISSIONS.PAYMENT_WRITE)
  async nudgePlan(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.contracts.nudgePlan(me, id, body?.note)
  }

  @Put('contracts/:id/plans')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  plans(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: PlansDto) {
    return this.contracts.putPlans(me, id, dto.plans as unknown as Record<string, unknown>[])
  }

  @Get('payments')
  @Permissions(PERMISSIONS.PAYMENT_READ)
  payments(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('contractId') contractId?: string,
  ) {
    return this.contracts.payments(me, Number(page), Number(pageSize), contractId)
  }

  @Post('payments')
  @Permissions(PERMISSIONS.PAYMENT_WRITE)
  createPayment(
    @CurrentUser() me: AuthUser,
    @Body() dto: CreatePaymentDto,
    @Req() req: { headers: Record<string, string | undefined> },
  ) {
    return this.contracts.createPayment(
      me,
      dto as unknown as Record<string, unknown>,
      req.headers['idempotency-key'] as string | undefined,
    )
  }

  @Post('payments/:id/confirm')
  @ApiOperation({ summary: 'Confirm payment' })
  @Permissions(PERMISSIONS.PAYMENT_CONFIRM)
  confirm(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() body: { version?: number }) {
    return this.contracts.confirm(me, id, body?.version)
  }

  @Post('payments/:id/reconcile')
  @ApiOperation({ summary: 'Reconcile payment to plan' })
  @Permissions(PERMISSIONS.PAYMENT_RECONCILE)
  reconcile(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.contracts.reconcile(me, id)
  }
}
