import { Module } from '@nestjs/common'
import { AuthModule } from './modules/auth/auth.module'
import { OrgModule } from './modules/org/org.module'
import { HealthModule } from './modules/health/health.module'
import { PrismaModule } from './common/prisma/prisma.module'
import { SeedModule } from './seed/seed.module'
import { LeadModule } from './modules/lead/lead.module'
import { AccountModule } from './modules/account/account.module'
import { ActivityModule } from './modules/activity/activity.module'
import { OpportunityModule } from './modules/opportunity/opportunity.module'
import { CatalogModule } from './modules/catalog/catalog.module'
import { ContractModule } from './modules/contract/contract.module'
import { WorkflowModule } from './modules/workflow/workflow.module'
import { ReportModule } from './modules/report/report.module'
import { TicketModule } from './modules/ticket/ticket.module'
import { CampaignModule } from './modules/campaign/campaign.module'
import { NotifyModule } from './modules/notify/notify.module'
import { ShareModule } from './modules/share/share.module'
import { ImportModule } from './modules/import/import.module'
import { FileModule } from './modules/file/file.module'
import { SearchModule } from './modules/search/search.module'
import { AiModule } from './modules/ai/ai.module'
import { PlatformModule } from './modules/platform/platform.module'
import { JobsModule } from './modules/jobs/jobs.module'
import { PoolModule } from './modules/pool/pool.module'
import { TemplateModule } from './modules/template/template.module'
import { EnablementModule } from './modules/enablement/enablement.module'
import { CurrencyModule } from './modules/currency/currency.module'
import { ImModule } from './modules/im/im.module'

@Module({
  imports: [
    PrismaModule,
    SeedModule,
    HealthModule,
    AuthModule,
    OrgModule,
    LeadModule,
    AccountModule,
    ActivityModule,
    OpportunityModule,
    CatalogModule,
    ContractModule,
    WorkflowModule,
    ReportModule,
    TicketModule,
    CampaignModule,
    NotifyModule,
    CurrencyModule,
    ImModule,
    ShareModule,
    ImportModule,
    FileModule,
    SearchModule,
    AiModule,
    PlatformModule,
    JobsModule,
    PoolModule,
    TemplateModule,
    EnablementModule,
  ],
})
export class AppModule {}
