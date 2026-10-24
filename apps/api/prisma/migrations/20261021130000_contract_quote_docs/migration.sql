-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VAT_SPECIAL',
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "remark" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractChangeOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "amountDelta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ESignSeal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'COMPANY',
    "party" TEXT NOT NULL DEFAULT 'B',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ESignSeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "accountName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "ownerId" TEXT,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "startDate" TEXT NOT NULL DEFAULT '',
    "endDate" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteShareToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "lines" JSONB NOT NULL,
    "changedById" TEXT,
    "changedByName" TEXT NOT NULL DEFAULT '',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_tenantId_contractId_status_idx" ON "Invoice"("tenantId", "contractId", "status");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_createdAt_idx" ON "Invoice"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractChangeOrder_tenantId_contractId_idx" ON "ContractChangeOrder"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "ContractChangeOrder_tenantId_createdAt_idx" ON "ContractChangeOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ESignSeal_tenantId_createdAt_idx" ON "ESignSeal"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Project_tenantId_deletedAt_createdAt_idx" ON "Project"("tenantId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteShareToken_token_key" ON "QuoteShareToken"("token");

-- CreateIndex
CREATE INDEX "QuoteShareToken_tenantId_quoteId_idx" ON "QuoteShareToken"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteSnapshot_tenantId_quoteId_idx" ON "QuoteSnapshot"("tenantId", "quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSnapshot_quoteId_version_key" ON "QuoteSnapshot"("quoteId", "version");

-- CreateIndex
CREATE INDEX "Quote_tenantId_projectId_idx" ON "Quote"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "Contract_tenantId_projectId_idx" ON "Contract"("tenantId", "projectId");

