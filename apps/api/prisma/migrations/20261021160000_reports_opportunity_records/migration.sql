-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "influence" INTEGER;

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastCommit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "commitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bestAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "worstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityBattlecard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "competitors" TEXT NOT NULL DEFAULT '',
    "stakeholders" TEXT NOT NULL DEFAULT '',
    "winThemes" TEXT NOT NULL DEFAULT '',
    "risks" TEXT NOT NULL DEFAULT '',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "updatedById" TEXT,
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityBattlecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaybookProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT,
    "userId" TEXT,
    "steps" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaybookProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "level" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "HealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHealthReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "report" JSONB NOT NULL,

    CONSTRAINT "SystemHealthReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionPayout_tenantId_periodKey_userId_key" ON "CommissionPayout"("tenantId", "periodKey", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastCommit_tenantId_month_userId_key" ON "ForecastCommit"("tenantId", "month", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityBattlecard_tenantId_opportunityId_key" ON "OpportunityBattlecard"("tenantId", "opportunityId");

-- CreateIndex
CREATE INDEX "PlaybookProgress_tenantId_accountId_idx" ON "PlaybookProgress"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "PlaybookProgress_tenantId_userId_idx" ON "PlaybookProgress"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthSnapshot_tenantId_kind_subjectId_date_key" ON "HealthSnapshot"("tenantId", "kind", "subjectId", "date");

-- CreateIndex
CREATE INDEX "SystemHealthReport_tenantId_generatedAt_idx" ON "SystemHealthReport"("tenantId", "generatedAt");

