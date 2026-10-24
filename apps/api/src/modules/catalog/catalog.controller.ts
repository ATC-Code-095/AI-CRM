import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsArray, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions, Public } from '../../common/decorators'
import { CatalogService } from './catalog.service'

class ProductDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  category?: string

  @IsOptional()
  @IsString()
  unit?: string

  @IsString()
  standardPrice!: string

  @IsOptional()
  @IsString()
  cost?: string

  @IsOptional()
  @IsString()
  taxRate?: string

  @IsOptional()
  isActive?: boolean

  @IsOptional()
  @IsString()
  description?: string
}

class QuoteLineDto {
  @IsString()
  productId!: string

  @IsOptional()
  @IsString()
  name?: string

  @IsString()
  qty!: string

  @IsOptional()
  @IsString()
  unitPrice?: string

  @IsOptional()
  @IsString()
  discountRate?: string
}

class CreateQuoteDto {
  @IsString()
  accountId!: string

  @IsOptional()
  @IsString()
  opportunityId?: string

  @IsString()
  @MinLength(1)
  subject!: string

  @IsOptional()
  @IsString()
  terms?: string

  @IsOptional()
  @IsString()
  projectId?: string

  @IsOptional()
  @IsString()
  projectName?: string

  @IsOptional()
  @IsString()
  remark?: string

  /** 币种（3 位代码）；不填时沿用关联商机的币种，否则为本位币 */
  @IsOptional()
  @IsString()
  currency?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines?: QuoteLineDto[]
}

class ReplaceLinesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[]

  @IsOptional()
  @IsInt()
  version?: number
}

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** 产品套餐：一键加入报价 */
  @Get('product-bundles')
  @Permissions(PERMISSIONS.PRODUCT_READ)
  async bundles(@CurrentUser() me: AuthUser) {
    return this.catalog.bundles(me)
  }

  @Post('contract-templates/:id/file')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async uploadContractTemplateFile(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { fileName: string; fileUrl: string; fileType: string },
  ) {
    return this.catalog.attachTemplateFile(me, 'contract', id, body)
  }

  @Post('quote-templates/:id/file')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async uploadQuoteTemplateFile(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { fileName: string; fileUrl: string; fileType: string },
  ) {
    return this.catalog.attachTemplateFile(me, 'quote', id, body)
  }

  @Post('contract-templates/:id/publish')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async publishContractTemplate(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { published: boolean },
  ) {
    return this.catalog.publishTemplate(me, 'contract', id, !!body.published)
  }

  @Post('quote-templates/:id/publish')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async publishQuoteTemplate(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { published: boolean },
  ) {
    return this.catalog.publishTemplate(me, 'quote', id, !!body.published)
  }

  /** 模板审批流：提交审核 / 通过 / 驳回 */
  @Post('contract-templates/:id/approve')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async approveContractTemplate(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'SUBMIT' | 'APPROVE' | 'REJECT'; note?: string },
  ) {
    return this.catalog.approveTemplate(me, 'contract', id, body.action, body.note)
  }

  @Post('quote-templates/:id/approve')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async approveQuoteTemplate(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { action: 'SUBMIT' | 'APPROVE' | 'REJECT'; note?: string },
  ) {
    return this.catalog.approveTemplate(me, 'quote', id, body.action, body.note)
  }

  @Get('contract-templates/:id/content')
  @Permissions(PERMISSIONS.QUOTE_READ)
  async contractTemplateContent(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.templateContent(me, 'contract', id)
  }

  @Put('contract-templates/:id/content')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async saveContractTemplateContent(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.catalog.saveTemplateContent(me, 'contract', id, body.content)
  }

  @Get('quote-templates/:id/content')
  @Permissions(PERMISSIONS.QUOTE_READ)
  async quoteTemplateContent(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.templateContent(me, 'quote', id)
  }

  @Put('quote-templates/:id/content')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async saveQuoteTemplateContent(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.catalog.saveTemplateContent(me, 'quote', id, body.content)
  }

  @Get('contract-templates')
  @Permissions(PERMISSIONS.QUOTE_READ)
  async contractTemplates(@CurrentUser() me: AuthUser) {
    return this.catalog.contractTemplates(me)
  }

  @Post('contract-templates')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async saveContractTemplate(
    @CurrentUser() me: AuthUser,
    @Body()
    body: {
      name: string
      category?: string
      terms?: string
      defaultDuration?: string
      defaultPayment?: string
    },
  ) {
    return this.catalog.saveContractTemplate(me, body)
  }

  @Delete('contract-templates/:id')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async deleteContractTemplate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.deleteContractTemplate(me, id)
  }

  @Get('quote-templates')
  @Permissions(PERMISSIONS.QUOTE_READ)
  async quoteTemplates(@CurrentUser() me: AuthUser) {
    return this.catalog.quoteTemplates(me)
  }

  @Post('quote-templates')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async saveQuoteTemplate(
    @CurrentUser() me: AuthUser,
    @Body() body: { name: string; description?: string; lines: unknown[] },
  ) {
    return this.catalog.saveQuoteTemplate(me, body as never)
  }

  @Delete('quote-templates/:id')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  async deleteQuoteTemplate(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.deleteQuoteTemplate(me, id)
  }

  @Get('products')
  @Permissions(PERMISSIONS.PRODUCT_READ)
  products(
    @CurrentUser() me: AuthUser,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.catalog.products(me, Number(page), Number(pageSize), q)
  }

  @Post('products')
  @Permissions(PERMISSIONS.PRODUCT_WRITE)
  createProduct(@CurrentUser() me: AuthUser, @Body() dto: ProductDto) {
    return this.catalog.createProduct(me, dto as unknown as Record<string, unknown>)
  }

  @Patch('products/:id')
  @Permissions(PERMISSIONS.PRODUCT_WRITE)
  updateProduct(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: Partial<ProductDto>,
  ) {
    return this.catalog.updateProduct(me, id, dto as unknown as Record<string, unknown>)
  }

  @Get('price-books')
  @Permissions(PERMISSIONS.PRODUCT_READ)
  priceBooks(@CurrentUser() me: AuthUser) {
    return this.catalog.priceBooks(me)
  }

  @Post('products/:id/prices')
  @Permissions(PERMISSIONS.PRODUCT_WRITE)
  upsertPrice(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { priceBookName: string; unitPrice: string; currency?: string },
  ) {
    return this.catalog.upsertPrice(me, id, body)
  }

  @Delete('prices/:id')
  @Permissions(PERMISSIONS.PRODUCT_WRITE)
  removePrice(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.removePrice(me, id)
  }

  @Get('quotes')
  @Permissions(PERMISSIONS.QUOTE_READ)
  quotes(
    @CurrentUser() me: AuthUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('accountId') accountId?: string,
  ) {
    return this.catalog.quotes(me, Number(page), Number(pageSize), accountId)
  }

  @Get('quotes/:id')
  @Permissions(PERMISSIONS.QUOTE_READ)
  quoteDetail(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.quoteDetail(me, id)
  }

  @Get('quotes/:id/history')
  @Permissions(PERMISSIONS.QUOTE_READ)
  quoteHistory(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.quoteHistory(me, id)
  }

  @Post('quotes')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  createQuote(@CurrentUser() me: AuthUser, @Body() dto: CreateQuoteDto) {
    return this.catalog.createQuote(me, dto as unknown as Record<string, unknown>)
  }

  @Put('quotes/:id/lines')
  @Permissions(PERMISSIONS.QUOTE_WRITE)
  replaceLines(@CurrentUser() me: AuthUser, @Param('id') id: string, @Body() dto: ReplaceLinesDto) {
    return this.catalog.replaceLines(
      me,
      id,
      dto.lines as unknown as Array<{
        productId: string
        name?: string
        qty: string
        unitPrice?: string
        discountRate?: string
      }>,
      dto.version,
    )
  }

  @Post('quotes/batch-delete')
  @Permissions(PERMISSIONS.QUOTE_DELETE)
  async batchDeleteQuotes(@CurrentUser() me: AuthUser, @Body() body: { ids: string[] }) {
    return this.catalog.batchDeleteQuotes(me, body.ids ?? [])
  }

  @Post('quotes/:id/submit')
  @Permissions(PERMISSIONS.QUOTE_SUBMIT)
  submit(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.submit(me, id)
  }

  @Post('quotes/:id/email')
  @Permissions(PERMISSIONS.QUOTE_SEND)
  sendQuoteEmail(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() body: { to?: string; note?: string },
  ) {
    return this.catalog.sendQuoteEmail(me, id, body ?? {})
  }

  @Post('quotes/:id/send')
  @Permissions(PERMISSIONS.QUOTE_SEND)
  send(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.send(me, id)
  }

  /** 生成客户分享链接 */
  @Post('quotes/:id/share-link')
  @Permissions(PERMISSIONS.QUOTE_SEND)
  createShareLink(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.createShareLink(me, id)
  }

  /** 客户免登录查看报价 */
  @Public()
  @Get('public/quotes/:token')
  publicQuote(@Param('token') token: string) {
    return this.catalog.publicQuote(token)
  }

  /** 客户免登录确认报价 */
  @Public()
  @Post('public/quotes/:token/accept')
  publicAccept(
    @Param('token') token: string,
    @Body() body: { name?: string; note?: string },
  ) {
    return this.catalog.publicAccept(token, body ?? {})
  }

  @Post('quotes/:id/accept')
  @Permissions(PERMISSIONS.QUOTE_ACCEPT)
  accept(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.accept(me, id)
  }

  @Post('quotes/:id/to-contract')
  @Permissions(PERMISSIONS.CONTRACT_WRITE)
  toContract(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.catalog.toContract(me, id)
  }
}
